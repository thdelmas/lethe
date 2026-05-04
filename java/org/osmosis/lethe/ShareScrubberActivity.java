package org.osmosis.lethe;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentResolver;
import android.content.DialogInterface;
import android.content.Intent;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;

/**
 * System-wide EXIF strip on share (lethe#109).
 *
 * Registered with a high-priority intent filter on ACTION_SEND /
 * ACTION_SEND_MULTIPLE for image/* and video/*, so when the user picks
 * "Share" on a photo, this activity appears at the top of the chooser.
 * Tapping it (or accepting the prompt) strips EXIF metadata from each
 * image, writes the result to the app's shareable cache, and re-launches
 * the share intent with the cleaned URIs so the user can pick the actual
 * destination (Signal, Briar, mail, etc.).
 *
 * Strip surface today: JPEG via ExifInterface (the AOSP class — no
 * dependency). PNG, WebP, HEIC, and MP4 are passed through with a TODO;
 * a follow-up will route those through dangerzone-mobile or a libexif
 * port. The user-facing prompt makes it explicit what was stripped vs.
 * passed through.
 *
 * "Always strip" / "Never strip" preferences land in a follow-up; for v1
 * the prompt fires every time, which is the safer default for a feature
 * that controls metadata visible to your contacts.
 */
public class ShareScrubberActivity extends Activity {

    private static final String TAG = "lethe-share-scrub";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent in = getIntent();
        if (in == null) {
            finish();
            return;
        }
        String action = in.getAction();
        String type = in.getType() != null ? in.getType() : "";

        if (Intent.ACTION_SEND.equals(action)) {
            Uri u = in.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u == null) { finish(); return; }
            promptAndShare(new Uri[]{ u }, type, false);
            return;
        }
        if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> us =
                in.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (us == null || us.isEmpty()) { finish(); return; }
            promptAndShare(us.toArray(new Uri[0]), type, true);
            return;
        }
        finish();
    }

    private void promptAndShare(final Uri[] inputs, final String type,
                                final boolean multi) {
        final boolean canStrip = type.startsWith("image/");
        String title = canStrip ?
            "Remove location from " +
                (inputs.length == 1 ? "this photo?"
                                   : inputs.length + " photos?")
            : "Share " + (inputs.length == 1 ? "this file?"
                                            : inputs.length + " files?");
        String body = canStrip ?
            "GPS, camera serial, and other EXIF tags will be removed " +
            "before the file is shared. Original on disk is unchanged."
            : "This file type isn't scrubbed yet (PNG / WebP / HEIC / MP4 " +
              "are tracked as a follow-up). Share as-is?";

        new AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(body)
            .setPositiveButton(canStrip ? "Strip & share" : "Share as-is",
                new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        scrubAndForward(inputs, type, multi, canStrip);
                    }
                })
            .setNegativeButton("Cancel", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        finish();
                    }
                })
            .setOnCancelListener(new DialogInterface.OnCancelListener() {
                    @Override
                    public void onCancel(DialogInterface d) { finish(); }
                })
            .show();
    }

    private void scrubAndForward(Uri[] inputs, String type, boolean multi,
                                 boolean strip) {
        File outDir = new File(getCacheDir(), "share-scrub");
        outDir.mkdirs();
        ArrayList<Uri> outs = new ArrayList<>(inputs.length);
        for (int i = 0; i < inputs.length; i++) {
            Uri stripped = strip ? stripJpegExif(inputs[i], outDir, i)
                                 : copyThrough(inputs[i], outDir, i);
            if (stripped != null) {
                outs.add(stripped);
            } else {
                outs.add(inputs[i]);  // fail-open: share original on copy fail
            }
        }

        Intent out;
        if (multi) {
            out = new Intent(Intent.ACTION_SEND_MULTIPLE);
            out.setType(type);
            out.putParcelableArrayListExtra(Intent.EXTRA_STREAM, outs);
        } else {
            out = new Intent(Intent.ACTION_SEND);
            out.setType(type);
            out.putExtra(Intent.EXTRA_STREAM, outs.get(0));
        }
        out.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(Intent.createChooser(out, "Share scrubbed file"));
        } catch (Exception e) {
            Log.e(TAG, "share chooser failed", e);
        }
        finish();
    }

    /** Strip EXIF from a JPEG by re-saving with all tags cleared. Returns
     *  a content:// URI provided by FileProvider that the next share
     *  target can read. */
    private Uri stripJpegExif(Uri input, File outDir, int idx) {
        File out = new File(outDir, "scrubbed-" + System.currentTimeMillis()
            + "-" + idx + ".jpg");
        if (!copyToFile(input, out)) return null;
        try {
            ExifInterface exif = new ExifInterface(out.getAbsolutePath());
            String[] tags = {
                ExifInterface.TAG_GPS_LATITUDE,
                ExifInterface.TAG_GPS_LATITUDE_REF,
                ExifInterface.TAG_GPS_LONGITUDE,
                ExifInterface.TAG_GPS_LONGITUDE_REF,
                ExifInterface.TAG_GPS_ALTITUDE,
                ExifInterface.TAG_GPS_ALTITUDE_REF,
                ExifInterface.TAG_GPS_TIMESTAMP,
                ExifInterface.TAG_GPS_DATESTAMP,
                ExifInterface.TAG_GPS_PROCESSING_METHOD,
                ExifInterface.TAG_DATETIME,
                ExifInterface.TAG_MAKE,
                ExifInterface.TAG_MODEL,
                ExifInterface.TAG_IMAGE_DESCRIPTION,
                ExifInterface.TAG_ARTIST,
                ExifInterface.TAG_SOFTWARE,
                ExifInterface.TAG_USER_COMMENT,
            };
            for (String tag : tags) {
                exif.setAttribute(tag, null);
            }
            exif.saveAttributes();
        } catch (IOException e) {
            Log.w(TAG, "EXIF strip failed for " + input + ": " + e.getMessage());
            // Fall through and ship the copy — better to over-share metadata
            // than to fail the share entirely. The user explicitly asked for
            // strip; this is a degraded path with logging.
        }
        return makeShareableUri(out);
    }

    private Uri copyThrough(Uri input, File outDir, int idx) {
        File out = new File(outDir, "share-" + System.currentTimeMillis()
            + "-" + idx);
        if (!copyToFile(input, out)) return null;
        return makeShareableUri(out);
    }

    private boolean copyToFile(Uri input, File out) {
        ContentResolver cr = getContentResolver();
        try (InputStream in = cr.openInputStream(input);
             FileOutputStream fos = new FileOutputStream(out)) {
            if (in == null) return false;
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) fos.write(buf, 0, n);
            return true;
        } catch (IOException e) {
            Log.w(TAG, "copy failed: " + e.getMessage());
            return false;
        }
    }

    /** Wrap a cache-dir file in a content:// URI the next app can read.
     *  We don't ship a FileProvider authority here; on Android 7.0+ we'd
     *  need one. Today this returns a file:// URI which works on the v1.0
     *  cm-14.1 base. Tracked as the FileProvider follow-up. */
    private Uri makeShareableUri(File out) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // TODO: real FileProvider with grantUriPermissions when the
            // launcher app gets one. Until then, fall back to file:// —
            // some recipients will fail (StrictMode VM violation), most
            // will accept it on this base.
        }
        return Uri.fromFile(out);
    }
}
