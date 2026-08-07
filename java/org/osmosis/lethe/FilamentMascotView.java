package org.osmosis.lethe;

import android.content.Context;
import android.graphics.PixelFormat;
import android.provider.Settings;
import android.util.Log;
import android.view.Choreographer;
import android.view.MotionEvent;
import android.view.Surface;
import android.view.SurfaceView;

import com.google.android.filament.Camera;
import com.google.android.filament.Engine;
import com.google.android.filament.EntityManager;
import com.google.android.filament.Filament;
import com.google.android.filament.LightManager;
import com.google.android.filament.MaterialInstance;
import com.google.android.filament.RenderableManager;
import com.google.android.filament.Renderer;
import com.google.android.filament.Scene;
import com.google.android.filament.SwapChain;
import com.google.android.filament.TransformManager;
import com.google.android.filament.View;
import com.google.android.filament.Viewport;
import com.google.android.filament.android.UiHelper;
import com.google.android.filament.gltfio.Animator;
import com.google.android.filament.gltfio.AssetLoader;
import com.google.android.filament.gltfio.FilamentAsset;
import com.google.android.filament.gltfio.Gltfio;
import com.google.android.filament.gltfio.ResourceLoader;
import com.google.android.filament.gltfio.UbershaderProvider;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.util.Random;

/**
 * Live mascot — renders the dark taproot GLB with Filament instead of
 * playing pre-rendered strips. Clips advance in AUTHORED SECONDS, so
 * every animation runs at exactly the speed its source pack intended;
 * the whole frame-ms sidecar machinery does not apply here.
 *
 * Gate: persist.lethe.mascot.live3d (default off → SpriteMascotView).
 * GLB resolves from /data/local/tmp/lethe-sprites/mascot.glb first
 * (adb push iteration), then APK assets/mascot.glb.
 *
 * Render loop is capped at ~15fps: bramble hard-crashed with a PMIC
 * regulator fault under sustained uncapped GPU load (see
 * tools/filament-probe). The power envelope is the constraint, not the
 * GPU. Same state/one-shot/fidget behavior as SpriteMascotView so all
 * hosts look identical.
 *
 * State→clip defaults target the 97-clip dark taproot; the unnamed
 * NlaTrack indices were identified by authored duration against the
 * 12-clip conversation GLB (docs/design/mascot-sprites.md). Override
 * per state without a rebuild: persist.lethe.mascot.clip.<state> =
 * clip index or clip name.
 */
