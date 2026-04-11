package org.osmosis.lethe;

import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebViewClient;
import android.webkit.WebView;

/**
 * Secure WebViewClient that restricts requests to the LETHE agent backend
 * and local static assets. Blocks all other network requests to prevent
 * exfiltration, redirect attacks, and unauthorized resource loading.
 *
 * Phase 1: Domain/scheme whitelisting (no new dependencies).
 * Phase 2: OkHttp interception + SSL pinning (future).
 */
public class LetheWebViewClient extends WebViewClient {

    private static final String TAG = "LetheWebView";
    private static final String AGENT_HOST = "127.0.0.1";
    private static final int AGENT_PORT = 8080;
    private static final String STATIC_PATH_PREFIX = "/system/extras/lethe/";

    /** Empty response returned for blocked requests. */
    private static final WebResourceResponse BLOCKED =
        new WebResourceResponse(null, null, null);

    @Override
    public WebResourceResponse shouldInterceptRequest(
            WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        String scheme = uri.getScheme();

        // Allow local file access to LETHE static assets only
        if ("file".equals(scheme)) {
            String path = uri.getPath();
            if (path != null && path.startsWith(STATIC_PATH_PREFIX)) {
                return null; // allow WebView to handle
            }
            Log.w(TAG, "Blocked file access outside LETHE: " + uri);
            return BLOCKED;
        }

        // Allow HTTP/HTTPS to agent backend on localhost only
        if ("http".equals(scheme) || "https".equals(scheme)) {
            if (AGENT_HOST.equals(uri.getHost()) && uri.getPort() == AGENT_PORT) {
                return null; // allow WebView to handle
            }
            Log.w(TAG, "Blocked non-agent request: " + uri);
            return BLOCKED;
        }

        // Allow data: and blob: URIs (used by 3D avatar loaders)
        if ("data".equals(scheme) || "blob".equals(scheme)) {
            return null; // allow WebView to handle
        }

        // Block everything else (javascript:, intent:, etc.)
        Log.w(TAG, "Blocked unsupported scheme: " + uri);
        return BLOCKED;
    }
}
