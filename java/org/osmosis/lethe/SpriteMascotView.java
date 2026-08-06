package org.osmosis.lethe;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.provider.Settings;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

import java.io.File;
import java.io.InputStream;
import java.util.Random;

/**
 * Sprite-sheet mascot — the real Blender/Tripo model, pre-rendered
 * (lethe#189 phase 3). Three.js is unreachable in a system-UID app
 * (WebView ban, #192), so this plays the 320x320 vertical strips the
 * recording pipeline produced from mascot-taproot.glb at 15fps —
 * static/mascot-{anim}-{mood}.sprite.png, same frames the web
 * SpritePlayer used.
 *
 * Sheets resolve from /data/local/tmp/lethe-sprites first (adb push —
 * asset iteration without a rebuild), then the APK's assets/sprites.
 * MascotActivity falls back to the Canvas guardian when neither has
 * an idle sheet.
 *
 * Conversation states loop their own sheet; taps and boredom fire
 * one-shots (wave, walk, run) that return to the state loop. Tilt
 * parallax and touch flinch carry over from the Canvas guardian.
 * Decoded strips are 30-55MB each, so exactly one is resident plus
 * the one being loaded; switches keep the old strip until the new
 * one is decoded off the main thread.
 */
public class SpriteMascotView extends View {

    static final String DEV_DIR = "/data/local/tmp/lethe-sprites";
    static final String ASSET_DIR = "sprites";

    private static final int FRAME = 320;
    private static final int FRAME_MS = 66;   // recorded at 15fps
    private static final String MOOD = "green";

    /* Conversation state → looping sheet. Alert has its own recorded
     * take, so no red-tint pass is needed. */
    private static final String[][] STATE_ANIMS = {
        { MascotView.STATE_IDLE, "idle" },
        { MascotView.STATE_LISTENING, "listening" },
        { MascotView.STATE_THINKING, "thinking" },
        { MascotView.STATE_SPEAKING, "speaking" },
        { MascotView.STATE_ALERT, "alert" },
        { MascotView.STATE_SLEEP, "sleep" },
    };

    private static final String[] TAP_POOL = { "wave", "nod" };
    private static final String[] FIDGET_POOL = { "walk", "run" };

    private final Paint framePaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Handler handler = new Handler();
    private final Random random = new Random();

