package org.osmosis.lethe;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.AlarmClock;
import android.util.Base64;
import android.util.Log;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * LETHE Void Launcher — WebView wrapper that IS the home screen.
 * Loads launcher.html and injects NativeLauncher + NativeSpeech bridges.
 */
public class LetheActivity extends Activity {

    private static final String TAG = "lethe-launcher";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN);

        webView = new WebView(this);
        configureWebView(webView);

        webView.addJavascriptInterface(new NativeLauncher(), "NativeLauncher");
        webView.addJavascriptInterface(new NativeSpeech(), "NativeSpeech");

        webView.loadUrl("file:///system/extras/lethe/agent/static/launcher.html");
        setContentView(webView);
        Log.i(TAG, "Void Launcher started");
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
        });
        wv.setBackgroundColor(0xFF080808);
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript("typeof closeDrawer==='function'&&closeDrawer()", null);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            if (webView != null) {
                webView.evaluateJavascript("typeof toggleDrawer==='function'&&toggleDrawer()", null);
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /** NativeLauncher — JS bridge for launcher.js */
    class NativeLauncher {

        @JavascriptInterface
        public void openAppDrawer() {
            runOnUiThread(() -> {
                if (webView != null)
                    webView.evaluateJavascript("typeof openDrawer==='function'&&openDrawer()", null);
            });
        }

        /** Returns JSON array of installed launchable apps. */
        @JavascriptInterface
        public String getInstalledApps() {
            try {
                Intent mainIntent = new Intent(Intent.ACTION_MAIN);
                mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
                PackageManager pm = getPackageManager();
                List<ResolveInfo> apps = pm.queryIntentActivities(mainIntent, 0);
                Collections.sort(apps,
                    new ResolveInfo.DisplayNameComparator(pm));

                JSONArray arr = new JSONArray();
                String selfPkg = getPackageName();
                for (ResolveInfo ri : apps) {
                    String pkg = ri.activityInfo.packageName;
                    if (pkg.equals(selfPkg)) continue;
                    JSONObject obj = new JSONObject();
                    obj.put("label", ri.loadLabel(pm).toString());
                    obj.put("package", pkg);
                    obj.put("activity", ri.activityInfo.name);
                    obj.put("icon", getAppIconBase64(ri, pm));
                    arr.put(obj);
                }
                return arr.toString();
            } catch (Exception e) {
                Log.e(TAG, "getInstalledApps failed", e);
                return "[]";
            }
        }

        @JavascriptInterface
        public void launchApp(String packageName, String activityName) {
            runOnUiThread(() -> {
                try {
                    Intent intent;
                    if (activityName != null && !activityName.isEmpty()) {
                        intent = new Intent();
                        intent.setClassName(packageName, activityName);
                    } else {
                        intent = getPackageManager()
                            .getLaunchIntentForPackage(packageName);
                    }
                    if (intent != null) {
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "launchApp failed: " + packageName, e);
                }
            });
        }

        @JavascriptInterface
        public void expandNotifications() {
            runOnUiThread(() -> {
                try {
                    Object sb = getSystemService("statusbar");
                    Method m = Class.forName("android.app.StatusBarManager")
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
                    Method m = pm.getClass().getMethod("goToSleep", long.class);
                    m.invoke(pm, System.currentTimeMillis());
                } catch (Exception e) {
                    Log.e(TAG, "screenOff failed", e);
                }
            });
        }

        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(() -> {
                startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS)
                    .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            });
        }

        @JavascriptInterface
        public void executeAction(String action, String argsJson) {
            runOnUiThread(() -> {
                try {
                    JSONObject args = new JSONObject(argsJson);
                    switch (action) {
                        case "set_timer":
                            Intent t = new Intent(AlarmClock.ACTION_SET_TIMER);
                            t.putExtra(AlarmClock.EXTRA_LENGTH, args.optInt("seconds", 60));
                            if (args.has("label"))
                                t.putExtra(AlarmClock.EXTRA_MESSAGE, args.getString("label"));
                            t.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
                            t.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(t);
                            break;
                        case "set_alarm":
                            Intent a = new Intent(AlarmClock.ACTION_SET_ALARM);
                            a.putExtra(AlarmClock.EXTRA_HOUR, args.optInt("hour", 8));
                            a.putExtra(AlarmClock.EXTRA_MINUTES, args.optInt("minute", 0));
                            if (args.has("label"))
                                a.putExtra(AlarmClock.EXTRA_MESSAGE, args.getString("label"));
                            a.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
                            a.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(a);
                            break;
                        case "toggle_flashlight":
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                android.hardware.camera2.CameraManager cm =
                                    (android.hardware.camera2.CameraManager)
                                        getSystemService(Context.CAMERA_SERVICE);
                                cm.setTorchMode(cm.getCameraIdList()[0], true);
                            }
                            break;
                        case "open_app":
                            String pkg = args.optString("app", "");
                            launchApp(resolveAppName(pkg), "");
                            break;
                    }
                } catch (Exception e) {
                    Log.e(TAG, "executeAction failed: " + action, e);
                }
            });
        }

        private String resolveAppName(String name) {
            switch (name.toLowerCase()) {
                case "camera": return "org.lineageos.snap";
                case "browser": return "us.spotco.fennec_dos";
                case "phone": case "dialer": return "com.android.dialer";
                case "messages": case "sms": return "com.android.messaging";
                case "settings": return "com.android.settings";
                case "gallery": return "org.lineageos.gallery";
                case "contacts": return "com.android.contacts";
                case "clock": return "com.android.deskclock";
                default: return name;
            }
        }
    }

    /** NativeSpeech — stub, real STT via JS MediaRecorder + Whisper */
    class NativeSpeech {
        @JavascriptInterface
        public boolean isAvailable() { return false; }

        @JavascriptInterface
        public void listen() {}
    }

    private String getAppIconBase64(ResolveInfo ri, PackageManager pm) {
        try {
            Drawable d = ri.loadIcon(pm);
            int size = 48;
            Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(bmp);
            d.setBounds(0, 0, size, size);
            d.draw(c);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.PNG, 80, baos);
            bmp.recycle();
            return "data:image/png;base64," +
                Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }
}
