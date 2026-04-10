package org.osmosis.lethe;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

/**
 * Persistent notification service — placeholder for always-on quick access.
 * Started by BootReceiver on BOOT_COMPLETED.
 */
public class LetheNotificationService extends Service {

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
