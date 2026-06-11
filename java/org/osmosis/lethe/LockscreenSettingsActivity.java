package org.osmosis.lethe;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.provider.Settings;
import android.text.InputType;
import android.util.Log;
import android.view.View;
import android.widget.CheckBox;
import android.widget.RadioButton;
import android.widget.RadioGroup;

/**
 * Native lockscreen settings (lethe#191, Route 3 — see
 * docs/design/launcher-architecture-routes.md).
 *
 * Launch:  am start -a lethe.intent.LOCKSCREEN_SETTINGS
 *
 * Unlike the theme panel this writes the real enforcement surfaces, not
 * lethe properties: the secure-camera ban and the owner-info line go
 * through DevicePolicyManager (LETHE is Device Owner from first boot —
 * see BootReceiver.ensureDeviceOwner), notification visibility through
 * the Settings.Secure keys SystemUI's keyguard reads. Everything here
 * survives reboot via the platform's own persistence (device_policies.xml
 * and the settings provider) — no persist.lethe.* mirror needed.
 */
public class LockscreenSettingsActivity extends SettingsFormActivity {

    private static final String TAG = "lethe-ls-settings";

    // Settings.Secure keys — @hide constants on API 25, literals on purpose.
    private static final String S_SHOW_NOTIFS =
        "lock_screen_show_notifications";
    private static final String S_PRIVATE_NOTIFS =
        "lock_screen_allow_private_notifications";

    private DevicePolicyManager dpm;
    private ComponentName admin;
    private boolean adminActive;

    @Override
    protected void buildForm() {
        setTitle("Lockscreen");

        dpm = (DevicePolicyManager)
            getSystemService(Context.DEVICE_POLICY_SERVICE);
        admin = LetheDeviceAdmin.getComponent(this);
        adminActive = dpm != null && dpm.isAdminActive(admin);

        addDescription(
            "LETHE ships the lockscreen hardened: no notifications, no "
            + "camera shortcut, no owner info. Changes here apply "
            + "immediately and persist across reboots.");

        addSection("Notifications on lockscreen");
        buildNotificationModeGroup();

        addSection("Camera");
        CheckBox cam = addToggle("Allow camera on secure lockscreen",
            adminActive && isCameraAllowed(),
            new BooleanSetter() {
                @Override public void set(boolean value) {
                    setCameraAllowed(value);
                }
            });
        if (!adminActive) {
            cam.setEnabled(false);
            addDescription("Unavailable — LETHE is not an active device "
                + "admin yet (promoted at first boot).");
        }

        addSection("Owner info");
        addTextField("Lockscreen message (blank = none):",
            adminActive ? readOwnerInfo() : "", "",
            InputType.TYPE_CLASS_TEXT,
            new TextCommitter() {
                @Override public boolean commit(String value) {
                    return writeOwnerInfo(value);
                }
            });
    }

    // --- notification visibility -------------------------------------------

    private void buildNotificationModeGroup() {
        int show = Settings.Secure.getInt(
            getContentResolver(), S_SHOW_NOTIFS, 0);
        int priv = Settings.Secure.getInt(
            getContentResolver(), S_PRIVATE_NOTIFS, 0);

        RadioGroup group = new RadioGroup(this);
        final RadioButton hide = addMode(group, "Hide all (default)");
        final RadioButton redact = addMode(group, "Show, hide sensitive content");
        final RadioButton full = addMode(group, "Show all content");
        if (show == 0) hide.setChecked(true);
        else if (priv == 0) redact.setChecked(true);
        else full.setChecked(true);

        group.setOnCheckedChangeListener(new RadioGroup.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(RadioGroup g, int checkedId) {
                boolean showAny = checkedId != hide.getId();
                boolean showPrivate = checkedId == full.getId();
                Settings.Secure.putInt(getContentResolver(),
                    S_SHOW_NOTIFS, showAny ? 1 : 0);
                Settings.Secure.putInt(getContentResolver(),
                    S_PRIVATE_NOTIFS, showPrivate ? 1 : 0);
                Log.i(TAG, "lockscreen notifications: show=" + showAny
                    + " private=" + showPrivate);
            }
        });
        root.addView(group);
    }

    private RadioButton addMode(RadioGroup group, String label) {
        RadioButton rb = new RadioButton(this);
        rb.setText(label);
        rb.setId(View.generateViewId());
        group.addView(rb);
        return rb;
    }

    // --- secure-camera keyguard feature --------------------------------------

    private boolean isCameraAllowed() {
        int features = dpm.getKeyguardDisabledFeatures(admin);
        return (features
            & DevicePolicyManager.KEYGUARD_DISABLE_SECURE_CAMERA) == 0;
    }

    private void setCameraAllowed(boolean allowed) {
        try {
            int features = dpm.getKeyguardDisabledFeatures(admin);
            if (allowed) {
                features &= ~DevicePolicyManager.KEYGUARD_DISABLE_SECURE_CAMERA;
            } else {
                features |= DevicePolicyManager.KEYGUARD_DISABLE_SECURE_CAMERA;
            }
            dpm.setKeyguardDisabledFeatures(admin, features);
            Log.i(TAG, "keyguard features=" + features);
        } catch (SecurityException e) {
            Log.w(TAG, "setKeyguardDisabledFeatures denied", e);
            toast("Not applied — device admin inactive");
        }
    }

    // --- owner info -----------------------------------------------------------

    private String readOwnerInfo() {
        try {
            CharSequence info = dpm.getDeviceOwnerLockScreenInfo();
            return info != null ? info.toString() : "";
        } catch (SecurityException e) {
            return "";
        }
    }

    /** Owner info via the Device Owner API (API 24+) — the Settings.Secure
     *  owner-info keys stopped driving the N keyguard when storage moved
     *  to LockSettingsService, so DPM is the path that actually renders. */
    private boolean writeOwnerInfo(String value) {
        try {
            dpm.setDeviceOwnerLockScreenInfo(admin,
                value.isEmpty() ? null : value);
            Log.i(TAG, "owner info " + (value.isEmpty() ? "cleared" : "set"));
            return true;
        } catch (SecurityException e) {
            Log.w(TAG, "setDeviceOwnerLockScreenInfo denied", e);
            toast("Not applied — LETHE is not device owner yet");
            return false;
        }
    }
}
