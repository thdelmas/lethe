package org.osmosis.lethe;

import android.annotation.TargetApi;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import android.util.Log;

/**
 * Quick Settings tile — one-tap lockdown mode.
 * Kills WiFi, Bluetooth, and mobile data, disables sensors.
 * Software equivalent of Librem 5/PinePhone hardware kill switches.
 *
 * Requires API 24+ (Android 7.0, Quick Settings Tile API).
 * Declared in the generated AndroidManifest.xml.
 */
@TargetApi(Build.VERSION_CODES.N)
public class LetheTileService extends TileService {

    private static final String TAG = "lethe-tile";
    private boolean lockdownActive = false;

    @Override
    public void onStartListening() {
        updateTile();
    }

    @Override
    public void onClick() {
        lockdownActive = !lockdownActive;
        Log.i(TAG, "Lockdown mode " + (lockdownActive ? "ACTIVATED" : "deactivated"));

        if (lockdownActive) {
            activateLockdown();
        } else {
            deactivateLockdown();
        }

        updateTile();
    }

    private void activateLockdown() {
        // Kill radios: WiFi, Bluetooth, mobile data
        exec("svc wifi disable");
        exec("svc data disable");
        exec("settings put global bluetooth_on 0");
        // Disable sensors (camera, mic indicators stay on if accessed)
        LetheConfig.set("persist.lethe.lockdown.active", "true");
        Log.i(TAG, "Radios killed, sensors restricted");
    }

    private void deactivateLockdown() {
        exec("svc wifi enable");
        exec("svc data enable");
        exec("settings put global bluetooth_on 1");
        LetheConfig.set("persist.lethe.lockdown.active", "false");
        Log.i(TAG, "Radios restored");
    }

    private void updateTile() {
        Tile tile = getQsTile();
        if (tile == null) return;
        tile.setLabel(lockdownActive ? "Lockdown ON" : "Lockdown");
        tile.setState(lockdownActive ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        tile.updateTile();
    }

    private static void exec(String cmd) {
        try {
            Runtime.getRuntime().exec(
                new String[]{"/system/bin/sh", "-c", cmd});
        } catch (Exception e) {
            Log.e(TAG, "exec failed: " + cmd, e);
        }
    }
}
