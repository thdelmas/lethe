package org.osmosis.lethe;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * Handles ASSIST, VOICE_COMMAND, and SEARCH_LONG_PRESS intents.
 * Forwards to LetheActivity which opens the chat panel.
 */
public class LetheAssistActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = new Intent(this, LetheActivity.class);
        intent.putExtra("open_chat", true);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }
}
