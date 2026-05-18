package org.osmosis.lethe;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.ImageFormat;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.util.Size;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.NotFoundException;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Native camera-based QR scanner for the LETHE pair flow.
 *
 * Opens a back-camera preview, feeds each YUV frame through ZXing's
 * {@link MultiFormatReader}, and on the first successful QR decode
 * returns the raw payload string via {@link #EXTRA_PAYLOAD} (RESULT_OK)
 * so the caller can hand it to
 * {@link PairReceiver#applyPayloadJson(android.content.Context, String)}.
 *
 * Why native (not WebView): {@link LetheActivity} hosts the in-browser
 * jsQR scanner but crashes on user builds because WebView is banned in
 * privileged processes since Android 7.0 (sharedUserId=android.uid.system
 * — see lethe#159). This activity is the camera path that ships off
 * user builds.
 *
 * ZXing 2.3.1 is reachable in {@code classes.dex} because the cm-14.1
 * source tree already declares {@code zxing-core} as a prebuilt JAR via
 * {@code packages/apps/Snap/Android.mk}; the Lethe Android.mk links it
 * with {@code LOCAL_STATIC_JAVA_LIBRARIES := zxing-core}. See
 * {@code docs/security/journalist-audit/168-pair-scan-spike.md} for the
 * hardware-validated build-glue.
 *
 * The decode loop runs on the ImageReader's background thread and is
 * gated by {@link #decoded} so we only setResult+finish once.
 */
public class PairScanActivity extends Activity {

    public static final String EXTRA_PAYLOAD = "payload";

    private static final String TAG = "lethe-pair-scan";
    private static final int REQUEST_CAMERA = 0x70A1;
    private static final Size PREFERRED_SIZE = new Size(640, 480);

    private TextureView preview;
    private TextView statusBanner;
    private HandlerThread cameraThread;
    private Handler cameraHandler;
    private CameraManager cameraManager;
    private CameraDevice cameraDevice;
    private CameraCaptureSession captureSession;
    private ImageReader imageReader;
    private MultiFormatReader reader;
    private final AtomicBoolean decoded = new AtomicBoolean(false);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("Scan pair QR");

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        preview = new TextureView(this);
        root.addView(preview, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT));

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
            Arrays.asList(com.google.zxing.BarcodeFormat.QR_CODE));
        hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
        reader.setHints(hints);

        cameraManager = (CameraManager) getSystemService(CAMERA_SERVICE);
    }

    @Override
    protected void onResume() {
        super.onResume();
        cameraThread = new HandlerThread("pair-scan-camera");
        cameraThread.start();
        cameraHandler = new Handler(cameraThread.getLooper());

        if (checkSelfPermission(Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                new String[] { Manifest.permission.CAMERA }, REQUEST_CAMERA);
            return;
        }
        openCameraWhenReady();
    }

    @Override
    protected void onPause() {
        closeCamera();
        if (cameraThread != null) {
            cameraThread.quitSafely();
            try {
                cameraThread.join();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            cameraThread = null;
            cameraHandler = null;
        }
        super.onPause();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] grants) {
        if (code != REQUEST_CAMERA) return;
        if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) {
            openCameraWhenReady();
        } else {
            Toast.makeText(this,
                "Camera permission denied — use Paste instead.",
                Toast.LENGTH_LONG).show();
            setResult(RESULT_CANCELED);
            finish();
        }
    }

    private void openCameraWhenReady() {
        if (preview.isAvailable()) {
            openCamera();
        } else {
            preview.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
                @Override public void onSurfaceTextureAvailable(
                        SurfaceTexture s, int w, int h) { openCamera(); }
                @Override public void onSurfaceTextureSizeChanged(
                        SurfaceTexture s, int w, int h) {}
                @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture s) {
                    return true;
                }
                @Override public void onSurfaceTextureUpdated(SurfaceTexture s) {}
            });
        }
    }

    private void openCamera() {
        try {
            String chosen = pickBackCamera();
            if (chosen == null) {
                fail("No back camera available.");
                return;
            }
            CameraCharacteristics ch = cameraManager.getCameraCharacteristics(chosen);
            StreamConfigurationMap map = ch.get(
                CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            Size yuv = pickYuvSize(map);

            imageReader = ImageReader.newInstance(
                yuv.getWidth(), yuv.getHeight(), ImageFormat.YUV_420_888, 2);
            imageReader.setOnImageAvailableListener(frameListener, cameraHandler);

            cameraManager.openCamera(chosen, deviceCallback, cameraHandler);
        } catch (CameraAccessException | SecurityException e) {
            fail("Camera open failed: " + e.getMessage());
        }
    }

    private String pickBackCamera() throws CameraAccessException {
        for (String id : cameraManager.getCameraIdList()) {
            Integer facing = cameraManager.getCameraCharacteristics(id)
                .get(CameraCharacteristics.LENS_FACING);
            if (facing != null && facing == CameraMetadata.LENS_FACING_BACK) return id;
        }
        String[] all = cameraManager.getCameraIdList();
        return all.length > 0 ? all[0] : null;
    }

    private Size pickYuvSize(StreamConfigurationMap map) {
        if (map == null) return PREFERRED_SIZE;
        Size[] yuvSizes = map.getOutputSizes(ImageFormat.YUV_420_888);
        if (yuvSizes == null || yuvSizes.length == 0) return PREFERRED_SIZE;
        Size best = null;
        long bestDelta = Long.MAX_VALUE;
        long target = (long) PREFERRED_SIZE.getWidth() * PREFERRED_SIZE.getHeight();
        for (Size s : yuvSizes) {
            long area = (long) s.getWidth() * s.getHeight();
            long delta = Math.abs(area - target);
            if (delta < bestDelta) { best = s; bestDelta = delta; }
        }
        return best != null ? best : PREFERRED_SIZE;
    }

    private final CameraDevice.StateCallback deviceCallback = new CameraDevice.StateCallback() {
        @Override
        public void onOpened(CameraDevice device) {
            cameraDevice = device;
            startPreview();
        }
        @Override
        public void onDisconnected(CameraDevice device) {
            device.close();
            cameraDevice = null;
        }
        @Override
        public void onError(CameraDevice device, int error) {
            device.close();
            cameraDevice = null;
            fail("Camera error: " + error);
        }
    };

    private void startPreview() {
        try {
            SurfaceTexture st = preview.getSurfaceTexture();
            st.setDefaultBufferSize(
                imageReader.getWidth(), imageReader.getHeight());
            Surface previewSurface = new Surface(st);
            Surface frameSurface = imageReader.getSurface();

            final CaptureRequest.Builder req = cameraDevice.createCaptureRequest(
                CameraDevice.TEMPLATE_PREVIEW);
            req.addTarget(previewSurface);
            req.addTarget(frameSurface);
            req.set(CaptureRequest.CONTROL_AF_MODE,
                CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);

            cameraDevice.createCaptureSession(
                Arrays.asList(previewSurface, frameSurface),
                new CameraCaptureSession.StateCallback() {
                    @Override
                    public void onConfigured(CameraCaptureSession session) {
                        if (cameraDevice == null) return;
                        captureSession = session;
                        try {
                            session.setRepeatingRequest(req.build(), null, cameraHandler);
                        } catch (CameraAccessException e) {
                            fail("Capture failed: " + e.getMessage());
                        }
                    }
                    @Override
                    public void onConfigureFailed(CameraCaptureSession session) {
                        fail("Capture session config failed.");
                    }
                },
                cameraHandler);
        } catch (CameraAccessException e) {
            fail("Preview start failed: " + e.getMessage());
        }
    }

    private final ImageReader.OnImageAvailableListener frameListener =
        new ImageReader.OnImageAvailableListener() {
            @Override
            public void onImageAvailable(ImageReader r) {
                if (decoded.get()) {
                    drain(r);
                    return;
                }
                Image img = r.acquireLatestImage();
                if (img == null) return;
                try {
                    decodeFrame(img);
                } finally {
                    img.close();
                }
            }
        };

    private void drain(ImageReader r) {
        Image img = r.acquireLatestImage();
        if (img != null) img.close();
    }

    private void decodeFrame(Image img) {
        Image.Plane[] planes = img.getPlanes();
        if (planes.length == 0) return;
        ByteBuffer yBuf = planes[0].getBuffer();
        int w = img.getWidth();
        int h = img.getHeight();
        int rowStride = planes[0].getRowStride();

        byte[] data = new byte[w * h];
        if (rowStride == w) {
            yBuf.get(data, 0, w * h);
        } else {
            byte[] rowBuf = new byte[rowStride];
            for (int row = 0; row < h; row++) {
                yBuf.get(rowBuf, 0, rowStride);
                System.arraycopy(rowBuf, 0, data, row * w, w);
            }
        }

        PlanarYUVLuminanceSource src = new PlanarYUVLuminanceSource(
            data, w, h, 0, 0, w, h, false);
        BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(src));
        try {
            Result result = reader.decodeWithState(bitmap);
            String text = result != null ? result.getText() : null;
            if (text != null && !text.isEmpty() && decoded.compareAndSet(false, true)) {
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

    private void closeCamera() {
        if (captureSession != null) {
            captureSession.close();
            captureSession = null;
        }
        if (cameraDevice != null) {
            cameraDevice.close();
            cameraDevice = null;
        }
        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }
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
