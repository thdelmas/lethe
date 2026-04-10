package org.osmosis.lethe;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Bundle;
import android.text.InputType;
import android.util.Log;
import android.widget.EditText;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.security.MessageDigest;

/**
 * Floating dialog for dead man's switch check-in.
 * User enters their passphrase; on match, the heartbeat file is updated.
 * After 3 failures, the device locks to passphrase-only.
 */
public class CheckinDialogActivity extends Activity {

    private static final String TAG = "lethe-deadman";
    private static final String HEARTBEAT_PATH =
        "/persist/lethe/deadman/last_checkin";
    private static final String PASSPHRASE_HASH_PATH =
        "/persist/lethe/deadman/passphrase_hash";
    private static final int MAX_ATTEMPTS = 3;

    private int attempts = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showDialog();
    }

    private void showDialog() {
        EditText input = new EditText(this);
        input.setInputType(
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        input.setHint("Enter maintenance code");

        new AlertDialog.Builder(this)
            .setTitle("Scheduled maintenance")
            .setView(input)
            .setCancelable(true)
            .setPositiveButton("OK", (dialog, which) -> verify(input.getText().toString()))
            .setNegativeButton("Cancel", (dialog, which) -> finish())
            .setOnCancelListener(d -> finish())
            .show();
    }

    private void verify(String passphrase) {
        String storedHash = LetheConfig.readFile(PASSPHRASE_HASH_PATH, "");
        if (storedHash.isEmpty()) {
            // No passphrase set — any check-in succeeds
            checkinSuccess();
            return;
        }

        String inputHash = sha256(passphrase);
        if (storedHash.equals(inputHash)) {
            checkinSuccess();
        } else {
            attempts++;
            Log.w(TAG, "Check-in failed, attempt " + attempts + "/" + MAX_ATTEMPTS);
            if (attempts >= MAX_ATTEMPTS) {
                Log.w(TAG, "Max attempts reached — locking device");
                LetheConfig.set("persist.lethe.deadman.stage", "locked");
                Toast.makeText(this, "Device locked", Toast.LENGTH_SHORT).show();
                finish();
            } else {
                Toast.makeText(this,
                    "Incorrect (" + (MAX_ATTEMPTS - attempts) + " remaining)",
                    Toast.LENGTH_SHORT).show();
                showDialog();
            }
        }
    }

    private void checkinSuccess() {
        long epoch = System.currentTimeMillis() / 1000;
        try {
            File dir = new File("/persist/lethe/deadman");
            if (!dir.exists()) dir.mkdirs();
            try (FileOutputStream fos = new FileOutputStream(HEARTBEAT_PATH)) {
                fos.write(String.valueOf(epoch).getBytes());
            }
            Log.i(TAG, "Check-in successful, heartbeat updated to " + epoch);
        } catch (Exception e) {
            Log.e(TAG, "Failed to write heartbeat", e);
        }

        // Clear the notification
        NotificationManager nm = (NotificationManager)
            getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(CheckinReceiver.NOTIFICATION_ID);

        Toast.makeText(this, "OK", Toast.LENGTH_SHORT).show();
        finish();
    }

    private static String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }
}
