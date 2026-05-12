package org.osmosis.lethe;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Mesh signaling service — broadcasts an HMAC-tagged heartbeat over BLE so
 * peers in the same trust ring can detect each other without internet.
 *
 * Phase 1: self-contained AOSP BLE advertiser/scanner. Carries no message
 * content, only structured signals (device id, sequence, timestamp).
 * Phase 2 (future): bridge to Briar bramble-core so deadman alarms can
 * relay over the user's Briar contact graph.
 */
public class LetheMeshService extends Service {

    private static final String TAG = "lethe-mesh";
    private static final ParcelUuid SERVICE_UUID =
        ParcelUuid.fromString("4c455448-454d-4553-4831-000000000001");
    private static final String CHANNEL_ID = "lethe_mesh";
    private static final int NOTIFICATION_ID = 0x4D455348;
    private static final int PAYLOAD_LEN = 21;
    private static final int HEADER_LEN = 13;
    private static final int TAG_LEN = 8;

    private byte[] hmacKey;
    private byte[] deviceId;
    private long seq;
    private long heartbeatIntervalMs;
    private BluetoothLeAdvertiser advertiser;
    private BluetoothLeScanner scanner;
    private AdvertiseCallback advCb;
    private ScanCallback scanCb;
    private Handler handler;
    private final Map<String, JSONObject> peers = new HashMap<>();
    private File meshDir;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        meshDir = new File(getFilesDir(), "mesh");
        if (!meshDir.exists()) meshDir.mkdirs();

        startForegroundCompat();

        if (!loadOrGenerateTrust()) {
            Log.e(TAG, "trust load failed; stopping");
            stopSelf();
            return;
        }
        seq = loadSeq();
        heartbeatIntervalMs = LetheConfig.getMeshBleIntervalMs();

        BluetoothManager bm =
            (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = bm == null ? null : bm.getAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            Log.w(TAG, "Bluetooth disabled; mesh idle");
            return;
        }
        advertiser = adapter.getBluetoothLeAdvertiser();
        scanner = adapter.getBluetoothLeScanner();

        if (LetheConfig.isMeshBleEnabled()) {
            scheduleHeartbeat();
            startScanning();
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (handler != null) handler.removeCallbacksAndMessages(null);
        stopAdvertising();
        stopScanning();
        super.onDestroy();
    }

    /* ── Trust ring (HMAC key + device id) ── */

    private boolean loadOrGenerateTrust() {
        File f = new File(meshDir, "trust.json");
        if (!f.exists()) generateTrust(f);
        try {
            byte[] buf = readFully(f);
            JSONObject o = new JSONObject(new String(buf, "UTF-8"));
            hmacKey = hexToBytes(o.getString("hmac_key_hex"));
            deviceId = hexToBytes(o.getString("device_id_hex"));
            return hmacKey.length == 32 && deviceId.length == 4;
        } catch (Exception e) {
            Log.e(TAG, "trust parse failed", e);
            return false;
        }
    }

    private void generateTrust(File f) {
        try {
            byte[] key = new byte[32];
            byte[] id = new byte[4];
            SecureRandom rng = new SecureRandom();
            rng.nextBytes(key);
            rng.nextBytes(id);
            JSONObject o = new JSONObject()
                .put("hmac_key_hex", bytesToHex(key))
                .put("device_id_hex", bytesToHex(id))
                .put("created_ts", System.currentTimeMillis() / 1000L);
            try (FileWriter w = new FileWriter(f)) { w.write(o.toString()); }
            f.setReadable(false, false);
            f.setReadable(true, true);
        } catch (Exception e) {
            Log.e(TAG, "trust gen failed", e);
        }
    }

    /* ── Advertising ── */

    private void scheduleHeartbeat() {
        if (advertiser == null) return;
        advCb = new AdvertiseCallback() {
            @Override
            public void onStartFailure(int errorCode) {
                Log.w(TAG, "advertise fail " + errorCode);
            }
        };
        Runnable beat = new Runnable() {
            @Override
            public void run() {
                emitHeartbeat();
                handler.postDelayed(this, heartbeatIntervalMs);
            }
        };
        handler.post(beat);
    }

    private void emitHeartbeat() {
        if (advertiser == null) return;
        seq++;
        saveSeq();
        byte[] payload = buildPayload(deviceId, seq,
            System.currentTimeMillis() / 1000L);
        AdvertiseData data = new AdvertiseData.Builder()
            .addServiceUuid(SERVICE_UUID)
            .addServiceData(SERVICE_UUID, payload)
            .build();
        AdvertiseSettings settings = new AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(false)
            .setTimeout(0)
            .build();
        try { advertiser.stopAdvertising(advCb); } catch (Exception ignore) {}
        try {
            advertiser.startAdvertising(settings, data, advCb);
        } catch (Exception e) {
            Log.w(TAG, "startAdvertising", e);
        }
    }

    private byte[] buildPayload(byte[] id, long seqNum, long ts) {
        ByteBuffer bb = ByteBuffer.allocate(PAYLOAD_LEN);
        bb.put((byte) 0x01);
        bb.put(id);
        bb.putInt((int) seqNum);
        bb.putInt((int) ts);
        byte[] full = bb.array();
        byte[] tag = hmac(hmacKey, full, 0, HEADER_LEN);
        System.arraycopy(tag, 0, full, HEADER_LEN, TAG_LEN);
        return full;
    }

