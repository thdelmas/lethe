# LETHE launcher architecture — split-app vs native rewrite

Decision doc for [#186](https://github.com/thdelmas/lethe/issues/186). The
WebView-in-system-uid block (Android 7.0+ `WebViewFactory.getProvider`
throws when `Process.myUid() == SYSTEM_UID`, and LETHE's
`sharedUserId="android.uid.system"` makes every process system-UID) has
been resolved on the load-bearing sub-cases (Auto-Wipe via #152, Pair via
#167 / #185). What remains is the architectural call for the four
launcher surfaces still hosted by `LetheActivity`: **chat, mascot, voice,
and theme/lockscreen settings**.

This doc lays out the two routes that have been on the table since #151,
the tradeoffs each commits to, and the open questions that should be
answered before any code lands.

## What we know already

- `LetheActivity.onCreate` instantiates a `WebView` and crash-loops on
  user builds. Trebuchet is the active home launcher on shipping cm-14.1
  ROMs, so the crash is invisible — but every UX path inside
  `LetheActivity` is unreachable.
- The per-screen native pattern has shipped four times now
  (`AutoWipeSettingsActivity`, `PairReceiver`, `PairEntryActivity`,
  `PairScanActivity`). It works fine for forms and one-shot flows.
- The build env is JDK 8 + python2 inside `lethe-cm14-build` docker.
  AIDL toolchain works here — system services already use it.
- The mascot CSS work in `static/mascot.css`, `mascot-3d.css`, and
  `mascot-interact.js` is substantive (CSS 3D transforms, gyroscope
  parallax, eye-gaze tracking, multi-layer composition per
  [mascot-layers.md](mascot-layers.md)) — but currently un-shipped to
  real users because `LetheActivity` cannot start.
- The build pipeline already supports OTAs with multiple system APKs;
  the cm-14.1 packaging flow handles it without changes.

## Route 2 — split-app

### Shape

Two packages, both shipped in the same OTA:

- `lethe-agent` — system UID. Services, receivers, DPM admin,
  `BootReceiver`, `PairReceiver`, the native settings activities.
  No WebView.
- `lethe-launcher` — normal UID. Hosts the WebView and the existing
  `static/launcher.html` / `launcher.css` / `launcher.js`. Owns the
  mascot CSS and JS. Talks to `lethe-agent` via IPC.

IPC layer: either signature-protected Intent broadcasts (cheap,
declarative) or a bound AIDL service exposed by `lethe-agent` (typed,
synchronous return values, lower latency). The AIDL form scales better
once the surface area grows past a handful of calls.

### What ships unchanged

- The entire `static/` HTML/CSS/JS launcher.
- Mascot animation work.
- All existing CSS filter effects (glow, blur), the parallax pipeline,
  eye-gaze tracking via `mascot-interact.js`.

### What needs designing

- **IPC API surface.** Every call `static/launcher.js` makes through
  the existing `NativeLauncher` JS bridge becomes a call on the IPC
  layer. Provider config read/write, wipe schedule, deadman state,
  pair payload merge, agent backend URL, etc.
- **Signing.** Both APKs need the same key for `sharedUserId` to work
  (or explicit signature-protected permission grants if we sign them
  with different keys — see open question 4 below).
- **Crash isolation.** A WebView crash in `lethe-launcher` must not
  take down `lethe-agent`. Two packages → two processes → this is
  free.
- **Version skew.** IPC contract becomes a stability commitment
  between the packages. Need a versioning story for OTAs that ship
  only one of them.
- **Permission model.** Which IPC calls require signature-protected
  permissions vs. just same-UID. (With same-key signing both options
  are available.)

### Cost shape

- Manifest split + second-package skeleton: 1–2 days.
- IPC contract design + implementation: 1–2 weeks depending on call
  count.
- Migration of every existing `NativeLauncher` JS-bridge call onto IPC:
  ~1 week.
- Build system: minor `Lethe.mk` edits, OTA packaging includes both
  APKs.
- Test: IPC failure modes, version skew, replay-attack surface (for
  broadcast-based IPC), `lethe-launcher` crash and restart.

### Pros

- Existing UI work — including the mascot — is preserved verbatim.
- Architecturally cleaner: privileged code is no longer in the same
  process as the WebView attack surface.
- WebView CVEs no longer threaten system UID.
- Future agent-backend swap (e.g. a Rust-agent rewrite) is a
  single-package change; UI is decoupled.
- HTML/CSS iteration stays cheap — design changes don't need a Java
  rebuild.

### Cons

- Two-APK OTA, two signing artifacts to coordinate.
- New IPC surface — auth and replay attacks need careful design and
  review.
- AIDL contract is a stability commitment; breaking it forces matched
  OTAs.
- More moving parts at runtime; more places for bugs to hide.

## Route 3 — native rewrite

### Shape

Single package, system UID, status quo. One native Android Activity per
WebView surface. Continues the pattern already in place:

- `ChatActivity` — conversation panel.
- `MascotSurface` (custom View) embedded where today's mascot DOM lives —
  or `MascotActivity` for full-screen presentation.
- `VoiceActivity` — extends the existing `LetheAssistActivity` scaffold.
- `ThemeActivity` and `LockscreenSettingsActivity` — forms.

### What gets thrown away

- `static/launcher.html`, `launcher.css`, `launcher.js`.
- `static/mascot.css`, `mascot-3d.css`, `mascot-interact.js` — CSS
  3D-transform stack, gyroscope parallax pipeline, eye-gaze tracking,
  particles. ~1500 LOC of animation work.

### What needs designing

- **Chat.** Native conversation panel: `RecyclerView` of messages,
  `EditText` input, send button. Streaming response from the agent on
  `localhost:8080` via a plain `HttpURLConnection` + `InputStream`
  consumer on a background thread. Conversation history persistence in
  `LetheConfig` or a small SQLite-backed table. Probably 400–600 LOC
  including the streaming consumer.
- **Mascot.** The hard one. Native parity means:
  - Custom `View` with `Canvas` drawing the layered SVG-style
    composition (per [mascot-layers.md](mascot-layers.md)).
  - `SensorManager.TYPE_GYROSCOPE` listener feeding parallax tilt.
  - Eye-gaze tracking against touch/motion targets.
  - Glow blur — `BlurMaskFilter` or `RenderEffect`-style; rougher than
    CSS `filter: blur(...)` on hardware-accelerated Chrome.
  - Idle blink + listening/thinking/speaking/alert states (currently
    CSS-class-driven in `mascot.css`).
  - Full parity: 3–4 weeks. Reduced-fidelity "static body + idle
    blink": 1 week.
- **Voice/assist.** The Java `LetheAssistActivity` scaffold already
  exists. Wiring up agent-backend voice streaming into a native list
  + waveform widget: ~1 week.
- **Theme/lockscreen settings.** Forms. Same pattern as
  `AutoWipeSettingsActivity`. ~1 week total.

### Cost shape

- Chat: 1–2 weeks.
- Mascot (full parity): 3–4 weeks. Reduced: 1 week.
- Voice surface: 1 week.
- Theme + lockscreen settings: 1 week combined.
- Remove `LetheActivity` + `static/launcher.*` once everything else
  routes around it.

### Pros

- Matches the established LETHE per-screen native pattern.
- No IPC surface to design, secure, or test.
- Single APK, single signing key, single OTA artifact.
- WebView eventually removable from the LETHE package — smaller attack
  surface, no Chrome-update dependency for the launcher UX.
- No version-skew concerns between UI and agent.

### Cons

- Throws away the existing mascot CSS work — a real artistic regression
  if full parity isn't achieved.
- Every future agent-UI feature costs Java + layout XML, not HTML/CSS.
- Visual polish ceiling capped by Android's `Canvas`/`Drawable`/`View`
  APIs; CSS filters and transforms are richer than the platform
  equivalents on cm-14.1's Android 7.1.
- All UI continues to live in system UID (WebView removed, but
  `LetheConfig` and IPC-less UI still privileged).

## Comparison axes

| Axis | Route 2 (split-app) | Route 3 (native) |
|---|---|---|
| Up-front cost | High (IPC + signing + build) | Medium (per-surface, parallelizable) |
| Steady-state UX iteration cost | Low (HTML/CSS edit) | High (Java + XML) |
| Visual polish ceiling | High (CSS preserved) | Capped by Canvas/View APIs |
| Architectural cleanliness | Higher (UID separation) | Lower (UI in system UID) |
| OTA artifact count | 2 APKs + IPC contract | 1 APK |
| Mascot fidelity risk | None | Real |
| Future agent-backend swap | Easier (loose coupling) | Harder (UI tied to in-process calls) |
| Security review surface | Larger (IPC auth) | Smaller (no IPC) |
| WebView attack surface | Removed from system UID | Removed from package entirely |

## Hybrid worth considering

Pure Route 2 pays the IPC tax for every screen including the simple
ones (theme, lockscreen, future settings panels). Pure Route 3 pays the
mascot-rewrite cost even though the mascot is the single highest-value
piece of existing UI work.

A hybrid: **Route 3 for chat / voice / theme / lockscreen, Route 2 only
for the mascot.** The mascot lives in `lethe-launcher` (normal UID,
WebView, all existing CSS preserved). Everything else is a native
activity in `lethe-agent`. Smaller IPC surface (just "render mascot
state X" + "mascot wants to say Y"), preserves the high-art-investment
work, doesn't pay split-app tax for forms-style screens.

Tradeoff: still pays the new-package + signing cost, just doesn't pay
the per-screen IPC migration cost. Closer to a build-system tax than a
runtime tax.

## Open questions

1. **What does the v1.3+ user-facing flow look like for the mascot?**
   If the mascot is brand identity + a short greeting loop, reduced
   native fidelity is acceptable and Route 3 is fine. If the mascot is
   the differentiating UX — parallax, gaze, glow as core — Route 2 or
   the hybrid preserves work already done.
2. **Is there a planned Rust-agent migration?** #159 referenced a "new
   Rust-agent issue" that hasn't surfaced yet. If the agent backend is
   going to be rewritten, Route 2's loose coupling matters more —
   swapping agent implementations becomes a single-package change.
3. **OTA shape comfort.** Two APKs in a single OTA is mechanically
   fine, but it adds a coordination requirement (matched versions).
   Acceptable?
4. **Signing trust model.** Same-key signing across both APKs is
   simplest (unlocks `sharedUserId` and signature-protected
   permissions). Different keys means launcher CVEs can't compromise
   agent — at the cost of explicit signature-perm grants for every
   IPC call. Is the extra isolation worth the build complexity?
5. **Mascot fidelity floor.** If we go Route 3, what's the minimum
   acceptable mascot? Body + idle blink (1 week) vs full parallax +
   gaze + glow (3–4 weeks) is a 4x cost difference.

## Decision artifact (when a route is picked)

1. Add a short ADR section to this file recording the choice, the
   reasoning, and the alternatives explicitly rejected.
2. File per-surface follow-up issues against #186:
   - Route 2: APK split, IPC contract, signing approach, per-surface
     migration.
   - Route 3: ChatActivity, MascotSurface, VoiceActivity,
     ThemeActivity, LockscreenSettingsActivity.
   - Hybrid: Route-3 issues for the easy surfaces, plus a single
     mascot-split issue for Route 2.
3. Update memory note
   [`project_launcher_webview_blocker.md`](https://github.com/thdelmas/lethe)
   so future sessions don't re-litigate.
