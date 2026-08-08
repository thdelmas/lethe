use axum::extract::Multipart;
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::routing::post;
use axum::{Json, Router};
use tokio::process::Command;

const WHISPER_BIN: &str = "/system/extras/lethe/bin/whisper-cpp";
const WHISPER_MODEL: &str = "/data/lethe/models/ggml-tiny.bin";
const SHERPA_BIN: &str = "/system/extras/lethe/bin/sherpa-onnx-offline";
const SHERPA_MODEL_DIR: &str = "/data/lethe/models/sherpa-onnx";
const PIPER_BIN: &str = "/system/extras/lethe/bin/piper";
const PIPER_MODEL: &str = "/data/lethe/models/piper/voice.onnx";
const SHERPA_TTS_BIN: &str = "/system/extras/lethe/bin/sherpa-onnx-offline-tts";
const SHERPA_TTS_MODEL_DIR: &str = "/data/lethe/models/sherpa-onnx-tts";
const TMP_AUDIO: &str = "/data/local/tmp/lethe-audio";

/// Engine paths are env-overridable (same pattern as LETHE_ORGANS_*)
/// so a sideloaded daemon on a diag build can point at engines in
/// /data/local/tmp without a system image rebuild.
fn env_or(var: &str, default: &str) -> String {
    std::env::var(var).unwrap_or_else(|_| default.to_string())
}

/// POST /v1/audio/transcriptions — OpenAI-compatible STT endpoint.
/// Accepts multipart form with audio file. Tries sherpa-onnx first,
/// falls back to whisper.cpp.
async fn transcribe(mut multipart: Multipart) -> Json<serde_json::Value> {
    // Extract audio file from multipart
    let mut audio_data: Option<Vec<u8>> = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            if let Ok(bytes) = field.bytes().await {
                audio_data = Some(bytes.to_vec());
            }
        }
    }

    let data = match audio_data {
        Some(d) if !d.is_empty() => d,
        _ => {
            return Json(serde_json::json!({
                "error": "No audio file in request"
            }));
        }
    };

    // Write audio to temp file
    let tmp = env_or("LETHE_AUDIO_TMP", TMP_AUDIO);
    let input_path = format!("{tmp}.webm");
    let wav_path = format!("{tmp}.wav");
    if let Err(e) = tokio::fs::write(&input_path, &data).await {
        return Json(serde_json::json!({ "error": format!("write tmp: {e}") }));
    }

    // Convert to WAV (16kHz mono) — required by both engines
    let ffmpeg = Command::new("ffmpeg")
        .args(["-y", "-i", &input_path, "-ar", "16000", "-ac", "1", &wav_path])
        .output()
        .await;

    if ffmpeg.is_err() || !ffmpeg.as_ref().unwrap().status.success() {
        // Try sox as fallback
        let sox = Command::new("sox")
            .args([&input_path, "-r", "16000", "-c", "1", &wav_path])
            .output()
            .await;
        if sox.is_err() || !sox.as_ref().unwrap().status.success() {
            let _ = tokio::fs::remove_file(&input_path).await;
            return Json(serde_json::json!({
                "error": "Cannot convert audio to WAV (need ffmpeg or sox)"
            }));
        }
    }
    let _ = tokio::fs::remove_file(&input_path).await;

    // Try sherpa-onnx first (faster, lower memory)
    let text = try_sherpa(&wav_path)
        .await
        .or_else(|| try_whisper_blocking(&wav_path));

    let _ = tokio::fs::remove_file(&wav_path).await;

    match text {
        Some(t) => Json(serde_json::json!({ "text": t.trim() })),
        None => Json(serde_json::json!({
            "error": "No STT engine available (need sherpa-onnx or whisper.cpp)"
        })),
    }
}