    private void stopAdvertising() {
        if (advertiser != null && advCb != null) {
            try { advertiser.stopAdvertising(advCb); } catch (Exception ignore) {}
        }
    }

    /* ── Scanning ── */

    private void startScanning() {
        if (scanner == null) return;
        ScanFilter filter = new ScanFilter.Builder()
            .setServiceUuid(SERVICE_UUID).build();
        ScanSettings settings = new ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
            .build();
        scanCb = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult r) {
                handleScanResult(r);
            }
        };
        try {
            scanner.startScan(Collections.singletonList(filter),
                settings, scanCb);
        } catch (Exception e) {
            Log.w(TAG, "startScan", e);
        }
    }

    private void handleScanResult(ScanResult r) {
        if (r.getScanRecord() == null) return;
        byte[] payload = r.getScanRecord().getServiceData(SERVICE_UUID);
        if (payload == null || payload.length != PAYLOAD_LEN) return;
        if (payload[0] != 0x01) return;

        byte[] expected = hmac(hmacKey, payload, 0, HEADER_LEN);
        for (int i = 0; i < TAG_LEN; i++) {
            if (expected[i] != payload[HEADER_LEN + i]) return;
        }

        ByteBuffer bb = ByteBuffer.wrap(payload);
        bb.get();
        byte[] id = new byte[4]; bb.get(id);
        int peerSeq = bb.getInt();
        int peerTs = bb.getInt();
        String idHex = bytesToHex(id);

        if (idHex.equals(bytesToHex(deviceId))) return;
        if (peers.size() >= LetheConfig.getMeshMaxPeers()
            && !peers.containsKey(idHex)) return;

        try {
            JSONObject prev = peers.get(idHex);
            if (prev != null && prev.optInt("last_seq", 0) >= peerSeq) return;
            JSONObject p = new JSONObject()
                .put("device_id", idHex)
                .put("last_seq", peerSeq)
                .put("last_ts", peerTs)
                .put("rssi", r.getRssi())
                .put("seen_at", System.currentTimeMillis() / 1000L);
            peers.put(idHex, p);
            persistPeers();
        } catch (Exception e) {
            Log.w(TAG, "scan parse", e);
        }
    }

    private void stopScanning() {
        if (scanner != null && scanCb != null) {
            try { scanner.stopScan(scanCb); } catch (Exception ignore) {}
        }
    }

    /* ── Persistence ── */

    private void persistPeers() {
        try {
            JSONArray arr = new JSONArray();
            for (JSONObject p : peers.values()) arr.put(p);
            File f = new File(meshDir, "peers.json");
            try (FileWriter w = new FileWriter(f)) { w.write(arr.toString()); }
        } catch (Exception e) {
            Log.w(TAG, "persistPeers", e);
        }
    }

    private long loadSeq() {
        File f = new File(meshDir, "seq");
        if (!f.exists()) return 0L;
        try {
            return Long.parseLong(new String(readFully(f), "UTF-8").trim());
        } catch (Exception e) {
            return 0L;
        }
    }

    private void saveSeq() {
        try {
            File f = new File(meshDir, "seq");
            try (FileWriter w = new FileWriter(f)) {
                w.write(Long.toString(seq));
            }
        } catch (Exception e) {
            Log.w(TAG, "saveSeq", e);
        }
    }

    /* ── Foreground notification ── */

    private void startForegroundCompat() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager)
            getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        new NotificationChannelCompat(
                CHANNEL_ID, "Mesh signaling", NotificationChannelCompat.IMPORTANCE_MIN)
            .setDescription("Active when LETHE mesh broadcasts heartbeats")
            .setEnableVibration(false)
            .setSilent()
            .ensure(nm);
        Notification n = NotificationChannelCompat.newBuilder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle("LETHE mesh active")
            .setContentText("Broadcasting heartbeat")
            .setOngoing(true)
            .build();
        startForeground(NOTIFICATION_ID, n);
    }

    /* ── Crypto + IO helpers ── */

    private static byte[] hmac(byte[] key, byte[] data, int off, int len) {
        try {
            Mac m = Mac.getInstance("HmacSHA256");
            m.init(new SecretKeySpec(key, "HmacSHA256"));
            m.update(data, off, len);
            return m.doFinal();
        } catch (Exception e) {
            return new byte[32];
        }
    }

    private static byte[] readFully(File f) throws IOException {
        byte[] buf = new byte[(int) f.length()];
        try (FileInputStream fis = new FileInputStream(f)) {
            int read = 0;
            while (read < buf.length) {
                int n = fis.read(buf, read, buf.length - read);
                if (n <= 0) break;
                read += n;
            }
        }
        return buf;
    }

    private static String bytesToHex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    private static byte[] hexToBytes(String s) {
        int n = s.length();
        byte[] out = new byte[n / 2];
        for (int i = 0; i < n; i += 2) {
            out[i / 2] = (byte) Integer.parseInt(s.substring(i, i + 2), 16);
        }
        return out;
    }
}