public class FilamentMascotView extends SurfaceView
        implements Choreographer.FrameCallback,
                   MascotStateController.Listener {

    static final String DEV_GLB = "/data/local/tmp/lethe-sprites/mascot.glb";
    static final String ASSET_GLB = "mascot.glb";

    private static final long FRAME_INTERVAL_NANOS = 66_000_000L; // ~15fps

    /* state key → default clip (int index as string, or clip name). */
    private static final String[][] CLIP_DEFAULTS = {
        { MascotView.STATE_IDLE, "idle" },
        { MascotView.STATE_LISTENING, "88" },
        { MascotView.STATE_THINKING, "90" },
        { MascotView.STATE_SPEAKING, "89" },
        { MascotView.STATE_ALERT, "70" },
        { MascotView.STATE_SLEEP, "66" },
        { "wave", "91" }, { "nod", "69" },
        { "walk", "walk" }, { "run", "run" },
    };
    private static final String[] TAP_POOL = { "wave", "nod" };
    private static final String[] FIDGET_POOL = { "walk", "run" };

    /* Colour is the VITALS channel, not the state channel — the palette
     * and the arbitration live in MascotStateController. This view only
     * renders whichever vital it is told. Master gate
     * persist.lethe.mascot.tint=on (default off = shipped look). */

    private static boolean filamentReady;

    private Engine engine;
    private Renderer renderer;
    private Scene scene;
    private View view;
    private Camera camera;
    private int cameraEntity;
    private int lightEntity;
    private SwapChain swapChain;
    private UiHelper uiHelper;
    private AssetLoader assetLoader;
    private UbershaderProvider materialProvider;
    private ResourceLoader resourceLoader;
    private FilamentAsset asset;
    private Animator animator;
    private boolean loadingResources;

    private String state = MascotView.STATE_IDLE;
    private String vital = MascotStateController.VITAL_NOMINAL;
    private String oneShot;             // non-null while a one-shot plays
    private int lastClip = -1;          // clip applied on the previous frame
    private float lastClipTime;
    private int fadeFromClip = -1;      // >=0 while a cross-fade runs
    private float fadeFromTime;
    private long fadeStartNanos;
    private long clipStartNanos;
    private long lastRenderNanos;
    private boolean reducedMotion;
    private long lastInteraction = System.currentTimeMillis();
    private long lastFidget;
    private final Random random = new Random();
    private final Choreographer choreographer = Choreographer.getInstance();

    public FilamentMascotView(Context context) {
        super(context);
        setZOrderOnTop(true);
        getHolder().setFormat(PixelFormat.TRANSLUCENT);
    }

    /** Gate prop on AND a GLB reachable in either source. */
    static boolean available(Context context) {
        if (!"true".equals(LetheConfig.get("persist.lethe.mascot.live3d", "false"))) {
            return false;
        }
        if (new File(DEV_GLB).isFile()) return true;
        try {
            String[] entries = context.getAssets().list("");
            if (entries != null) {
                for (String e : entries) {
                    if (e.equals(ASSET_GLB)) return true;
                }
            }
        } catch (Exception ignored) { }
        return false;
    }

    public void setMascotState(String newState) {
        if (newState == null) newState = MascotView.STATE_IDLE;
        if (newState.equals(state)) return;
        state = newState;
        oneShot = null;
        clipStartNanos = 0L;
        // No applyTint() here: state is the BEHAVIOUR channel and must
        // not move the colour (docs/design/avatar-ui.md).
    }

    /** Vitals changed — repaint the colour channel, leave the clip be.
     *  Delivered on the main thread (the controller's receivers are
     *  registered without a handler). */
    @Override
    public void onVitalChanged(String newVital) {
        if (newVital == null || newVital.equals(vital)) return;
        vital = newVital;
        applyTint();
    }

    public String getMascotState() {
        return state;
    }

    // --- lifecycle --------------------------------------------------------------

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        reducedMotion = Settings.Global.getFloat(getContext().getContentResolver(),
            Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f;
        synchronized (FilamentMascotView.class) {
            if (!filamentReady) {
                Filament.init();
                Gltfio.init();      // loads libgltfio-jni; Filament.init()
                                    // only loads libfilament-jni
                filamentReady = true;
            }
        }
        engine = Engine.create();
        renderer = engine.createRenderer();
        scene = engine.createScene();
        view = engine.createView();
        cameraEntity = EntityManager.get().create();
        camera = engine.createCamera(cameraEntity);
        view.setScene(scene);
        view.setCamera(camera);
        view.setBlendMode(View.BlendMode.TRANSLUCENT);

        Renderer.ClearOptions co = new Renderer.ClearOptions();
        co.clear = true;
        co.clearColor = new float[] { 0f, 0f, 0f, 0f };
        renderer.setClearOptions(co);

        camera.setExposure(16.0f, 1.0f / 125.0f, 100.0f);
        double dist = propF("persist.lethe.mascot.dist", 3.2f);
        camera.lookAt(0.0, 0.0, dist, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0);

        lightEntity = EntityManager.get().create();
        new LightManager.Builder(LightManager.Type.DIRECTIONAL)
            .color(1.0f, 0.98f, 0.92f)
            .intensity(100_000.0f)
            .direction(0.3f, -1.0f, -0.6f)
            .castShadows(false)
            .build(engine, lightEntity);
        scene.addEntity(lightEntity);

        uiHelper = new UiHelper(UiHelper.ContextErrorPolicy.DONT_CHECK);
        uiHelper.setOpaque(false);
        uiHelper.setRenderCallback(new UiHelper.RendererCallback() {
            @Override public void onNativeWindowChanged(Surface surface) {
                if (swapChain != null) engine.destroySwapChain(swapChain);
                swapChain = engine.createSwapChain(surface, uiHelper.getSwapChainFlags());
            }
            @Override public void onDetachedFromSurface() {
                if (swapChain != null) {
                    engine.destroySwapChain(swapChain);
                    engine.flushAndWait();
                    swapChain = null;
                }
            }
            @Override public void onResized(int width, int height) {
                view.setViewport(new Viewport(0, 0, width, height));
                double aspect = (double) width / height;
                camera.setProjection(40.0, aspect, 0.05, 20.0, Camera.Fov.VERTICAL);
            }
        });
        uiHelper.attachTo(this);

        loadAsset();
        // Seeds `vital` synchronously via onVitalChanged before the
        // first frame, so the avatar never flashes the wrong colour.
        MascotStateController.get(getContext()).addListener(this);
        choreographer.postFrameCallback(this);
    }

    @Override
    protected void onDetachedFromWindow() {
        MascotStateController.get(getContext()).removeListener(this);
        choreographer.removeFrameCallback(this);
        if (uiHelper != null) uiHelper.detach();      // destroys swapChain
        if (asset != null) {
            assetLoader.destroyAsset(asset);
            asset = null;
            animator = null;
        }
        if (resourceLoader != null) resourceLoader.destroy();
        if (assetLoader != null) assetLoader.destroy();
        if (materialProvider != null) {
            materialProvider.destroyMaterials();
            materialProvider.destroy();
        }
        if (engine != null) {
            engine.destroyRenderer(renderer);
            engine.destroyView(view);
            engine.destroyScene(scene);
            engine.destroyCameraComponent(cameraEntity);
            EntityManager.get().destroy(cameraEntity);
            EntityManager.get().destroy(lightEntity);
            engine.destroy();
            engine = null;
        }
        super.onDetachedFromWindow();
    }

    // --- asset ------------------------------------------------------------------

    private void loadAsset() {
        ByteBuffer buffer = readGlb();
        if (buffer == null) return;
        materialProvider = new UbershaderProvider(engine);
        assetLoader = new AssetLoader(engine, materialProvider, EntityManager.get());
        asset = assetLoader.createAsset(buffer);
        if (asset == null) return;
        resourceLoader = new ResourceLoader(engine);
        resourceLoader.asyncBeginLoad(asset);
        loadingResources = true;
        scene.addEntities(asset.getEntities());
        centerAsset();
    }

    /** Center + scale + yaw the model. Live-tunable without a rebuild
     *  (fresh keyguard view per show re-reads):
     *    persist.lethe.mascot.scale  size multiplier   (default 0.62)
     *    persist.lethe.mascot.rot    yaw degrees       (default 290 = front)
     *    persist.lethe.mascot.dy     vertical shift    (default 0.05)
     *    persist.lethe.mascot.dist   camera distance   (default 3.2)
     *  Defaults tuned on the bramble keyguard 07-08 by screenshot loop. */
    private void centerAsset() {
        float[] c = asset.getBoundingBox().getCenter();
        float[] he = asset.getBoundingBox().getHalfExtent();
        float maxExtent = Math.max(he[0], Math.max(he[1], he[2]));
        if (maxExtent <= 0f) return;
        float s = propF("persist.lethe.mascot.scale", 0.62f) / maxExtent;
        float yaw = (float) Math.toRadians(propF("persist.lethe.mascot.rot", 290f));
        float dy = propF("persist.lethe.mascot.dy", 0.05f);
        float cos = (float) Math.cos(yaw), sin = (float) Math.sin(yaw);
        TransformManager tm = engine.getTransformManager();
        // v' = s*Ry(yaw)*(v - c) + (0,dy,0), column-major
        tm.setTransform(tm.getInstance(asset.getRoot()), new float[] {
            s * cos, 0, -s * sin, 0,
            0,       s, 0,        0,
            s * sin, 0, s * cos,  0,
            -s * (cos * c[0] + sin * c[2]),
            -s * c[1] + dy,
            -s * (-sin * c[0] + cos * c[2]), 1,
        });
    }

    private static float propF(String key, float def) {
        try {
            return Float.parseFloat(LetheConfig.get(key, String.valueOf(def)));
        } catch (Exception e) {
            return def;
        }
    }

    private ByteBuffer readGlb() {
        try {
            InputStream in;
            File dev = new File(DEV_GLB);
            int size;
            if (dev.isFile()) {
                in = new FileInputStream(dev);
                size = (int) dev.length();
            } else {
                android.content.res.AssetFileDescriptor fd =
                    getContext().getAssets().openFd(ASSET_GLB);
                size = (int) fd.getLength();
                in = fd.createInputStream();
            }
            try {
                ByteBuffer buf = ByteBuffer.allocateDirect(size);
                byte[] chunk = new byte[65536];
                int n;
                while ((n = in.read(chunk)) > 0) buf.put(chunk, 0, n);
                buf.flip();
                return buf;
            } finally {
                in.close();
            }
        } catch (Exception e) {
            return null;
        }
    }

    // --- frame loop -------------------------------------------------------------

    @Override
    public void doFrame(long frameTimeNanos) {
        choreographer.postFrameCallback(this);
        if (frameTimeNanos - lastRenderNanos < FRAME_INTERVAL_NANOS) return;
        lastRenderNanos = frameTimeNanos;

        if (loadingResources && resourceLoader != null) {
            resourceLoader.asyncUpdateLoad();
            float p = resourceLoader.asyncGetLoadProgress();
            if (p >= 1.0f) {
                loadingResources = false;
                asset.releaseSourceData();
                animator = asset.getInstance().getAnimator();
                applyTint();
                Log.i("lethe-3d", "load done, clips="
                    + (animator != null ? animator.getAnimationCount() : -1));
            }
        }

        if (animator != null && animator.getAnimationCount() > 0) {
            advanceAnimation(frameTimeNanos);
            maybeFidget();
        }

        boolean ready = uiHelper != null && uiHelper.isReadyToRender()
            && swapChain != null;
        if (ready && renderer.beginFrame(swapChain, frameTimeNanos)) {
            renderer.render(view);
            renderer.endFrame();
        }
    }

    private void advanceAnimation(long nanos) {
        String key = oneShot != null ? oneShot : state;
        int clip = resolveClip(key);
        if (clip < 0) clip = resolveClip(MascotView.STATE_IDLE);
        if (clip < 0) return;
        if (clipStartNanos == 0L) clipStartNanos = nanos;
        float dur = animator.getAnimationDuration(clip);
        float t = (float) ((nanos - clipStartNanos) / 1e9);
        if (reducedMotion) t = 0f;
        if (t >= dur) {
            if (oneShot != null) {              // one-shot done → state loop
                oneShot = null;
                clipStartNanos = nanos;
                clip = resolveClip(state);
                if (clip < 0) return;
                dur = animator.getAnimationDuration(clip);
                t = 0f;
            } else {
                t = t % dur;                     // loop the state clip
            }
        }
        // Clip changes are detected here rather than at each call site,
        // so state switches, one-shot starts AND one-shot endings all
        // cross-fade without three separate hooks.
        if (clip != lastClip) {
            if (lastClip >= 0 && !reducedMotion) {
                fadeFromClip = lastClip;
                fadeFromTime = lastClipTime;
                fadeStartNanos = nanos;
            }
            lastClip = clip;
        }
        lastClipTime = t;

        animator.applyAnimation(clip, t);

        /* applyCrossFade stashes what applyAnimation just wrote, applies
         * the previous clip, then blends: alpha 0 = previous pose,
         * 1 = current. So it must come AFTER applyAnimation and BEFORE
         * updateBoneMatrices. persist.lethe.mascot.fade.ms, 0 = hard cut. */
        int fadeMs = (int) propF("persist.lethe.mascot.fade.ms", 300f);
        if (fadeMs <= 0 || reducedMotion) {
            fadeFromClip = -1;
        } else if (fadeFromClip >= 0) {
            float alpha = (nanos - fadeStartNanos) / (fadeMs * 1_000_000f);
            if (alpha >= 1f) {
                fadeFromClip = -1;
            } else {
                // Keep the outgoing clip running through the blend —
                // a frozen pose reads as a stutter on locomotion clips.
                float pd = animator.getAnimationDuration(fadeFromClip);
                float pt = fadeFromTime + (nanos - fadeStartNanos) / 1e9f;
                if (pd > 0f) pt = pt % pd;
                animator.applyCrossFade(fadeFromClip, pt, alpha);
            }
        }
        animator.updateBoneMatrices();
    }

    /** Recolor every material of the asset for the current state.
     *  baseColorFactor multiplies the albedo texture; emissiveFactor adds
     *  glow so the color still reads on the dark plates. Factors are
     *  absolute (originals are not readable back from a MaterialInstance),
     *  so the gate tints EVERY state or none — a per-state opt-out would
     *  leave the previous state's tint behind. */
    private void applyTint() {
        if (engine == null || asset == null) return;
        if (!"on".equals(LetheConfig.get("persist.lethe.mascot.tint", "off"))) return;
        float[] rgb = parseHex(MascotStateController.colorFor(vital));
        if (rgb == null) return;
        // A raw multiply crushes the dark albedo (near-black model, moss
        // indistinguishable from stone — ruled out 07-08). Desaturate toward
        // white by (1 - strength) so the albedo's own variation survives,
        // then LUMINANCE-normalize: hues the greenish albedo is poor in
        // (red, violet) get factors above 1 instead of going muddy — every
        // state lands at a similar perceived brightness. gain scales all.
        float s = propF("persist.lethe.mascot.tint.strength", 0.8f);
        for (int c = 0; c < 3; c++) rgb[c] = 1f - s * (1f - rgb[c]);
        float lum = 0.2126f * rgb[0] + 0.7152f * rgb[1] + 0.0722f * rgb[2];
        // 0.9 read too dark on device; 1.8 blows the crack highlights.
        float gain = propF("persist.lethe.mascot.tint.gain", 1.5f);
        if (lum > 0f) {
            for (int c = 0; c < 3; c++) rgb[c] = rgb[c] / lum * gain;
        }
        // Default 0: albedo tint only — colored STONE under real shading.
        // Any emissive here washes the whole model into a flat glow
        // (looks like the light changed, not the rock; ruled out 07-08).
        float glow = propF("persist.lethe.mascot.tint.emissive", 0f);
        RenderableManager rm = engine.getRenderableManager();
        for (int entity : asset.getEntities()) {
            if (!rm.hasComponent(entity)) continue;
            int inst = rm.getInstance(entity);
            for (int i = 0; i < rm.getPrimitiveCount(inst); i++) {
                MaterialInstance mi = rm.getMaterialInstanceAt(inst, i);
                try {
                    if (mi.getMaterial().hasParameter("baseColorFactor")) {
                        mi.setParameter("baseColorFactor",
                            rgb[0], rgb[1], rgb[2], 1f);
                    }
                    if (mi.getMaterial().hasParameter("emissiveFactor")) {
                        mi.setParameter("emissiveFactor",
                            rgb[0] * glow, rgb[1] * glow, rgb[2] * glow);
                    }
                } catch (Exception ignored) { }
            }
        }
    }

    /** "#RRGGBB"/"RRGGBB" sRGB → linear float3 (material factors are linear). */
    private static float[] parseHex(String v) {
        if (v == null || v.isEmpty()) return null;
        try {
            int c = Integer.parseInt(
                v.startsWith("#") ? v.substring(1) : v, 16);
            return new float[] {
                (float) Math.pow(((c >> 16) & 0xff) / 255.0, 2.2),
                (float) Math.pow(((c >> 8) & 0xff) / 255.0, 2.2),
                (float) Math.pow((c & 0xff) / 255.0, 2.2),
            };
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** persist.lethe.mascot.clip.<key> (index or name) → defaults table.
     *  NB: SystemProperties returns "" (never null) for unset keys. */
    private int resolveClip(String key) {
        String v = LetheConfig.get("persist.lethe.mascot.clip." + key, "");
        if (v.isEmpty()) {
            for (String[] pair : CLIP_DEFAULTS) {
                if (pair[0].equals(key)) { v = pair[1]; break; }
            }
        }
        if (v.isEmpty()) return -1;
        try {
            int idx = Integer.parseInt(v);
            return idx >= 0 && idx < animator.getAnimationCount() ? idx : -1;
        } catch (NumberFormatException byName) {
            for (int i = 0; i < animator.getAnimationCount(); i++) {
                if (v.equals(animator.getAnimationName(i))) return i;
            }
            return -1;
        }
    }

    // --- interaction (mirrors SpriteMascotView) ---------------------------------

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
            lastInteraction = System.currentTimeMillis();
            boolean quiet = MascotView.STATE_ALERT.equals(state)
                || MascotView.STATE_THINKING.equals(state)
                || MascotView.STATE_SLEEP.equals(state);
            // tap=cycle: the host advances the state per tap (MascotActivity)
            // — a wave/nod one-shot would fight the new state's clip.
            boolean cycling = "cycle".equals(
                LetheConfig.get("persist.lethe.mascot.tap", ""));
            if (!cycling && !quiet && !reducedMotion && oneShot == null) {
                oneShot = TAP_POOL[random.nextInt(TAP_POOL.length)];
                clipStartNanos = 0L;
            }
        }
        return super.onTouchEvent(event);
    }

    private void maybeFidget() {
        if (oneShot != null || reducedMotion) return;
        if (!MascotView.STATE_IDLE.equals(state)) return;
        long now = System.currentTimeMillis();
        long idleMs = now - lastInteraction;
        if (idleMs > 120_000 && idleMs < 300_000
                && now - lastFidget > 60_000 && random.nextInt(150) == 0) {
            lastFidget = now;
            oneShot = FIDGET_POOL[random.nextInt(FIDGET_POOL.length)];
            clipStartNanos = 0L;
        }
    }
}
