package org.osmosis.lethe;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Handler;
import android.util.AttributeSet;
import android.view.View;

import java.util.Random;

/**
 * Native mascot rendering — phase 1 of lethe#189 (Route 3).
 *
 * Draws the layered composition from docs/design/mascot-layers.md with
 * Canvas: stone body, moss, bioluminescent cracks, chest orb, eyes,
 * antennae — back to front, in the 540x960 logical space the SVG spec
 * uses. Phase 1 scope: breathing + sway, idle blink, and the six
 * conversation states. Gyro parallax, gaze tracking, and battery-driven
 * glow are phase 2 (see the issue).
 *
 * Static layers (body, moss, cracks with their BlurMaskFilter glow,
 * antennae) are pre-rendered into a bitmap on size change — the blur
 * filter needs software drawing, and re-blurring per frame would not
 * hold 60fps on the low-end tier. Per-frame work is one bitmap blit
 * plus the orb and eyes, all hardware-accelerated.
 */
public class MascotView extends View {

    static final String STATE_IDLE = "idle";
    static final String STATE_LISTENING = "listening";
    static final String STATE_THINKING = "thinking";
    static final String STATE_SPEAKING = "speaking";
    static final String STATE_ALERT = "alert";
    static final String STATE_SLEEP = "sleep";

    private static final int VIEW_W = 540;
    private static final int VIEW_H = 960;
    private static final int C_STONE = 0xFF2A2A28;
    private static final int C_MOSS = 0x991A3A20;
    private static final int C_ALERT = 0xFFFF4040;

    /* Crack polylines in viewBox space, grouped per the spec regions. */
    private static final float[][] CRACKS = {
        { 250, 180, 262, 210, 255, 240 },                  // head
        { 300, 170, 292, 205, 302, 230 },
        { 220, 390, 245, 430, 235, 470, 255, 500 },        // torso
        { 320, 380, 305, 425, 318, 465 },
        { 270, 540, 282, 575, 270, 610 },
        { 178, 420, 168, 460, 175, 495 },                  // arm left
        { 362, 420, 372, 462, 365, 495 },                  // arm right
        { 228, 660, 238, 700, 230, 740 },                  // leg left
        { 312, 660, 302, 705, 312, 745 },                  // leg right
    };

    private final Paint bitmapPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint orbFill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint orbRing = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint eyeGlow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint eyeFill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint lidFill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Random random = new Random();
    private final Handler handler = new Handler();

    private int accent = 0xFF22E8A0;
    private String state = STATE_IDLE;
    private Bitmap staticLayer;
    private ValueAnimator breathAnimator;
    private float breathPhase;        // 0..1 looping
    private float blink;              // 0 open .. 1 closed
    private float glow = 1f;          // overall luminescence multiplier

    private final Runnable blinkRunnable = new Runnable() {
        @Override public void run() {
            if (!STATE_SLEEP.equals(state)) startBlink();
            scheduleBlink();
        }
    };

    public MascotView(Context context) {
        this(context, null);
    }

    public MascotView(Context context, AttributeSet attrs) {
        super(context, attrs);
        String argb = ThemeSettingsActivity.normalizeArgb(
            LetheConfig.get("persist.lethe.th.accent",
                ThemeSettingsActivity.DEFAULT_ACCENT));
        if (argb != null) accent = (int) Long.parseLong(argb, 16);
        configurePaints(accent);
    }

    /** One of the STATE_* constants — mirrors the mascot-state-* CSS
     *  classes the WebView mascot used. Unknown values fall to idle. */
    public void setMascotState(String newState) {
        if (newState == null) newState = STATE_IDLE;
        if (newState.equals(state)) return;
        state = newState;
        if (STATE_SLEEP.equals(state)) {
            blink = 1f;
            glow = 0.3f;
        } else {
            blink = 0f;
            glow = STATE_THINKING.equals(state) ? 0.7f : 1f;
        }
        // Alert tints the cracks red — rebuild the cached layer.
        rebuildStaticLayer();
        invalidate();
    }

    public String getMascotState() {
        return state;
    }

