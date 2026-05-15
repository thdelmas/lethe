//! Task-based LLM routing.
//!
//! Parses `providers.yaml` and resolves a task name ("chat", "vision", ...)
//! into an ordered list of (provider, model) candidates based on the
//! task's priority array, which providers are configured, and which
//! local models are on disk.
//!
//! Cloud-provider availability is reported by the frontend, not read
//! from the system. `PlanRequest.configured_cloud` lists the provider
//! names the frontend has keys for; `plan_handler` translates that into
//! a set of `availability_token`s and wraps `SystemEnv` in `OverrideEnv`
//! so resolution treats those providers as gated-open without ever
//! calling `getprop`. The actual cloud keys live in the frontend's
//! config and never reach the agent.
//!
//! `availability_token` values are opaque identifiers — they are
//! join keys between provider entries here and the `key_overrides`
//! set in `OverrideEnv`. They are not system property names.
//!
//! Execution (HTTP forwarding, streaming, fallback-on-error) lives in
//! `llm.rs` (local) and the frontend (cloud). This file is pure-ish
//! config + resolution so it can be unit tested without network, plus
//! a single HTTP endpoint (`POST /v1/route/plan`) that returns an
//! ordered candidate list.

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::path::Path;
use std::sync::Arc;

pub const DEFAULT_CONFIG_PATH: &str = "/system/extras/lethe/providers.yaml";
pub const DEFAULT_MODELS_DIR: &str = "/data/lethe/models";

