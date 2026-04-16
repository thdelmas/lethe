package org.osmosis.lethe;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.telephony.SmsManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Phone primitives — calls, SMS, contacts.
 * Extracted from NativeLauncher to keep LetheActivity under 500 lines.
 */
class LethePhone {

    private static final String TAG = "lethe-phone";

    private final Context ctx;

    LethePhone(Context ctx) {
        this.ctx = ctx;
    }

    /** Launch the native dialer and immediately place a call. */
    void makeCall(String number) {
        if (number == null || number.isEmpty()) return;
        Intent call = new Intent(Intent.ACTION_CALL,
            Uri.parse("tel:" + number));
        call.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(call);
    }

    /** Send an SMS via the default SmsManager. */
    void sendSms(String to, String body) {
        if (to == null || to.isEmpty()) return;
        if (body == null || body.isEmpty()) return;
        SmsManager sms = SmsManager.getDefault();
        sms.sendTextMessage(to, null, body, null, null);
    }

    /** Open the system contact-insert UI pre-filled. */
    void addContact(JSONObject args) {
        try {
            Intent ci = new Intent(Intent.ACTION_INSERT,
                ContactsContract.Contacts.CONTENT_URI);
            if (args.has("name"))
                ci.putExtra(
                    ContactsContract.Intents.Insert.NAME,
                    args.getString("name"));
            if (args.has("phone"))
                ci.putExtra(
                    ContactsContract.Intents.Insert.PHONE,
                    args.getString("phone"));
            if (args.has("email"))
                ci.putExtra(
                    ContactsContract.Intents.Insert.EMAIL,
                    args.getString("email"));
            ci.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(ci);
        } catch (Exception e) {
            Log.e(TAG, "addContact failed", e);
        }
    }

    /** Read recent SMS messages from the inbox. */
    String readSms(String argsJson) {
        try {
            JSONObject args = new JSONObject(argsJson);
            int count = args.optInt("count", 10);
            String from = args.optString("from", "");
            ContentResolver cr = ctx.getContentResolver();
            String sel = from.isEmpty() ? null : "address=?";
            String[] selArgs = from.isEmpty()
                ? null : new String[]{ from };
            Cursor c = cr.query(
                Uri.parse("content://sms/inbox"),
                new String[]{ "address", "body", "date", "read" },
                sel, selArgs, "date DESC");
            JSONArray arr = new JSONArray();
            if (c != null) {
                int n = 0;
                while (c.moveToNext() && n < count) {
                    JSONObject m = new JSONObject();
                    m.put("from", c.getString(0));
                    m.put("body", c.getString(1));
                    m.put("date", c.getLong(2));
                    m.put("read", c.getInt(3) == 1);
                    arr.put(m);
                    n++;
                }
                c.close();
            }
            return arr.toString();
        } catch (Exception e) {
            Log.e(TAG, "readSms failed", e);
            return "[]";
        }
    }

    /** Search contacts by display name (partial match). */
    String getContacts(String query) {
        try {
            ContentResolver cr = ctx.getContentResolver();
            String sel = null;
            String[] selArgs = null;
            if (query != null && !query.isEmpty()) {
                sel = ContactsContract.CommonDataKinds.Phone
                    .DISPLAY_NAME + " LIKE ?";
                selArgs = new String[]{ "%" + query + "%" };
            }
            Cursor c = cr.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{
                    ContactsContract.CommonDataKinds.Phone
                        .DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                },
                sel, selArgs,
                ContactsContract.CommonDataKinds.Phone
                    .DISPLAY_NAME + " ASC");
            JSONArray arr = new JSONArray();
            if (c != null) {
                while (c.moveToNext()) {
                    JSONObject ct = new JSONObject();
                    ct.put("name", c.getString(0));
                    ct.put("phone", c.getString(1));
                    arr.put(ct);
                }
                c.close();
            }
            return arr.toString();
        } catch (Exception e) {
            Log.e(TAG, "getContacts failed", e);
            return "[]";
        }
    }
}