async fn try_sherpa(wav_path: &str) -> Option<String> {
    let model_dir = env_or("LETHE_SHERPA_MODEL_DIR", SHERPA_MODEL_DIR);
    let output = Command::new(env_or("LETHE_SHERPA_BIN", SHERPA_BIN))
        .arg(format!("--tokens={model_dir}/tokens.txt"))
        .arg(format!("--encoder={model_dir}/encoder.onnx"))
        .arg(format!("--decoder={model_dir}/decoder.onnx"))
        .arg(format!("--joiner={model_dir}/joiner.onnx"))
        .arg(wav_path)
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    // sherpa-onnx outputs transcription after the filename line
    stdout
        .lines()
        .find(|l| !l.starts_with('/') && !l.is_empty())
        .map(|l| l.to_string())
}

fn try_whisper_blocking(wav_path: &str) -> Option<String> {
    let output = std::process::Command::new(env_or("LETHE_WHISPER_BIN", WHISPER_BIN))
        .args([
            "-m",
            &env_or("LETHE_WHISPER_MODEL", WHISPER_MODEL),
            "-f",
            wav_path,
            "--no-timestamps",
            "-nt",
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    Some(text.trim().to_string())
}

#[derive(serde::Deserialize)]
struct SpeechRequest {
    input: String,
    /// Optional path to a piper voice model — the app's voice picker
    /// passes this; absent means the default voice.
    #[serde(default)]
    voice: Option<String>,
}

/// POST /v1/audio/speech — OpenAI-compatible TTS endpoint. Tries piper,
/// falls back to sherpa-onnx (which also runs piper .onnx voices and is
/// the easier Android cross-compile). Returns audio/wav. The voice
/// model is the avatar's voice (docs/design/voice-io.md — identity,
/// chosen once).
async fn speak(Json(req): Json<SpeechRequest>) -> axum::response::Response {
    let text = req.input.trim().to_string();
    if text.is_empty() {
        return (StatusCode::BAD_REQUEST, "empty input").into_response();
    }
    let voice = req.voice.filter(|v| !v.is_empty());
    let out_path = format!("{}-tts.wav", env_or("LETHE_AUDIO_TMP", TMP_AUDIO));

    let ok = try_piper(&text, voice.as_deref(), &out_path).await
        || try_sherpa_tts(&text, voice.as_deref(), &out_path).await;

    let wav = if ok { tokio::fs::read(&out_path).await.ok() } else { None };
    let _ = tokio::fs::remove_file(&out_path).await;

    match wav {
        Some(bytes) if !bytes.is_empty() => {
            ([(header::CONTENT_TYPE, "audio/wav")], bytes).into_response()
        }
        _ => (
            StatusCode::SERVICE_UNAVAILABLE,
            "No TTS engine available (need piper or sherpa-onnx-offline-tts)",
        )
            .into_response(),
    }
}

/// Text on stdin, WAV to --output_file.
async fn try_piper(text: &str, voice: Option<&str>, out_path: &str) -> bool {
    let model =
        voice.map(str::to_string).unwrap_or_else(|| env_or("LETHE_PIPER_MODEL", PIPER_MODEL));
    let mut child = match Command::new(env_or("LETHE_PIPER_BIN", PIPER_BIN))
        .args(["--model", &model, "--output_file", out_path])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        let _ = stdin.write_all(text.as_bytes()).await;
    }
    matches!(child.wait().await, Ok(s) if s.success())
}

/// Model dir holds model.onnx + tokens.txt + espeak-ng-data/.
async fn try_sherpa_tts(text: &str, voice: Option<&str>, out_path: &str) -> bool {
    let dir = voice
        .map(str::to_string)
        .unwrap_or_else(|| env_or("LETHE_SHERPA_TTS_MODEL_DIR", SHERPA_TTS_MODEL_DIR));
    let status = Command::new(env_or("LETHE_SHERPA_TTS_BIN", SHERPA_TTS_BIN))
        .arg(format!("--vits-model={dir}/model.onnx"))
        .arg(format!("--vits-tokens={dir}/tokens.txt"))
        .arg(format!("--vits-data-dir={dir}/espeak-ng-data"))
        .arg(format!("--output-filename={out_path}"))
        .arg(text)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await;
    matches!(status, Ok(s) if s.success())
}

pub fn router() -> Router {
    Router::new()
        .route("/v1/audio/transcriptions", post(transcribe))
        .route("/v1/audio/speech", post(speak))
}