#[derive(Debug, Deserialize, Clone)]
pub struct RouterConfig {
    #[serde(default)]
    pub providers: BTreeMap<String, Provider>,
    #[serde(default)]
    pub tasks: BTreeMap<String, TaskDef>,
    #[serde(default)]
    pub routing: RoutingOpts,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Provider {
    #[serde(rename = "type")]
    pub kind: String, // "local" | "peer" | "cloud"
    #[serde(default)]
    pub api_format: Option<String>, // "anthropic" | "openai"
    #[serde(default)]
    pub endpoint: Option<String>,
    /// Opaque identifier the frontend echoes back in `configured_cloud`
    /// to mark this provider as available. Not a system property name.
    #[serde(default)]
    pub availability_token: Option<String>,
    #[serde(default)]
    pub requires_api_key: bool,
    #[serde(default)]
    pub extra_headers: BTreeMap<String, String>,
    #[serde(default)]
    pub models: Vec<Model>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Model {
    pub id: String,
    #[serde(default)]
    pub file: Option<String>,
    #[serde(default)]
    pub tasks: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TaskDef {
    #[serde(default)]
    pub priority: Vec<String>,
    #[serde(default)]
    pub required_models: Vec<String>,
    #[serde(default)]
    pub fallback_message: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct RoutingOpts {
    /// Order in which to try cloud providers when a priority entry is "cloud".
    /// Defaults to ["anthropic", "openrouter"] if absent.
    #[serde(default)]
    pub cloud_order: Vec<String>,
}

/// A resolved candidate: which provider to hit, and which of its models
/// to request. Execution layer turns this into an HTTP call.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Candidate {
    pub provider: String,
    pub model: String,
}

/// Probes the environment so resolution can be tested without FS / getprop.
pub trait Env {
    /// Returns Some(value) if the secure/system setting is set to a non-empty string.
    fn getprop(&self, key: &str) -> Option<String>;
    /// Returns true if a local model file exists and is readable.
    fn local_model_present(&self, file: &str) -> bool;
    /// Returns true if peer inference is enabled by the user.
    fn peer_enabled(&self) -> bool;
}

pub struct SystemEnv {
    pub models_dir: String,
}

impl SystemEnv {
    pub fn new() -> Self {
        Self { models_dir: DEFAULT_MODELS_DIR.into() }
    }
}

impl Env for SystemEnv {
    fn getprop(&self, key: &str) -> Option<String> {
        // Prefer Android getprop; fall back to env var LETHE_<UPPER_UNDERSCORED>.
        if let Ok(out) = std::process::Command::new("getprop").arg(key).output() {
            let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !v.is_empty() {
                return Some(v);
            }
        }
        let envkey = format!(
            "LETHE_{}",
            key.trim_start_matches("persist.lethe.").replace('.', "_").to_uppercase()
        );
        std::env::var(envkey).ok().filter(|s| !s.is_empty())
    }

    fn local_model_present(&self, file: &str) -> bool {
        Path::new(&self.models_dir).join(file).exists()
    }

    fn peer_enabled(&self) -> bool {
        self.getprop("persist.lethe.p2p.enabled")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
    }
}

impl RouterConfig {
    pub fn load(path: &str) -> Result<Self, String> {
        let text = std::fs::read_to_string(path)
            .map_err(|e| format!("read {path}: {e}"))?;
        serde_yaml::from_str(&text).map_err(|e| format!("parse {path}: {e}"))
    }

    /// Resolve a task to an ordered list of candidates. Unknown task ⇒
    /// treat as "chat" so UI typos never 500. Empty result means nothing
    /// is configured and the caller should surface `fallback_message`.
    pub fn resolve<E: Env>(&self, task: &str, env: &E) -> Vec<Candidate> {
        let (task, task_def) = match self.tasks.get(task) {
            Some(t) => (task, t),
            None => match self.tasks.get("chat") {
                Some(t) => ("chat", t),
                None => return vec![],
            },
        };

        let required: &[String] = &task_def.required_models;
        let cloud_order = if self.routing.cloud_order.is_empty() {
            vec!["anthropic".into(), "openrouter".into()]
        } else {
            self.routing.cloud_order.clone()
        };

        let mut out = Vec::new();
        for entry in &task_def.priority {
            if entry == "cloud" {
                for name in &cloud_order {
                    self.extend_from_provider(name, task, required, env, &mut out);
                }
            } else {
                self.extend_from_provider(entry, task, required, env, &mut out);
            }
        }
        out
    }

    fn extend_from_provider<E: Env>(
        &self,
        name: &str,
        task: &str,
        required: &[String],
        env: &E,
        out: &mut Vec<Candidate>,
    ) {
        let Some(p) = self.providers.get(name) else { return };

        // Availability gate.
        match p.kind.as_str() {
            "cloud" => {
                let Some(token) = &p.availability_token else { return };
                if env.getprop(token).is_none() {
                    return;
                }
            }
            "peer" => {
                if !env.peer_enabled() {
                    return;
                }
            }
            "local" => {}
            _ => return,
        }

        // Pick models that handle this task. For local, also require the
        // file to be present on disk. Honor `required_models` if set:
        // the model id must appear in that list.
        let candidates = p.models.iter().filter(|m| {
            let handles = m.tasks.iter().any(|t| t == task);
            let allowed = required.is_empty() || required.iter().any(|r| r == &m.id);
            let on_disk = if p.kind == "local" {
                m.file.as_deref().map(|f| env.local_model_present(f)).unwrap_or(false)
            } else {
                true
            };
            handles && allowed && on_disk
        });

        for m in candidates {
            out.push(Candidate { provider: name.into(), model: m.id.clone() });
        }
    }

    pub fn fallback_message(&self, task: &str) -> Option<&str> {
        self.tasks
            .get(task)
            .and_then(|t| t.fallback_message.as_deref())
    }
}

// ── HTTP plan endpoint ──────────────────────────────────────────────

pub struct RouterState {
    pub config: RouterConfig,
    pub system_env: SystemEnv,
}

impl RouterState {
    /// Loads config from DEFAULT_CONFIG_PATH, falling back to an empty
    /// config if the file is missing (so the agent still starts on
    /// dev machines or before overlays are applied).
    pub fn load_or_empty() -> Arc<Self> {
        let config = RouterConfig::load(DEFAULT_CONFIG_PATH).unwrap_or_else(|e| {
            eprintln!("router: {e} — starting with empty router config");
            RouterConfig {
                providers: BTreeMap::new(),
                tasks: BTreeMap::new(),
                routing: RoutingOpts::default(),
            }
        });
        Arc::new(Self { config, system_env: SystemEnv::new() })
    }
}

#[derive(Debug, Deserialize)]
pub struct PlanRequest {
    pub task: String,
    /// Cloud provider names the frontend has keys for. The agent trusts
    /// this claim for planning purposes — it does not (yet) read the
    /// actual keys.
    #[serde(default)]
    pub configured_cloud: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct PlanCandidate {
    pub provider: String,
    pub model: String,
    pub format: String,
    pub endpoint: String,
    pub extra_headers: BTreeMap<String, String>,
}

#[derive(Debug, Serialize)]
pub struct PlanResponse {
    pub candidates: Vec<PlanCandidate>,
    pub fallback_message: Option<String>,
}

/// Env that wraps SystemEnv but treats a fixed set of availability
/// tokens as present. Used for plan requests where the frontend reports
/// which cloud providers it has keys for.
struct OverrideEnv<'a> {
    inner: &'a SystemEnv,
    key_overrides: HashSet<String>,
}

impl<'a> Env for OverrideEnv<'a> {
    fn getprop(&self, key: &str) -> Option<String> {
        if self.key_overrides.contains(key) {
            return Some("<frontend-configured>".into());
        }
        self.inner.getprop(key)
    }
    fn local_model_present(&self, file: &str) -> bool {
        self.inner.local_model_present(file)
    }
    fn peer_enabled(&self) -> bool {
        self.inner.peer_enabled()
    }
}

async fn plan_handler(
    State(state): State<Arc<RouterState>>,
    Json(req): Json<PlanRequest>,
) -> Json<PlanResponse> {
    let mut key_overrides = HashSet::new();
    for name in &req.configured_cloud {
        if let Some(p) = state.config.providers.get(name) {
            if let Some(t) = &p.availability_token {
                key_overrides.insert(t.clone());
            }
        }
    }
    let env = OverrideEnv { inner: &state.system_env, key_overrides };
    let cands = state.config.resolve(&req.task, &env);

    let candidates = cands
        .into_iter()
        .map(|c| {
            let p = state.config.providers.get(&c.provider);
            let (format, endpoint, extra_headers) = match p {
                Some(p) => (
                    p.api_format.clone().unwrap_or_else(|| {
                        if p.kind == "local" { "local".into() } else { "openai".into() }
                    }),
                    p.endpoint.clone().unwrap_or_default(),
                    p.extra_headers.clone(),
                ),
                None => (String::new(), String::new(), BTreeMap::new()),
            };
            PlanCandidate { provider: c.provider, model: c.model, format, endpoint, extra_headers }
        })
        .collect();

    Json(PlanResponse {
        candidates,
        fallback_message: state.config.fallback_message(&req.task).map(String::from),
    })
}

pub fn router() -> Router<Arc<RouterState>> {
    Router::new().route("/v1/route/plan", post(plan_handler))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    struct FakeEnv {
        props: BTreeMap<String, String>,
        files: HashSet<String>,
        peer: bool,
    }
    impl FakeEnv {
        fn new() -> Self {
            Self { props: BTreeMap::new(), files: HashSet::new(), peer: false }
        }
    }
    impl Env for FakeEnv {
        fn getprop(&self, key: &str) -> Option<String> {
            self.props.get(key).cloned()
        }
        fn local_model_present(&self, file: &str) -> bool {
            self.files.contains(file)
        }
        fn peer_enabled(&self) -> bool {
            self.peer
        }
    }

    fn cfg() -> RouterConfig {
        let yaml = r#"
providers:
  local:
    type: local
    models:
      - { id: qwen3-0.6b, file: qwen3-0.6b-q4_k_m.gguf, tasks: [chat] }
      - { id: qwen3-3b,  file: qwen3-3b-q4_k_m.gguf,  tasks: [chat, code, reasoning] }
  peer:
    type: peer
  anthropic:
    type: cloud
    api_format: anthropic
    endpoint: https://api.anthropic.com
    requires_api_key: true
    availability_token: anth
    models:
      - { id: claude-opus-4-6, tasks: [chat, code, reasoning, vision] }
  openrouter:
    type: cloud
    api_format: openai
    endpoint: https://openrouter.ai/api/v1
    requires_api_key: true
    availability_token: or
    models:
      - { id: google/gemini-2.5-pro, tasks: [chat, vision] }
tasks:
  chat:
    priority: [local, peer, cloud]
    fallback_message: "nothing configured"
  reasoning:
    priority: [cloud]
    required_models: [claude-opus-4-6]
    fallback_message: "needs cloud"
  code:
    priority: [peer, cloud, local]
    required_models: [claude-opus-4-6, qwen3-3b]
"#;
        serde_yaml::from_str(yaml).expect("test cfg parses")
    }

    #[test]
    fn empty_env_yields_nothing_for_chat() {
        let c = cfg();
        let e = FakeEnv::new();
        assert!(c.resolve("chat", &e).is_empty());
    }

    #[test]
    fn local_appears_only_when_file_on_disk() {
        let c = cfg();
        let mut e = FakeEnv::new();
        e.files.insert("qwen3-0.6b-q4_k_m.gguf".into());
        let r = c.resolve("chat", &e);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0], Candidate { provider: "local".into(), model: "qwen3-0.6b".into() });
    }

    #[test]
    fn peer_requires_opt_in() {
        let c = cfg();
        let mut e = FakeEnv::new();
        e.peer = true;
        // peer provider has no models → still nothing for chat
        assert!(c.resolve("chat", &e).is_empty());
    }

    #[test]
    fn cloud_expands_to_anthropic_then_openrouter() {
        let c = cfg();
        let mut e = FakeEnv::new();
        e.props.insert("anth".into(), "<configured>".into());
        e.props.insert("or".into(), "<configured>".into());
        let r = c.resolve("chat", &e);
        let names: Vec<_> = r.iter().map(|c| c.provider.as_str()).collect();
        assert_eq!(names, vec!["anthropic", "openrouter"]);
    }

    #[test]
    fn priority_order_respected() {
        let c = cfg();
        let mut e = FakeEnv::new();
        e.files.insert("qwen3-3b-q4_k_m.gguf".into());
        e.props.insert("anth".into(), "<configured>".into());
        // code: [peer, cloud, local]. peer has no models → cloud first, then local.
        let r = c.resolve("code", &e);
        let names: Vec<_> = r.iter().map(|c| c.provider.as_str()).collect();
        assert_eq!(names, vec!["anthropic", "local"]);
    }

    #[test]
    fn required_models_filters() {
        let c = cfg();
        let mut e = FakeEnv::new();
        e.files.insert("qwen3-0.6b-q4_k_m.gguf".into()); // 0.6b doesn't do reasoning
        e.props.insert("anth".into(), "<configured>".into());
        // reasoning requires claude-opus-4-6 and local has no reasoning model anyway
        let r = c.resolve("reasoning", &e);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].model, "claude-opus-4-6");
    }

    #[test]
    fn unknown_task_falls_through_to_chat() {
        let c = cfg();
        let mut e = FakeEnv::new();
        e.files.insert("qwen3-0.6b-q4_k_m.gguf".into());
        let r = c.resolve("banana", &e);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].provider, "local");
    }

    #[test]
    fn fallback_message_lookup() {
        let c = cfg();
        assert_eq!(c.fallback_message("reasoning"), Some("needs cloud"));
        assert_eq!(c.fallback_message("nonexistent"), None);
    }

    // ── plan_handler integration ────────────────────────────────────
    // Exercises the OverrideEnv wiring end-to-end: no sysprop is set
    // for the availability tokens (test host has no `getprop`), so the
    // only reason a cloud provider can appear in the response is that
    // `configured_cloud` was populated. SystemEnv's env-var fallback
    // is keyed on `LETHE_<UPPER>`; the test tokens (`anth`, `or`) are
    // unlikely to collide with anything in a dev shell.

    fn router_state() -> Arc<RouterState> {
        Arc::new(RouterState { config: cfg(), system_env: SystemEnv::new() })
    }

    #[tokio::test]
    async fn plan_handler_treats_configured_cloud_as_available() {
        let req = PlanRequest {
            task: "chat".into(),
            configured_cloud: vec!["anthropic".into()],
        };
        let Json(resp) = plan_handler(State(router_state()), Json(req)).await;

        let names: Vec<&str> = resp.candidates.iter().map(|c| c.provider.as_str()).collect();
        assert!(names.contains(&"anthropic"), "expected anthropic in {names:?}");
        assert!(!names.contains(&"openrouter"), "openrouter not configured: {names:?}");

        let anth = resp.candidates.iter().find(|c| c.provider == "anthropic").unwrap();
        assert_eq!(anth.format, "anthropic");
        assert_eq!(anth.endpoint, "https://api.anthropic.com");
        assert_eq!(anth.model, "claude-opus-4-6");
    }

    #[tokio::test]
    async fn plan_handler_omits_unconfigured_cloud() {
        let req = PlanRequest { task: "chat".into(), configured_cloud: vec![] };
        let Json(resp) = plan_handler(State(router_state()), Json(req)).await;

        let names: Vec<&str> = resp.candidates.iter().map(|c| c.provider.as_str()).collect();
        assert!(!names.contains(&"anthropic"), "anthropic shouldn't appear: {names:?}");
        assert!(!names.contains(&"openrouter"), "openrouter shouldn't appear: {names:?}");
        assert_eq!(resp.fallback_message.as_deref(), Some("nothing configured"));
    }

    #[tokio::test]
    async fn plan_handler_unknown_provider_in_configured_cloud_is_ignored() {
        // Frontend may send a name the agent doesn't know about (stale
        // providers.yaml on either side). Don't 500 — just skip it.
        let req = PlanRequest {
            task: "chat".into(),
            configured_cloud: vec!["bogus".into(), "anthropic".into()],
        };
        let Json(resp) = plan_handler(State(router_state()), Json(req)).await;

        let names: Vec<&str> = resp.candidates.iter().map(|c| c.provider.as_str()).collect();
        assert!(names.contains(&"anthropic"));
    }
}
