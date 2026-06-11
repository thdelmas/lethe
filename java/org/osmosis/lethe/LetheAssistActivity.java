package org.osmosis.lethe;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * Handles ASSIST, VOICE_COMMAND, and SEARCH_LONG_PRESS intents.
 * Forwards to the native VoiceActivity (lethe#190) — the previous
 * target, LetheActivity, hosts a WebView and crashes on user builds
 * (system-UID WebView ban, lethe#151), which left the assist gesture
 * dead. Voice in, streamed answer out via ChatActivity.
 */
public class LetheAssistActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = new Intent(this, VoiceActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }
}
