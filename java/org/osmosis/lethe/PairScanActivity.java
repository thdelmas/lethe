package org.osmosis.lethe;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.ImageFormat;
import android.hardware.Camera;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.NotFoundException;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

import java.io.IOException;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Native camera-based QR scanner for the LETHE pair flow (#168).
 *
 * Opens the back camera, runs every NV21 preview frame's luma plane
 * through ZXing's {@link MultiFormatReader}, and on the first
 * successful QR decode returns the raw payload via
 * {@link #EXTRA_PAYLOAD} (RESULT_OK) so the caller can hand it to
 * {@link PairReceiver#applyPayloadJson(android.content.Context, String)}.
 *
 * Camera1 (deprecated) is used deliberately, not Camera2. cm-14.1 ROMs
 * for our target devices (Samsung t0lte, S5C73M3 + exynos_camera HAL1)
 * back Camera2 with the legacy shim, which crashes
 * {@code LegacyCameraDevice.produceFrame} when asked to render both a
 * preview surface and an {@code ImageReader} target. Camera1 talks to
 * HAL1 natively and gives us NV21 frames whose first {@code w*h} bytes
 * are exactly the Y plane — perfect for
 * {@link PlanarYUVLuminanceSource}. When this activity ports forward
 * to LOS 22.1+ with modern HAL3 hardware, the Camera2 path will need
 * to come back as a separate piece of work.
 *
 * Why native (not WebView): the former WebView host (LetheActivity,
 * removed in lethe#192) carried the in-browser jsQR scanner but crashed on
 * user builds because WebView is banned in privileged processes since
 * Android 7.0 (sharedUserId=android.uid.system — see lethe#159). This
 * activity is the camera path that ships off
 * user builds.
 */
public class PairScanActivity extends Activity
        implements SurfaceHolder.Callback, Camera.PreviewCallback {

    public static final String EXTRA_PAYLOAD = "payload";

    private static final String TAG = "lethe-pair-scan";
    private static final int REQUEST_CAMERA = 0x70A1;
    private static final int TARGET_WIDTH = 640;
    private static final int TARGET_HEIGHT = 480;

    private SurfaceView preview;
    private TextView statusBanner;
    private Camera camera;
    private int cameraId = -1;
    private int previewWidth;
    private int previewHeight;
    private boolean previewing;
    private boolean surfaceReady;
    private MultiFormatReader reader;
    private final AtomicBoolean decoded = new AtomicBoolean(false);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("Scan pair QR");

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        preview = new SurfaceView(this);
        root.addView(preview, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT));
        preview.getHolder().addCallback(this);

        statusBanner = new TextView(this);
        statusBanner.setText("Point camera at OSmosis QR.");
        statusBanner.setTextColor(Color.WHITE);
        statusBanner.setBackgroundColor(0x99000000);
        statusBanner.setGravity(Gravity.CENTER);
        statusBanner.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        int pad = dp(12);
        statusBanner.setPadding(pad, pad, pad, pad);
        FrameLayout.LayoutParams bannerLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT);
        bannerLp.gravity = Gravity.TOP;
        root.addView(statusBanner, bannerLp);

        LinearLayout buttonBar = new LinearLayout(this);
        buttonBar.setOrientation(LinearLayout.HORIZONTAL);
        buttonBar.setGravity(Gravity.CENTER);
        buttonBar.setBackgroundColor(0x99000000);
        buttonBar.setPadding(pad, pad, pad, pad);

        Button cancel = new Button(this);
        cancel.setText("Cancel");
        cancel.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                setResult(RESULT_CANCELED);
                finish();
            }
        });
        buttonBar.addView(cancel);

        FrameLayout.LayoutParams barLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT);
        barLp.gravity = Gravity.BOTTOM;
        root.addView(buttonBar, barLp);

        setContentView(root);

        reader = new MultiFormatReader();
        Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
        hints.put(DecodeHintType.POSSIBLE_FORMATS,
            Arrays.asList(BarcodeFormat.QR_CODE));
        hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
        reader.setHints(hints);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (checkSelfPermission(Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                new String[] { Manifest.permission.CAMERA }, REQUEST_CAMERA);
            return;
        }
        if (surfaceReady) openCamera();
    }

    @Override
    protected void onPause() {
        releaseCamera();
        super.onPause();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] grants) {
        if (code != REQUEST_CAMERA) return;
        if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) {
            if (surfaceReady) openCamera();
        } else {
            Toast.makeText(this,
                "Camera permission denied — use Paste instead.",
                Toast.LENGTH_LONG).show();
            setResult(RESULT_CANCELED);
            finish();
        }
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        surfaceReady = true;
        if (checkSelfPermission(Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            openCamera();
        }
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int w, int h) {
        // The camera owns the preview size; layout changes don't restart it.
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        surfaceReady = false;
        releaseCamera();
    }

    private void openCamera() {
        if (camera != null) return;
        try {
            cameraId = pickBackCameraId();
            if (cameraId < 0) {
                fail("No camera found.");
                return;
            }
            camera = Camera.open(cameraId);
            if (camera == null) {
                fail("Camera.open returned null.");
                return;
            }
            Camera.Parameters p = camera.getParameters();
            p.setPreviewFormat(ImageFormat.NV21);

            Camera.Size size = pickPreviewSize(p);
            previewWidth = size.width;
            previewHeight = size.height;
            p.setPreviewSize(previewWidth, previewHeight);

            List<String> focusModes = p.getSupportedFocusModes();
            if (focusModes != null && focusModes.contains(
                    Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)) {
                p.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
            } else if (focusModes != null && focusModes.contains(
                    Camera.Parameters.FOCUS_MODE_AUTO)) {
                p.setFocusMode(Camera.Parameters.FOCUS_MODE_AUTO);
            }

            camera.setParameters(p);
            camera.setDisplayOrientation(displayRotationForCamera(cameraId));

            int bufSize = previewWidth * previewHeight
                * ImageFormat.getBitsPerPixel(ImageFormat.NV21) / 8;
            // Two buffers so the driver always has one to fill while we
            // process the other.
            camera.addCallbackBuffer(new byte[bufSize]);
            camera.addCallbackBuffer(new byte[bufSize]);
            camera.setPreviewCallbackWithBuffer(this);
            camera.setPreviewDisplay(preview.getHolder());
            camera.startPreview();
            previewing = true;
        } catch (IOException | RuntimeException e) {
            fail("Camera open failed: " + e.getMessage());
        }
    }

    private int pickBackCameraId() {
        int count = Camera.getNumberOfCameras();
        Camera.CameraInfo info = new Camera.CameraInfo();
        for (int i = 0; i < count; i++) {
            Camera.getCameraInfo(i, info);
            if (info.facing == Camera.CameraInfo.CAMERA_FACING_BACK) return i;
        }
        return count > 0 ? 0 : -1;
    }

    private Camera.Size pickPreviewSize(Camera.Parameters p) {
        List<Camera.Size> sizes = p.getSupportedPreviewSizes();
        Camera.Size best = sizes.get(0);
        long bestDelta = Long.MAX_VALUE;
        long target = (long) TARGET_WIDTH * TARGET_HEIGHT;
        for (Camera.Size s : sizes) {
            long delta = Math.abs((long) s.width * s.height - target);
            if (delta < bestDelta) { best = s; bestDelta = delta; }
        }
        return best;
    }

    private int displayRotationForCamera(int id) {
        int deviceRotation = getWindowManager().getDefaultDisplay().getRotation();
        int degrees;
        switch (deviceRotation) {
            case android.view.Surface.ROTATION_0:   degrees = 0;   break;
            case android.view.Surface.ROTATION_90:  degrees = 90;  break;
            case android.view.Surface.ROTATION_180: degrees = 180; break;
            case android.view.Surface.ROTATION_270: degrees = 270; break;
            default:                                degrees = 0;   break;
        }
        Camera.CameraInfo info = new Camera.CameraInfo();
        Camera.getCameraInfo(id, info);
        if (info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT) {
            return (360 - ((info.orientation + degrees) % 360)) % 360;
        }
        return (info.orientation - degrees + 360) % 360;
    }

    @Override
    public void onPreviewFrame(byte[] data, Camera cam) {
        if (data == null) return;
        if (decoded.get()) {
            cam.addCallbackBuffer(data);
            return;
        }
        try {
            decodeFrame(data, previewWidth, previewHeight);
        } finally {
            // Return the buffer to the driver so another frame can come in.
            if (camera != null && !decoded.get()) {
                camera.addCallbackBuffer(data);
            }
        }
    }

    private void decodeFrame(byte[] yuv, int w, int h) {
        // NV21 = planar Y (w*h bytes) followed by interleaved VU.
        // PlanarYUVLuminanceSource reads the first dataWidth*dataHeight
        // bytes as the Y plane and ignores the rest, so passing the
        // full NV21 buffer with dataWidth=w works directly.
        PlanarYUVLuminanceSource src = new PlanarYUVLuminanceSource(
            yuv, w, h, 0, 0, w, h, false);
        BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(src));
        try {
            Result result = reader.decodeWithState(bitmap);
            String text = result != null ? result.getText() : null;
            if (text != null && !text.isEmpty()
                    && decoded.compareAndSet(false, true)) {
                returnPayload(text);
            }
        } catch (NotFoundException e) {
            // expected for frames without a QR — try next frame
        } catch (Throwable t) {
            Log.w(TAG, "decode error", t);
        } finally {
            reader.reset();
        }
    }

    private void returnPayload(final String payload) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                Intent data = new Intent();
                data.putExtra(EXTRA_PAYLOAD, payload);
                setResult(RESULT_OK, data);
                finish();
            }
        });
    }

    private void releaseCamera() {
        if (camera == null) return;
        try {
            if (previewing) {
                camera.stopPreview();
                previewing = false;
            }
            camera.setPreviewCallbackWithBuffer(null);
        } catch (RuntimeException e) {
            Log.w(TAG, "stopPreview failed", e);
        }
        camera.release();
        camera = null;
    }

    private void fail(final String msg) {
        Log.w(TAG, msg);
        runOnUiThread(new Runnable() {
            @Override public void run() {
                Toast.makeText(PairScanActivity.this, msg, Toast.LENGTH_LONG).show();
                setResult(RESULT_CANCELED);
                finish();
            }
        });
    }

    private int dp(int v) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(v * density);
    }
}