    // --- lifecycle --------------------------------------------------------------

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        breathAnimator = ValueAnimator.ofFloat(0f, 1f);
        breathAnimator.setDuration(4000);
        breathAnimator.setRepeatCount(ValueAnimator.INFINITE);
        breathAnimator.setInterpolator(null);  // linear; ease in onDraw
        breathAnimator.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override public void onAnimationUpdate(ValueAnimator a) {
                breathPhase = (Float) a.getAnimatedValue();
                if (!STATE_SLEEP.equals(state)) invalidate();
            }
        });
        breathAnimator.start();
        scheduleBlink();
    }

    @Override
    protected void onDetachedFromWindow() {
        if (breathAnimator != null) breathAnimator.cancel();
        handler.removeCallbacks(blinkRunnable);
        super.onDetachedFromWindow();
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        rebuildStaticLayer();
    }

    // --- drawing ------------------------------------------------------------------

    @Override
    protected void onDraw(Canvas canvas) {
        if (staticLayer == null) return;
        float scale = scale();
        float ox = (getWidth() - VIEW_W * scale) / 2f;
        float oy = (getHeight() - VIEW_H * scale) / 2f;

        canvas.save();
        canvas.translate(ox, oy);
        canvas.scale(scale, scale);
        applyStateTransform(canvas);

        canvas.drawBitmap(staticLayer, null,
            new RectF(0, 0, VIEW_W, VIEW_H), bitmapPaint);
        drawOrb(canvas);
        drawEyes(canvas);
        canvas.restore();
    }

    /** Breathing scale + per-state lean, around the figure's center. */
    private void applyStateTransform(Canvas canvas) {
        float wave = (float) Math.sin(breathPhase * 2 * Math.PI);
        float cx = VIEW_W / 2f, cy = VIEW_H / 2f;
        if (STATE_SLEEP.equals(state)) return;
        float breathe = 1f + 0.008f * wave;
        canvas.scale(breathe, breathe, cx, cy);
        if (STATE_IDLE.equals(state)) {
            canvas.rotate(1.2f * wave, cx, cy);
        } else if (STATE_LISTENING.equals(state)) {
            canvas.rotate(-2.5f, cx, cy);            // lean forward
            canvas.translate(0, 8);
        } else if (STATE_THINKING.equals(state)) {
            canvas.translate(0, 6);                  // head dips
        } else if (STATE_SPEAKING.equals(state)) {
            canvas.rotate(1.8f * wave, cx, cy);      // upright sway
        } else if (STATE_ALERT.equals(state)) {
            canvas.rotate(2.5f, cx, cy);             // braces back
            canvas.translate(0, -4);
        }
    }

    private void drawOrb(Canvas canvas) {
        float cx = 270, cy = 470;
        // The orb is the emotional center — it pulses with the breath.
        float pulse = 1f + 0.05f * (float) Math.sin(breathPhase * 2 * Math.PI);
        float r = 65 * pulse;
        orbFill.setAlpha((int) (230 * glow));
        canvas.drawCircle(cx, cy, r, orbFill);
        for (int i = 1; i <= 3; i++) {
            orbRing.setAlpha((int) ((140 - i * 30) * glow));
            canvas.drawCircle(cx, cy, r * i / 3.5f, orbRing);
        }
    }

    private void drawEyes(Canvas canvas) {
        // Thinking looks down — matches the state table in the spec.
        float dy = STATE_THINKING.equals(state) ? 6 : 0;
        drawEye(canvas, 225, 245 + dy);
        drawEye(canvas, 315, 245 + dy);
    }

    private void drawEye(Canvas canvas, float cx, float cy) {
        canvas.save();
        canvas.translate(cx, cy);   // the glow gradient is origin-centered
        eyeGlow.setAlpha((int) (160 * glow));
        canvas.drawCircle(0, 0, 30, eyeGlow);
        eyeFill.setAlpha((int) (255 * glow));
        canvas.drawOval(new RectF(-18, -14, 18, 14), eyeFill);
        if (blink > 0f) {
            float lid = 14 * blink;
            canvas.drawRect(-20, -15, 20, -15 + lid * 2, lidFill);
        }
        canvas.restore();
    }

    // --- blink ---------------------------------------------------------------------

    private void scheduleBlink() {
        // 2.5–6s between blinks, like a living thing rather than a metronome.
        handler.postDelayed(blinkRunnable, 2500 + random.nextInt(3500));
    }

    private void startBlink() {
        ValueAnimator a = ValueAnimator.ofFloat(0f, 1f, 0f);
        a.setDuration(200);  // spec: 0.2s lid sweep
        a.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override public void onAnimationUpdate(ValueAnimator anim) {
                blink = (Float) anim.getAnimatedValue();
                invalidate();
            }
        });
        a.start();
    }

    // --- static layer ----------------------------------------------------------------

    private void rebuildStaticLayer() {
        if (getWidth() == 0 || getHeight() == 0) return;
        float scale = scale();
        int w = Math.max(1, Math.round(VIEW_W * scale));
        int h = Math.max(1, Math.round(VIEW_H * scale));
        if (staticLayer != null) staticLayer.recycle();
        staticLayer = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(staticLayer);
        c.scale(scale, scale);
        drawBody(c);
        drawMoss(c);
        drawCracks(c);
        drawAntennae(c);
    }

    private void drawBody(Canvas c) {
        Paint stone = new Paint(Paint.ANTI_ALIAS_FLAG);
        stone.setColor(C_STONE);
        c.drawCircle(270, 260, 115, stone);                          // head
        c.drawRoundRect(new RectF(170, 360, 370, 650), 60, 60, stone); // torso
        c.drawRoundRect(new RectF(140, 390, 185, 520), 22, 22, stone); // arm L
        c.drawRoundRect(new RectF(355, 390, 400, 520), 22, 22, stone); // arm R
        c.drawRoundRect(new RectF(205, 640, 260, 790), 26, 26, stone); // leg L
        c.drawRoundRect(new RectF(280, 640, 335, 790), 26, 26, stone); // leg R
        c.drawRect(220, 330, 320, 380, stone);                       // neck
    }

    private void drawMoss(Canvas c) {
        Paint moss = new Paint(Paint.ANTI_ALIAS_FLAG);
        moss.setColor(C_MOSS);
        c.drawOval(new RectF(175, 375, 225, 405), moss);   // shoulder
        c.drawOval(new RectF(330, 600, 368, 640), moss);   // hip
        c.drawOval(new RectF(210, 760, 255, 788), moss);   // foot
        c.drawOval(new RectF(305, 180, 340, 205), moss);   // head patch
    }

    private void drawCracks(Canvas c) {
        Paint vein = new Paint(Paint.ANTI_ALIAS_FLAG);
        vein.setStyle(Paint.Style.STROKE);
        vein.setStrokeWidth(2.5f);
        vein.setColor(STATE_ALERT.equals(state) ? C_ALERT : accent);
        vein.setAlpha((int) (255 * glow));
        // The bioluminescent glow — needs software rendering, which is
        // why cracks live on the cached bitmap, not in onDraw.
        vein.setMaskFilter(new BlurMaskFilter(6, BlurMaskFilter.Blur.SOLID));
        for (float[] pts : CRACKS) {
            Path p = new Path();
            p.moveTo(pts[0], pts[1]);
            for (int i = 2; i < pts.length; i += 2) {
                p.lineTo(pts[i], pts[i + 1]);
            }
            c.drawPath(p, vein);
        }
    }

    private void drawAntennae(Canvas c) {
        Paint stem = new Paint(Paint.ANTI_ALIAS_FLAG);
        stem.setStyle(Paint.Style.STROKE);
        stem.setStrokeWidth(2f);
        stem.setColor(0xFF666666);
        c.drawLine(240, 152, 215, 92, stem);
        c.drawLine(300, 152, 325, 92, stem);
        Paint tip = new Paint(Paint.ANTI_ALIAS_FLAG);
        tip.setColor(0xFFDDDDDD);
        c.drawCircle(215, 88, 6, tip);
        c.drawCircle(325, 88, 6, tip);
    }

    // --- helpers --------------------------------------------------------------------

    private float scale() {
        return Math.min(getWidth() / (float) VIEW_W,
            getHeight() / (float) VIEW_H);
    }

    private void configurePaints(int accentColor) {
        orbFill.setShader(new RadialGradient(270, 470, 65,
            withAlpha(accentColor, 230), withAlpha(accentColor, 25),
            Shader.TileMode.CLAMP));
        orbRing.setStyle(Paint.Style.STROKE);
        orbRing.setStrokeWidth(2f);
        orbRing.setColor(accentColor);
        eyeGlow.setShader(new RadialGradient(0, 0, 30,
            withAlpha(accentColor, 160), withAlpha(accentColor, 0),
            Shader.TileMode.CLAMP));
        eyeFill.setColor(accentColor);
        lidFill.setColor(C_STONE);
    }

    private static int withAlpha(int color, int alpha) {
        return Color.argb(alpha, Color.red(color), Color.green(color),
            Color.blue(color));
    }
}
