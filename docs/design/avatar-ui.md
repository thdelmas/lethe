# The avatar UI — the phone's humanoid appearance

State as of 2026-08-07. This is the **doctrine** doc: what the avatar is,
where the user meets it, and what each gesture means. For how it is
rendered, paced and tuned, see [mascot-sprites.md](mascot-sprites.md).
For why these surfaces are native rather than WebView, see
[launcher-architecture-routes.md](launcher-architecture-routes.md) — this
doc answers that one's open question 1.

## The frame

Four decisions, taken 2026-08-07. Everything below follows from them:

1. **The avatar is the phone's humanoid appearance.** Not a mascot in
   the branding sense, not an assistant character bolted onto a normal
   UI — it is what the device looks like when you look at it.
2. **The avatar is home.** It is the default home surface, and the
   legacy Android UI stays available as a user choice.
3. **Tap = agentic mode.** Tapping is how the user opens interaction
   with the agent. (Tap-cycles-through-states is a *test harness*, not
   the interaction model — see the `tap=cycle` gate below.)
4. **Colour is a free signal.** It can carry meaning alone or combined
   with animation, and the mapping is a design call rather than a fixed
   requirement. The doctrine chosen for it is below.

## Surfaces

Every surface builds its view through `MascotViews.create()`, which
picks live Filament render → sprite strips → Canvas guardian. One look
everywhere; adding a surface must not add a second look.

| Surface | Host | Role |
|---|---|---|
| Home | `LauncherActivity` | the phone at rest — avatar + clock, nothing else |
| Lock screen | `KeyguardMascotService` | the phone before you are known to it |
| Full-screen | `MascotActivity` | the avatar alone; dev/demo entry, `lethe.intent.MASCOT` |

### Home — the Void launcher

`LauncherActivity` registers `CATEGORY_HOME`: full-screen avatar, thin
clock and date, no icons, no widgets, no search.

Gesture grammar:

| Gesture | Meaning |
|---|---|
| tap | agentic mode (`ChatActivity`) |
| swipe up | app drawer — text-only alphabetical list, no icons |
| back / home | close the drawer |

**Legacy UI escape hatch.** Because the launcher is a normal
`CATEGORY_HOME` activity, Android's own default-launcher chooser offers
LETHE Home vs Trebuchet. No custom setting, no bespoke switch — the
stock UX is one system toggle away, which is the point of decision 2.

Mechanics worth knowing before touching this:

- **`adb install -r` clears the HOME role.** After any reinstall the
  chooser reappears on the next home press. Re-set it with
  `adb shell cmd role add-role-holder --user 0 android.app.role.HOME org.osmosis.lethe.agent`.
- **The mascot `SurfaceView` is `setZOrderOnTop`** — it composites over
  every sibling view, so a covering view cannot hide it. The drawer sets
  the mascot `INVISIBLE` while open. Not `GONE`: that detaches the view
  and tears down the Filament engine, making reopen expensive.
- A stale home task from a previous launcher can survive reinstall
  cycles and catch the first post-unlock resume. Press home once. Not a
  defect — check the HOME role holder before diagnosing.

### Lock screen

`TYPE_KEYGUARD_DIALOG` window (`INTERNAL_SYSTEM_WINDOW` via the platform
signature, no SystemUI patch). Gate:
`persist.lethe.mascot.keyguard`. Geometry and lifecycle details are in
[mascot-sprites.md](mascot-sprites.md).

- **Tap or fling-up on the avatar starts the unlock flow** — the bouncer
  appears, or the device unlocks straight through when unsecured or
  trusted. The avatar hides first so it never covers the PIN pad.
- Touches *outside* the avatar keep the older behaviour: hide, then
  return after a quiet period (`persist.lethe.mascot.kg.reshow`). Greet,
  then get out of the way.
- Cancelling the bouncer returns to the keyguard and the avatar comes
  back.

The unlock call must go through
`IWindowManager.dismissKeyguard()` — see the dead ends section.

### Full-screen

`MascotActivity`, reachable as `lethe.intent.MASCOT` and from the
drawer as "LETHE Guardian". Tap opens chat; long-press cycles the states
for visual checks.

`persist.lethe.mascot.tap=cycle` turns *tap* into the state-cycler too
(chat unreachable while set, and the tap one-shot is suppressed so it
does not fight the state clip). This is a **test harness** for state and
colour work — it is not the interaction model of decision 3.

## Colour and animation doctrine

Two orthogonal channels. This is the mapping chosen under decision 4:

- **Colour = how the phone *is*.** A small vital scale, not a mood ring:
  nominal, needs-attention, alarm, night/resting, agentic-session-live.
- **Animation = what the phone is *doing*.** Listening, thinking,
  greeting, walking.

They combine freely and never encode the same thing twice — an
amber listening avatar reads "I hear you, and something also wants your
attention." One meaning per channel is the rule that keeps the avatar
legible as it gains states.

**Implementation status: shipped 2026-08-07.** The channels are
genuinely separate — `MascotStateController` owns the colour channel and
`MascotViews.setState` owns behaviour, and neither touches the other.
Verified on device: cycling behaviour through listening → thinking →
speaking left the colour fixed and emitted no vital change at all.

Tint knobs (`persist.lethe.mascot.tint*`), the desaturate → luminance-
normalize formula and its tuned defaults live in
[mascot-sprites.md](mascot-sprites.md). Two rulings are baked into those
defaults and should not be silently re-litigated:

