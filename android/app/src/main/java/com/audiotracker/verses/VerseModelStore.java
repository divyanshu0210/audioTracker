package com.audiotracker.verses;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * The speech model: Vosk's Hindi one, and only that one.
 *
 * The choice is deliberate and slightly counter-intuitive, so it is worth
 * setting down. The obvious model for these recordings is English, because most
 * of the talking is English - and that is exactly why it is the wrong one. An
 * English model transcribes the talking, which is the part nobody wants, and
 * cannot hear the Sanskrit, which is the only part anybody wants. Every word of
 * a forty-minute lecture became something for the matcher to trip over, and the
 * one passage that mattered produced nothing.
 *
 * The Hindi model inverts that. Sanskrit shares Devanagari and most of its
 * phonetics with Hindi, so a recitation comes through recognisably; English
 * commentary, fed to a model that knows no English, comes through as whatever
 * Hindi words happen to fit - which almost never resembles a verse. The signal
 * gets louder and the noise gets quieter at the same time.
 *
 * It returns Devanagari, which is why devanagari.js exists: it transliterates
 * so that what the recogniser says and what the corpus holds can be compared at
 * all.
 */
public class VerseModelStore {

    private static final String TAG = "VerseModel";

    private static final String MODEL_URL =
            "https://alphacephei.com/vosk/models/vosk-model-small-hi-0.22.zip";

    private static final String MODEL_DIR = "vosk-model-small-hi-0.22";

    /** Written last, so a directory that exists but is incomplete is not taken for a model. */
    private static final String STAMP = ".complete";

    public interface Progress {
        void onProgress(long bytesRead, long totalBytes);
    }

    public static File modelDir(Context context) {
        return new File(context.getFilesDir(), MODEL_DIR);
    }

    public static boolean isReady(Context context) {
        return new File(modelDir(context), STAMP).exists();
    }

    /**
     * Fetch and unpack the model, unless it is already here.
     *
     * Blocking: callers run this off the main thread. Throws on any failure -
     * a partially-present model is not something to carry on from.
     */
    public static synchronized void ensure(Context context, Progress progress) throws IOException {
        if (isReady(context)) return;

        File target = modelDir(context);
        // A previous attempt that died between unpacking and stamping.
        if (target.exists()) deleteRecursively(target);

        File zip = new File(context.getCacheDir(), "vosk-model.zip");
        if (zip.exists() && !zip.delete()) Log.w(TAG, "could not clear a stale download");

        download(MODEL_URL, zip, progress);
        try {
            unzip(zip, context.getFilesDir());
            if (!target.isDirectory()) {
                throw new IOException("the archive did not contain " + MODEL_DIR);
            }
            if (!new File(target, STAMP).createNewFile()) {
                throw new IOException("could not stamp the unpacked model");
            }
        } finally {
            if (zip.exists() && !zip.delete()) Log.w(TAG, "could not delete the archive");
        }
    }

    private static void download(String from, File to, Progress progress) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(from).openConnection();
        conn.setConnectTimeout(20000);
        conn.setReadTimeout(60000);
        conn.setInstanceFollowRedirects(true);

        try {
            int code = conn.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) {
                throw new IOException("HTTP " + code + " fetching the speech model");
            }

            long total = conn.getContentLengthLong();
            long read = 0;

            try (InputStream in = conn.getInputStream();
                 OutputStream out = new FileOutputStream(to)) {
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    out.write(buffer, 0, n);
                    read += n;
                    if (progress != null) progress.onProgress(read, total);
                }
            }
        } finally {
            conn.disconnect();
        }
    }

    private static void unzip(File zip, File into) throws IOException {
        try (ZipInputStream zis = new ZipInputStream(
                new java.io.BufferedInputStream(new java.io.FileInputStream(zip)))) {

            ZipEntry entry;
            byte[] buffer = new byte[64 * 1024];

            while ((entry = zis.getNextEntry()) != null) {
                File out = new File(into, entry.getName());

                // Zip-slip: an archive can name an entry "../../something" and
                // walk out of the directory it is meant to unpack into. This
                // archive is not hostile, but the check costs nothing and the
                // failure mode is writing chosen bytes to a chosen path.
                if (!out.getCanonicalPath().startsWith(into.getCanonicalPath() + File.separator)) {
                    throw new IOException("archive entry escapes its directory: " + entry.getName());
                }

                if (entry.isDirectory()) {
                    if (!out.isDirectory() && !out.mkdirs()) {
                        throw new IOException("could not create " + out);
                    }
                } else {
                    File parent = out.getParentFile();
                    if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                        throw new IOException("could not create " + parent);
                    }
                    try (OutputStream os = new FileOutputStream(out)) {
                        int n;
                        while ((n = zis.read(buffer)) != -1) os.write(buffer, 0, n);
                    }
                }
                zis.closeEntry();
            }
        }
    }

    public static void delete(Context context) {
        deleteRecursively(modelDir(context));
    }

    private static void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        if (!file.delete()) Log.w(TAG, "could not delete " + file);
    }
}
