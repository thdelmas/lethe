package org.osmosis.lethe;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.text.InputType;
import android.util.Log;
import android.widget.EditText;
import android.widget.Toast;

import java.security.MessageDigest;

/**
 * Settings activity for the dead man's switch.
 * Disabling DMS requires the passphrase — prevents an adversary
 * with device access from silently turning it off.
 *
 * Launched from Settings > Privacy > Dead Man's Switch.
 * Exported so the Settings app can launch it via intent.
 */
public class DeadmanSettingsActivity extends Activity {

    private static final String TAG = "lethe-deadman";
    private static final String PASSPHRASE_HASH_PATH =
        "/persist/lethe/deadman/passphrase_hash";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (!LetheConfig.isDeadmanEnabled()) {
            // Already disabled — show enable dialog instead
            showEnableDialog();
        } else {
            showDisableDialog();
        }
    }

    private void showDisableDialog() {
        EditText input = new EditText(this);
        input.setInputType(
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        input.setHint("Enter dead man's switch passphrase");

        new AlertDialog.Builder(this)
            .setTitle("Disable dead man's switch")
            .setMessage("Enter your passphrase to disable. "
                + "The device will no longer protect itself if you stop checking in.")
            .setView(input)
            .setCancelable(true)
            .setPositiveButton("Disable", (dialog, which) -> {
                verifyAndDisable(input.getText().toString());
            })
            .setNegativeButton("Cancel", (dialog, which) -> finish())
            .setOnCancelListener(d -> finish())
            .show();
    }

    private void verifyAndDisable(String passphrase) {
        String storedHash = LetheConfig.readFile(PASSPHRASE_HASH_PATH, "");

        if (!storedHash.isEmpty() && !storedHash.equals(sha256(passphrase))) {
            Log.w(TAG, "DMS disable: wrong passphrase");
            Toast.makeText(this, "Incorrect passphrase", Toast.LENGTH_SHORT).show();
            showDisableDialog();
            return;
        }

        LetheConfig.set("persist.lethe.deadman.enabled", "false");
        Log.i(TAG, "Dead man's switch disabled by user (passphrase verified)");
        Toast.makeText(this, "Dead man's switch disabled", Toast.LENGTH_SHORT).show();
        finish();
    }

    private void showEnableDialog() {
        new AlertDialog.Builder(this)
            .setTitle("Dead man's switch")
            .setMessage("The dead man's switch is currently disabled. "
                + "Enable it to protect your device if you stop checking in.")
            .setPositiveButton("Enable", (dialog, which) -> {
                LetheConfig.set("persist.lethe.deadman.enabled", "true");
                Log.i(TAG, "Dead man's switch enabled by user");
                Toast.makeText(this,
                    "Dead man's switch enabled", Toast.LENGTH_SHORT).show();
                finish();
            })
            .setNegativeButton("Cancel", (dialog, which) -> finish())
            .setOnCancelListener(d -> finish())
            .show();
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