- **No emissive by default.** Glow washes the model into a flat coloured
  light; the state colour must read as coloured *stone* under real
  shading.
- **No raw multiply.** Multiplying a dark albedo by a saturated colour
  crushes the model to near-black and makes the moss indistinguishable
  from the stone.

## What drives the colour — `MascotStateController`

Shipped 2026-08-07. One arbiter resolves a single vital from the
device's own condition, so the avatar reflects the phone rather than
being puppeted. Behaviour still comes from explicit
`MascotViews.setState` calls.

**Inputs are permission-free by construction** — every one is a sticky
broadcast, a world-readable setting, or a system property. The avatar
must never become the reason this OS holds a permission it would
otherwise refuse.

| Vital | Wins when | Colour |
|---|---|---|
| `alarm` | `init.svc.lethe_tor` is configured but not running — the advertised privacy guarantee is not being kept | red |
| `attention` | battery ≤15% and not charging | amber |
| `session` | an agentic session is open (`ChatActivity` foreground) | teal |
| `resting` | 23:00–06:00 | violet |
| `nominal` | otherwise | green |

Priority runs top to bottom: a broken guarantee outranks a request for
attention, which outranks a live session, which outranks rest.
**Airplane mode is deliberately not a vital** — being offline is a
normal state for this OS, not a fault.

Refresh cadence: broadcast-driven inputs (battery, screen-on, airplane)
apply immediately; polled ones (tor, the night boundary, and the force
prop below) land on the next `ACTION_TIME_TICK`, so **up to 60 s**. Vitals
are a mood, not a real-time alarm, so this is deliberate — but it will
surprise you when testing, so poll the log rather than sleeping a
couple of seconds.

Gates:

- `persist.lethe.mascot.vitals=false` — pin to nominal.
- `persist.lethe.mascot.vital.force=<vital>` — force one, for checking
  the palette without draining the battery or killing tor.
- `persist.lethe.mascot.tint.<vital>=RRGGBB` — per-vital colour.

Receivers register only while a view is listening, so an avatar nobody
can see costs no wakeups.

**Not yet wired:** notifications (needs a `NotificationListenerService`
— `LetheNotificationService` only posts, it does not listen), the mic,
and the agent daemon's thinking/speaking states. The daemon in
particular has nothing to say yet: it restart-loops
(`cannot setexeccon('u:r:lethe:s0')`) until the sepolicy domain is
reworked — see port fix 9 in
[bramble-modern-port-notes.md](../release/bramble-modern-port-notes.md).

## Roadmap

| # | Step | Status |
|---|---|---|
| 1 | Void launcher — avatar as home | shipped 2026-08-07 (`251e414`) |
| 1b | Lock-screen tap → unlock flow | shipped 2026-08-07 (`ef500a5`) |
| 2 | `MascotStateController` — vitals drive the avatar | shipped 2026-08-07 |
| 2b | Remaining inputs: notifications, mic, agent daemon | blocked on sepolicy (port fix 9) + a listener service |
| 3 | Clip cross-fades (~300 ms) so states stop hard-cutting | shipped 2026-08-07 |
| 4 | Two-material GLB re-author → colour in the cracks only | shipped 2026-08-07 |

Step 4 shipped as a **crack shell**, not a mesh split. The 23 meshes are body
parts sharing one albedo atlas and one UV set, and the cracks are painted into
that texture rather than modelled — so no split of the existing geometry can
isolate them. Instead every mesh is duplicated, pushed out along its normals by
0.0008, and given a second material that is opaque only on crack pixels;
`applyTint` then tints that material alone and the stone keeps its authored
albedo. Pipeline, costs and re-author gotchas:
[tools/mascot-shell/README.md](../../tools/mascot-shell/README.md).

The cost is real and was taken deliberately: 23→46 meshes, ~24.6k→~49k
triangles, 12.5→20.5 MB. The 15 fps cap is what keeps that inside the power
envelope — do not raise it for this asset.

Note the colour now reads as tinted *stone in the veins*, not glow: the shell
is tinted through `baseColorFactor`, so the 07-08 "no emissive" ruling still
holds and `tint.emissive` stays 0.

Shipping any of this to a real (enforcing) build still sits behind the
standing gates — sepolicy domain, agent binary mode, tor labelling, and
the slot-A counter-test. UI iteration on the bramble diag build does not
touch them.

## Dead ends — do not retry

- **`KeyguardManager.requestDismissKeyguard` from a service.** It is
  activity-scoped and fails immediately with `onDismissError` unless the
  requesting activity is *already visible over the keyguard*. A service
  has no such activity, and a transparent trampoline activity launched
  into the avatar's task inherits that task's hidden-behind-keyguard
  visibility (`isVisible=false`, measured 2026-08-07 — the bouncer never
  appeared, the activity finished ~50 ms after display). Use
  `WindowManagerGlobal.getWindowManagerService().dismissKeyguard(cb, msg)`.
  It needs `android.permission.CONTROL_KEYGUARD`, which is plain
  `signature` — **not** `signature|privileged` — so the platform key
  grants it and it needs no `privapp-permissions-*.xml` entry. Adding one
  there unnecessarily risks a boot abort.
- **Hiding the mascot behind another view.** See `setZOrderOnTop` above.

## Known gaps

- A long notification stack can overlap the lock-screen avatar; the
  window height is fixed and does not track the stack.
- The drawer is unfiltered and unsearchable by design; if the app count
  grows this may need revisiting without importing a launcher's worth of
  UI.
