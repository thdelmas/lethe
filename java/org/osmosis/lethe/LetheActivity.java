package org.osmosis.lethe;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.AlarmClock;
import android.util.Base64;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;

import java.io.ByteArrayOutputStream;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * LETHE Void Launcher — WebView home screen + native chat input.
 *
 * Layout: WebView (fills screen) + native input bar (EditText + send button).
 * The input bar is hidden on the home screen and shown when chat opens.
 * The keyboard resizes around the native EditText — no WebView keyboard bugs.
 */
public class LetheActivity extends Activity {
    private static final String TAG = "lethe-launcher";
    private WebView webView;
    private LinearLayout inputBar;
    private EditText inputField;
    private BroadcastReceiver pairReceiver;
    private LethePhone phone;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LetheConfig.initConfigDir(this);
        phone = new LethePhone(this);

        // Persistent burner mode notification (also posted at boot by BootReceiver)
        if ("true".equals(LetheConfig.get("persist.lethe.burner.enabled", "false")))
            BootReceiver.showBurnerNotification(this);

        getWindow().setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        // Root layout: WebView on top, native input bar at bottom
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF080808);

        // WebView fills available space
        webView = new WebView(this);
        configureWebView(webView);
        webView.addJavascriptInterface(new NativeLauncher(), "NativeLauncher");
        webView.addJavascriptInterface(new NativeSpeech(), "NativeSpeech");
        webView.loadUrl(
            "file:///system/extras/lethe/agent/static/launcher.html");

        LinearLayout.LayoutParams wvParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        root.addView(webView, wvParams);

        // Native input bar — hidden by default, shown when chat opens
        inputBar = new LinearLayout(this);
        inputBar.setOrientation(LinearLayout.HORIZONTAL);
        inputBar.setBackgroundColor(0xFF0a0a0a);
        inputBar.setPadding(16, 8, 8, 8);
        inputBar.setVisibility(View.GONE);

        inputField = new EditText(this);
        inputField.setHint("Talk to LETHE...");
        inputField.setHintTextColor(0xFF3a5840);
        inputField.setTextColor(0xFFdcc8c0);
        inputField.setBackgroundColor(0xFF121210);
        inputField.setSingleLine(true);
        inputField.setTextSize(16);
        inputField.setPadding(24, 16, 24, 16);
        inputField.setImeOptions(EditorInfo.IME_ACTION_SEND);
        inputField.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                sendFromNative();
                return true;
            }
            return false;
        });

        LinearLayout.LayoutParams etParams = new LinearLayout.LayoutParams(
            0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        etParams.setMargins(0, 0, 8, 0);
        inputBar.addView(inputField, etParams);

        // Send button
        ImageButton sendBtn = new ImageButton(this);
        sendBtn.setImageResource(android.R.drawable.ic_menu_send);
        sendBtn.setBackgroundColor(Color.TRANSPARENT);
        sendBtn.setColorFilter(0xFF22e8a0);
        sendBtn.setPadding(16, 16, 16, 16);
        sendBtn.setOnClickListener(v -> sendFromNative());

        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT);
        inputBar.addView(sendBtn, btnParams);

        root.addView(inputBar, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT));

        setContentView(root);

        // Listen for pairing broadcasts from OSmosis over USB
        pairReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                String prov = intent.getStringExtra("provider");
                String key = intent.getStringExtra("key");
                String model = intent.getStringExtra("model");
                if (prov == null || key == null) return;
                Log.i(TAG, "Pair received: " + prov);
                // Merge into /persist config
                try {
                    org.json.JSONObject cfg = new org.json.JSONObject(
                        LetheConfig.loadPersistedConfig());
                    org.json.JSONObject provs =
                        cfg.getJSONObject("providers");
                    org.json.JSONObject pc = provs.optJSONObject(prov);
                    if (pc == null) pc = new org.json.JSONObject();
                    pc.put("key", key);
                    if (model != null && !model.isEmpty())
                        pc.put("model", model);
                    provs.put(prov, pc);
                    cfg.put("active_provider", prov);
                    LetheConfig.savePersistedConfig(cfg.toString());
                } catch (Exception e) {
                    Log.e(TAG, "Pair config merge failed", e);
                }
                // Reload config in JS
                webView.evaluateJavascript(
                    "if(typeof reloadConfig==='function')reloadConfig();"
                    + "if(typeof addMessage==='function')"
                    + "addMessage('Paired with " + prov
                    + ". Ready to talk.','lethe');", null);
            }
        };
        registerReceiver(pairReceiver,
            new android.content.IntentFilter("lethe.intent.PAIR"));

        Log.i(TAG, "Void Launcher started");
    }

    @Override
    protected void onDestroy() {
        if (pairReceiver != null) unregisterReceiver(pairReceiver);
        super.onDestroy();
    }

    private void sendFromNative() {
        String text = inputField.getText().toString().trim();
        if (text.isEmpty()) return;
        inputField.setText("");
        // Pass to JS — the WebView handles chat logic
        String escaped = text.replace("\\", "\\\\")
            .replace("'", "\\'").replace("\n", "\\n");
        webView.evaluateJavascript(
            "if(typeof nativeSend==='function')nativeSend('" + escaped + "')",
            null);
    }

    private void configureWebView(WebView wv) {
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        wv.setWebViewClient(new WebViewClient());
        wv.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage cm) {
                Log.d(TAG, "JS:" + cm.lineNumber() + " " + cm.message());
                return true;
            }

            /* Grant in-WebView camera access for the QR scanner.
             * Only grants VIDEO_CAPTURE — never audio or protected media. */
            @Override
            public void onPermissionRequest(
                    final android.webkit.PermissionRequest request) {
                runOnUiThread(() -> {
                    String[] want = request.getResources();
                    java.util.List<String> granted = new java.util.ArrayList<>();
                    for (String r : want) {
                        if (android.webkit.PermissionRequest
                                .RESOURCE_VIDEO_CAPTURE.equals(r)) {
                            granted.add(r);
                        }
                    }
                    if (granted.isEmpty()) {
                        request.deny();
                    } else {
                        request.grant(granted.toArray(new String[0]));
                    }
                });
            }
        });
        wv.setBackgroundColor(0xFF080808);
    }

    @Override
    public void onBackPressed() {
        goHome();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Home button pressed while already on top → go to home screen
        goHome();
    }

    private void goHome() {
        webView.evaluateJavascript(
            "typeof closeChat==='function'&&closeChat();" +
            "typeof closeDrawer==='function'&&closeDrawer()", null);
        if (inputBar.getVisibility() == View.VISIBLE) {
            inputBar.setVisibility(View.GONE);
            inputField.clearFocus();
        }
    }

    private static final int QR_SCAN_REQUEST = 0x514C; // "QL"

    @Override
    protected void onActivityResult(int requestCode, int resultCode,
            Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == QR_SCAN_REQUEST && resultCode == RESULT_OK
                && data != null) {
            String result = data.getStringExtra("SCAN_RESULT");
            if (result != null) {
                String escaped = result.replace("\\", "\\\\")
                    .replace("'", "\\'");
                webView.evaluateJavascript(
                    "typeof onQRResult==='function'&&onQRResult('"
                    + escaped + "')", null);
            }
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            webView.evaluateJavascript(
                "typeof toggleDrawer==='function'&&toggleDrawer()", null);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /** NativeLauncher — JS bridge */
    class NativeLauncher {

        @JavascriptInterface
        public String loadConfig() {
            return LetheConfig.loadPersistedConfig();
        }

        @JavascriptInterface
        public String saveConfig(String json) {
            return LetheConfig.savePersistedConfig(json);
        }

        /* Settings panel toggles map to system properties. Whitelist only:
         * never let WebView JS write arbitrary system properties. Side
         * effect: persist.lethe.mesh.enabled also starts/stops the mesh
         * service so the toggle works without reboot. */
        @JavascriptInterface
        public void setSystemProp(String key, String value) {
            if (key == null || value == null) return;
            boolean allowed = false;
            switch (key) {
                case "persist.lethe.mesh.enabled":
                case "persist.lethe.mesh.ble":
                case "persist.lethe.p2p.enabled":
                case "persist.lethe.bfu.enabled":
                case "persist.lethe.bfu.timeout":
                    // Whitelisted writes through the JS bridge. The legacy
                    // entry persist.lethe.deadman.duress_pin.enabled (40
                    // chars) was removed: it overflows PROP_NAME_MAX on
                    // cm-14.1 so __system_property_set rejected it even
                    // when allowed here. Tracked in the cm-14.1
                    // PROP_NAME_MAX audit follow-up.
                    allowed = true;
                    break;
                default:
                    // Auto-wipe policy keys live under persist.lethe.aw.*
                    // and are toggled from settings-autowipe.js. Whitelist
                    // by prefix rather than per-key so adding a new trigger
                    // doesn't require a Java edit. Prefix shortened from
                    // persist.lethe.autowipe.* to fit Android 7.1's 31-char
                    // PROP_NAME_MAX — see AutoWipePolicy header.
                    if (key.startsWith("persist.lethe.aw.")) {
                        allowed = true;
                    }
                    break;
            }
            if (!allowed) {
                Log.w(TAG, "setSystemProp denied for " + key);
                return;
            }
            LetheConfig.set(key, value);
            // Push autowipe policy changes to DPM live so the keyguard
            // threshold updates without waiting for next boot.
            if (key.startsWith("persist.lethe.aw.")) {
                AutoWipePolicy.applyPolicy(LetheActivity.this);
            }
            if ("persist.lethe.mesh.enabled".equals(key)) {
                Intent svc = new Intent(LetheActivity.this,
                    LetheMeshService.class);
                if ("true".equals(value)) {
                    NotificationChannelCompat.startServiceCompat(
                        LetheActivity.this, svc);
                } else {
                    stopService(svc);
                }
            }
        }

        /** Read a whitelisted system property. Same prefix policy as
         *  setSystemProp — keep the surface tight. */
        @JavascriptInterface
        public String getSystemProp(String key, String defaultValue) {
            if (key == null) return defaultValue;
            if (key.startsWith("persist.lethe.")) {
                return LetheConfig.get(key, defaultValue == null ? "" : defaultValue);
            }
            return defaultValue == null ? "" : defaultValue;
        }

        @JavascriptInterface
        public void openAppDrawer() {
            runOnUiThread(() -> webView.evaluateJavascript(
                "typeof openDrawer==='function'&&openDrawer()", null));
        }

        @JavascriptInterface
        public void showInputBar() {
            runOnUiThread(() -> {
                inputBar.setVisibility(View.VISIBLE);
                inputField.requestFocus();
            });
        }

        @JavascriptInterface
        public void hideInputBar() {
            runOnUiThread(() -> {
                inputBar.setVisibility(View.GONE);
                inputField.clearFocus();
            });
        }

        @JavascriptInterface
        public String getInstalledApps() {
            try {
                Intent mainIntent = new Intent(Intent.ACTION_MAIN);
                mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
                PackageManager pm = getPackageManager();
                List<ResolveInfo> apps =
                    pm.queryIntentActivities(mainIntent, 0);
                Collections.sort(apps,
                    new ResolveInfo.DisplayNameComparator(pm));

                JSONArray arr = new JSONArray();
                String self = getPackageName();
                for (ResolveInfo ri : apps) {
                    String pkg = ri.activityInfo.packageName;
                    if (pkg.equals(self)) continue;
                    JSONObject obj = new JSONObject();
                    obj.put("label", ri.loadLabel(pm).toString());
                    obj.put("package", pkg);
                    obj.put("activity", ri.activityInfo.name);
                    obj.put("icon", iconBase64(ri, pm));
                    arr.put(obj);
                }
                return arr.toString();
            } catch (Exception e) {
                Log.e(TAG, "getInstalledApps failed", e);
                return "[]";
            }
        }

        @JavascriptInterface
        public void launchApp(String pkg, String activity) {
            runOnUiThread(() -> {
                try {
                    Intent i;
                    if (activity != null && !activity.isEmpty()) {
                        i = new Intent();
                        i.setClassName(pkg, activity);
                    } else {
                        i = getPackageManager()
                            .getLaunchIntentForPackage(pkg);
                    }
                    if (i != null) {
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(i);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "launchApp failed: " + pkg, e);
                }
            });
        }

        @JavascriptInterface
        public void expandNotifications() {
            runOnUiThread(() -> {
                try {
                    Object sb = getSystemService("statusbar");
                    Method m = Class.forName(
                        "android.app.StatusBarManager")
                        .getMethod("expandNotificationsPanel");
                    m.invoke(sb);
                } catch (Exception e) {
                    Log.e(TAG, "expandNotifications failed", e);
                }
            });
        }

        @JavascriptInterface
        public void screenOff() {
            runOnUiThread(() -> {
                try {
                    PowerManager pm = (PowerManager)
                        getSystemService(Context.POWER_SERVICE);
                    Method m = pm.getClass()
                        .getMethod("goToSleep", long.class);
                    m.invoke(pm, System.currentTimeMillis());
                } catch (Exception e) {
                    Log.e(TAG, "screenOff failed", e);
                }
            });
        }

        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(() -> startActivity(
                new Intent(android.provider.Settings.ACTION_SETTINGS)
                    .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK)));
        }

        @JavascriptInterface
        public void scanQR() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(
                        "com.google.zxing.client.android.SCAN");
                    intent.putExtra("SCAN_MODE", "QR_CODE_MODE");
                    startActivityForResult(intent, QR_SCAN_REQUEST);
                } catch (Exception e) {
                    // ZXing not installed — try ML Kit or camera fallback
                    Log.w(TAG, "QR scanner not available: " + e);
                    webView.evaluateJavascript(
                        "typeof onQRResult==='function'&&" +
                        "onQRResult('ERROR:No QR scanner app installed')",
                        null);
                }
            });
        }

        @JavascriptInterface
        public void executeAction(String action, String argsJson) {
            runOnUiThread(() -> { try {
                JSONObject args = new JSONObject(argsJson);
                switch (action) {
                    case "set_timer": {
                        Intent t = new Intent(AlarmClock.ACTION_SET_TIMER);
                        t.putExtra(AlarmClock.EXTRA_LENGTH, args.optInt("seconds", 60));
                        if (args.has("label"))
                            t.putExtra(AlarmClock.EXTRA_MESSAGE, args.getString("label"));
                        t.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
                        t.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(t);
                        break;
                    }
                    case "set_alarm": {
                        Intent a = new Intent(AlarmClock.ACTION_SET_ALARM);
                        a.putExtra(AlarmClock.EXTRA_HOUR, args.optInt("hour", 8));
                        a.putExtra(AlarmClock.EXTRA_MINUTES, args.optInt("minute", 0));
                        if (args.has("label"))
                            a.putExtra(AlarmClock.EXTRA_MESSAGE, args.getString("label"));
                        a.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
                        a.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(a);
                        break;
                    }
                    case "toggle_flashlight":
                        if (Build.VERSION.SDK_INT >= 23) {
                            android.hardware.camera2.CameraManager cm =
                                (android.hardware.camera2.CameraManager)
                                    getSystemService(Context.CAMERA_SERVICE);
                            cm.setTorchMode(cm.getCameraIdList()[0], true);
                        }
                        break;
                    case "open_app":
                        launchApp(resolveApp(args.optString("app", "")), "");
                        break;
                    case "make_call":
                        phone.makeCall(args.optString("number", ""));
                        break;
                    case "send_sms":
                        phone.sendSms(args.optString("number", ""),
                            args.optString("message", ""));
                        break;
                    case "add_contact":
                        phone.addContact(args);
                        break;
                }
            } catch (Exception e) {
                Log.e(TAG, "executeAction: " + action, e);
            } });
        }

        @JavascriptInterface
        public String readSms(String argsJson) {
            return phone.readSms(argsJson);
        }

        @JavascriptInterface
        public String getContacts(String query) {
            return phone.getContacts(query);
        }

        private String resolveApp(String n) {
            switch (n.toLowerCase()) {
                case "camera": return "org.lineageos.snap";
                case "browser": return "us.spotco.fennec_dos";
                case "phone": case "dialer":
                    return "com.android.dialer";
                case "messages": case "sms":
                    return "com.android.messaging";
                case "settings": return "com.android.settings";
                default: return n;
            }
        }
    }
    class NativeSpeech {
        @JavascriptInterface public boolean isAvailable() { return false; }
        @JavascriptInterface public void listen() {}
    }

    private String iconBase64(ResolveInfo ri, PackageManager pm) {
        try {
            Drawable d = ri.loadIcon(pm);
            Bitmap b = Bitmap.createBitmap(48, 48, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            d.setBounds(0, 0, 48, 48);
            d.draw(c);
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.PNG, 80, o);
            b.recycle();
            return "data:image/png;base64," +
                Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }
}