    private String state = MascotView.STATE_IDLE;
    private Bitmap strip;             // resident sheet
    private String stripName;
    private int frameCount;
    private int frame;
    private String oneShot;           // non-null while a one-shot plays
    private String loading;           // sheet being decoded, guards races
    private boolean reducedMotion;
    private float tiltX, tiltY;
    private float flinch;
    private long lastInteraction = System.currentTimeMillis();
    private SensorManager sensorManager;

    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (strip != null && !reducedMotion) {
                frame++;
                if (frame >= frameCount) {
                    frame = 0;
                    if (oneShot != null) {      // one-shot done → state loop
                        oneShot = null;
                        loadStrip(stateAnim());
                    }
                }
                invalidate();
            }
            maybeFidget();
            handler.postDelayed(this, FRAME_MS);
        }
    };

    private final SensorEventListener tiltListener = new SensorEventListener() {
        @Override public void onSensorChanged(SensorEvent e) {
            float nx = clamp(e.values[0] / 4f, -1f, 1f);
            float ny = clamp(e.values[1] / 4f, -1f, 1f);
            tiltX += 0.12f * (-nx - tiltX);
            tiltY += 0.12f * (ny - tiltY);
        }
        @Override public void onAccuracyChanged(Sensor s, int accuracy) { }
    };

    public SpriteMascotView(Context context) {
        this(context, null);
    }

    public SpriteMascotView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    /** True when a playable idle sheet exists in either source. */
    static boolean available(Context context) {
        if (new File(DEV_DIR, sheetName("idle")).isFile()) return true;
        try {
            String[] entries = context.getAssets().list(ASSET_DIR);
            if (entries != null) {
                for (String e : entries) {
                    if (e.equals(sheetName("idle"))) return true;
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
        loadStrip(stateAnim());
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
        if (!reducedMotion) {
            sensorManager = (SensorManager)
                getContext().getSystemService(Context.SENSOR_SERVICE);
            Sensor gravity = sensorManager.getDefaultSensor(Sensor.TYPE_GRAVITY);
            if (gravity == null) {
                gravity = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            }
            if (gravity != null) {
                sensorManager.registerListener(tiltListener, gravity,
                    SensorManager.SENSOR_DELAY_GAME);
            }
        }
        loadStrip(stateAnim());
        handler.postDelayed(ticker, FRAME_MS);
    }

    @Override
    protected void onDetachedFromWindow() {
        handler.removeCallbacks(ticker);
        if (sensorManager != null) sensorManager.unregisterListener(tiltListener);
        if (strip != null) {
            strip.recycle();
            strip = null;
        }
        super.onDetachedFromWindow();
    }

    // --- interaction ------------------------------------------------------------

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
            lastInteraction = System.currentTimeMillis();
            boolean quiet = MascotView.STATE_ALERT.equals(state)
                || MascotView.STATE_THINKING.equals(state)
                || MascotView.STATE_SLEEP.equals(state);
            if (!quiet && !reducedMotion) {
                startFlinch();
                playOnce(TAP_POOL[random.nextInt(TAP_POOL.length)]);
            }
        }
        return super.onTouchEvent(event);
    }

    /** Idle 2–5min → occasional walk/run, mirroring the web boredom
     *  tiers. Past 5min the agent is expected to push sleep. */
    private void maybeFidget() {
        if (oneShot != null || reducedMotion) return;
        if (!MascotView.STATE_IDLE.equals(state)) return;
        long idleMs = System.currentTimeMillis() - lastInteraction;
        if (idleMs > 120_000 && idleMs < 300_000 && random.nextInt(150) == 0) {
            playOnce(FIDGET_POOL[random.nextInt(FIDGET_POOL.length)]);
        }
    }

    private void startFlinch() {
        ValueAnimator a = ValueAnimator.ofFloat(1f, 0f);
        a.setDuration(350);
        a.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override public void onAnimationUpdate(ValueAnimator anim) {
                flinch = (Float) anim.getAnimatedValue();
            }
        });
        a.start();
    }

    // --- sheet loading ----------------------------------------------------------

    private String stateAnim() {
        for (String[] pair : STATE_ANIMS) {
            if (pair[0].equals(state)) return pair[1];
        }
        return "idle";
    }

    private void playOnce(String anim) {
        oneShot = anim;
        loadStrip(anim);
    }

    private static String sheetName(String anim) {
        return "mascot-" + anim + "-" + MOOD + ".sprite.png";
    }

    /** Decode off the main thread; the old strip keeps playing until
     *  the replacement is ready. */
    private void loadStrip(final String anim) {
        if (anim.equals(stripName) || anim.equals(loading)) return;
        loading = anim;
        new Thread(new Runnable() {
            @Override public void run() {
                final Bitmap decoded = decodeSheet(anim);
                handler.post(new Runnable() {
                    @Override public void run() {
                        if (!anim.equals(loading)) {     // superseded
                            if (decoded != null) decoded.recycle();
                            return;
                        }
                        loading = null;
                        if (decoded == null) return;     // sheet missing
                        if (strip != null) strip.recycle();
                        strip = decoded;
                        stripName = anim;
                        frameCount = Math.max(1, decoded.getHeight() / FRAME);
                        frame = 0;
                        invalidate();
                    }
                });
            }
        }, "lethe-sprite-load").start();
    }

    private Bitmap decodeSheet(String anim) {
        File dev = new File(DEV_DIR, sheetName(anim));
        if (dev.isFile()) {
            return BitmapFactory.decodeFile(dev.getAbsolutePath());
        }
        try {
            InputStream in = getContext().getAssets()
                .open(ASSET_DIR + "/" + sheetName(anim));
            try {
                return BitmapFactory.decodeStream(in);
            } finally {
                in.close();
            }
        } catch (Exception e) {
            return null;
        }
    }

    // --- drawing ----------------------------------------------------------------

    @Override
    protected void onDraw(Canvas canvas) {
        if (strip == null) return;
        int idx = reducedMotion ? 0 : frame;
        Rect src = new Rect(0, idx * FRAME, FRAME, (idx + 1) * FRAME);

        // The body occupies the middle of the square frame; size it to
        // ~85% of the short edge, centered slightly above middle.
        float side = Math.min(getWidth(), getHeight()) * 0.85f;
        float cx = getWidth() / 2f + tiltX * 10f;
        float cy = getHeight() * 0.44f + tiltY * 6f;

        canvas.save();
        if (flinch > 0f) {
            float f = flinch * flinch;
            canvas.scale(1f - 0.03f * f, 1f - 0.03f * f, cx, cy);
            canvas.rotate(-1.5f * f, cx, cy);
        }
        RectF dst = new RectF(cx - side / 2, cy - side / 2,
            cx + side / 2, cy + side / 2);
        canvas.drawBitmap(strip, src, dst, framePaint);
        canvas.restore();
    }

    private static float clamp(float v, float lo, float hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }
}
