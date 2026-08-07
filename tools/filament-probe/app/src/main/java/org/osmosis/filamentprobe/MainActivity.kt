package org.osmosis.filamentprobe

import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.view.Choreographer
import android.view.Gravity
import android.view.SurfaceView
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import com.google.android.filament.EntityManager
import com.google.android.filament.LightManager
import com.google.android.filament.Skybox
import com.google.android.filament.utils.ModelViewer
import com.google.android.filament.utils.Utils
import java.nio.ByteBuffer

/**
 * Filament probe — plays the mascot GLB live on-device to answer two
 * questions before wiring a renderer into the Lethe app proper:
 *   1. fps + thermals on bramble (Adreno 620) with the 24.6k-tri model
 *   2. ground-truth animation timing: the Animator plays clips in
 *      authored seconds, so what you see here IS the intended speed.
 *
 * Tap anywhere: next animation clip. HUD shows clip name, authored
 * duration, and measured fps. Fps also logs to logcat (tag: probe).
 */
class MainActivity : Activity() {

    companion object {
        init { Utils.init() }
        private const val TAG = "probe"
        /** Clips worth eyeballing first; the rest follow in index order. */
        private val PREFERRED = listOf("idle", "walk", "run", "wave", "nod")
    }

    private lateinit var surfaceView: SurfaceView
    private lateinit var viewer: ModelViewer
    private lateinit var hud: TextView
    private val choreographer: Choreographer by lazy { Choreographer.getInstance() }

    private var clipOrder: List<Int> = emptyList()
    private var clipPos = 0
    private var clipStartNanos = 0L
    private var frames = 0
    private var fpsWindowStart = 0L
    private var fps = 0.0
    private var lastRenderNanos = 0L

    /* 30fps cap. Uncapped 60fps rendering hard-crashed bramble with a
     * PMIC regulator fault (bootreason pmic_off_fault,gp_fault0,pm0,
     * smps5) after ~3min of GPU + screen + charging load, 2026-08-07.
     * The power envelope, not the GPU, is the binding constraint. */
    private val frameIntervalNanos = 33_000_000L

    private val frameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            choreographer.postFrameCallback(this)
            if (frameTimeNanos - lastRenderNanos < frameIntervalNanos) return
            lastRenderNanos = frameTimeNanos
            viewer.animator?.apply {
                if (animationCount > 0) {
                    val idx = clipOrder[clipPos]
                    if (clipStartNanos == 0L) clipStartNanos = frameTimeNanos
                    val t = ((frameTimeNanos - clipStartNanos) / 1e9)
                        .mod(getAnimationDuration(idx).toDouble())
                    applyAnimation(idx, t.toFloat())
                }
                updateBoneMatrices()
            }
            viewer.render(frameTimeNanos)

            frames++
            if (fpsWindowStart == 0L) fpsWindowStart = frameTimeNanos
            val span = frameTimeNanos - fpsWindowStart
            if (span >= 1_000_000_000L) {
                fps = frames * 1e9 / span
                frames = 0
                fpsWindowStart = frameTimeNanos
                Log.i(TAG, "fps=%.1f clip=%s".format(fps, currentClipLabel()))
                hud.text = currentClipLabel() + "\n%.1f fps".format(fps)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        surfaceView = SurfaceView(this)
        viewer = ModelViewer(surfaceView)

        hud = TextView(this)
        hud.setTextColor(0xFF9FE8DC.toInt())
        hud.textSize = 16f
        hud.text = "loading…"

        val root = FrameLayout(this)
        root.addView(surfaceView)
        root.addView(hud, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP or Gravity.START).apply { topMargin = 48; leftMargin = 32 })
        setContentView(root)

        val bytes = assets.open("mascot.glb").readBytes()
        val buffer = ByteBuffer.allocateDirect(bytes.size).put(bytes).flip() as ByteBuffer
        viewer.loadModelGlb(buffer)
        viewer.transformToUnitCube()

        val engine = viewer.engine
        viewer.scene.skybox = Skybox.Builder()
            .color(0.02f, 0.07f, 0.08f, 1.0f).build(engine)
        val light = EntityManager.get().create()
        LightManager.Builder(LightManager.Type.DIRECTIONAL)
            .color(1.0f, 0.98f, 0.92f)
            .intensity(60_000.0f)
            .direction(0.3f, -1.0f, -0.6f)
            .castShadows(false)
            .build(engine, light)
        viewer.scene.addEntity(light)

        clipOrder = buildClipOrder()
        surfaceView.setOnClickListener { nextClip() }
    }

    /** Preferred names first (exact match), then everything else. */
    private fun buildClipOrder(): List<Int> {
        val a = viewer.animator ?: return listOf(0)
        val byName = (0 until a.animationCount).associateBy { a.getAnimationName(it) }
        val head = PREFERRED.mapNotNull { byName[it] }
        val rest = (0 until a.animationCount).filter { it !in head }
        return (head + rest).ifEmpty { listOf(0) }
    }

    private fun nextClip() {
        clipPos = (clipPos + 1) % clipOrder.size
        clipStartNanos = 0L
        Log.i(TAG, "switch -> " + currentClipLabel())
    }

    private fun currentClipLabel(): String {
        val a = viewer.animator ?: return "no animator"
        if (clipOrder.isEmpty()) return "no clips"
        val idx = clipOrder[clipPos]
        return "%s [%d] %.2fs".format(a.getAnimationName(idx), idx,
            a.getAnimationDuration(idx))
    }

    override fun onResume() {
        super.onResume()
        choreographer.postFrameCallback(frameCallback)
    }

    override fun onPause() {
        super.onPause()
        choreographer.removeFrameCallback(frameCallback)
    }
}
