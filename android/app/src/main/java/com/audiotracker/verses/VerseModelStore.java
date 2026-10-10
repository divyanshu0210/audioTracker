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

/**
 * The speech model: Su-srota, a Sanskrit recogniser.
 *
 * Three models have been tried here and the first two failed for the same
 * reason, which is worth setting down so it is not tried a third time.
 *
 * An English model was the obvious choice, because most of the talking in these
 * recordings is English - and that is exactly why it was wrong. It transcribed
 * the commentary, which nobody wants, and could not hear the Sanskrit, which is
 * the only part anybody wants. A Hindi model inverted that and was better in
 * principle: Sanskrit shares Devanagari and much of its phonetics with Hindi,
 * so recitation ought to come through while English commentary does not. In
 * practice it produced fluent Hindi nonsense on Sanskrit chanting, because
 * "close to Sanskrit" is not Sanskrit.
 *
 * This one is trained on the material itself. Su-srota is AI4Bharat's
 * IndicConformer-CTC finetuned for shastric and recitational Sanskrit by Prof.
 * Prathosh A P at IISc, on scholar recordings of the Bhagavata Purana,
 * Upanisads and stotras, plus Gita and Rgveda recitation - very nearly this
 * app's own corpus. It reports 6.0% character error on Bhagavata chant.
 *
 * Read the character error rate and ignore the word error rate, which looks
 * far worse. Sanskrit word boundaries are orthographic - sandhi fuses words -
 * so about half of that model's word error is disagreement about spacing.
 * phonetics.js discards word boundaries before it matches anything, so that
 * half of the error does not exist for us.
 *
 * Three files rather than an archive, and no unpacking:
 *
 *   ctc         the recogniser. INT8, and already restricted to the Sanskrit
 *               slice of IndicConformer's multilingual vocabulary, so nothing
 *               here has to know about the other twenty-one languages.
 *   preprocessor  16 kHz PCM to an 80-bin log-mel spectrogram. Tiny, and a
 *               separate graph because that is how the export was made.
 *   vocab       257 output classes to Devanagari, which is what devanagari.js
 *               then transliterates so the recogniser and the corpus can be
 *               compared at all.
 */
public class VerseModelStore {

    private static final String TAG = "VerseModel";

    private static final String BASE =
            "https://huggingface.co/gnumanth/sushrota-sanskrit-asr-onnx/resolve/main/";

    private static final String MODEL_DIR = "sushrota-sa-v13b";

    public static final String CTC = "sushrota_sanskrit_ctc_int8.onnx";
    public static final String PREPROCESSOR = "preprocessor.onnx";
    public static final String VOCAB = "sanskrit_vocab.json";

    private static final String[] FILES = {CTC, PREPROCESSOR, VOCAB};

    /**
     * Roughly what the three come to, for the progress fraction.
     *
     * Only the first is worth counting - the other two together are under two
     * hundred kilobytes - but the total has to be known before the first
     * response arrives, and a redirect to a CDN does not always carry a length.
     */
    private static final long APPROX_TOTAL_BYTES = 188L * 1024 * 1024;

    /** Written last, so a directory that exists but is incomplete is not taken for a model. */
    private static final String STAMP = ".complete";

    public interface Progress {
        void onProgress(long bytesRead, long totalBytes);
    }

    public static File modelDir(Context context) {
        return new File(context.getFilesDir(), MODEL_DIR);
    }

    public static File file(Context context, String name) {
        return new File(modelDir(context), name);
    }

    public static boolean isReady(Context context) {
        return new File(modelDir(context), STAMP).exists();
    }

    /**
     * Fetch the model, unless it is already here.
     *
     * Blocking: callers run this off the main thread. Throws on any failure - a
     * partially-present model is not something to carry on from.
     */
    public static synchronized void ensure(Context context, Progress progress) throws IOException {
        if (isReady(context)) return;

        File dir = modelDir(context);
        // A previous attempt that died partway. Downloading into a directory
        // holding half a model is how a truncated file survives to be loaded.
        if (dir.exists()) deleteRecursively(dir);
        if (!dir.mkdirs()) throw new IOException("could not create " + dir);

        long done = 0;
        for (String name : FILES) {
            File target = new File(dir, name);
            // Each file is written under a temporary name and moved into place
            // once whole, so nothing in the directory is ever a partial file.
            File part = new File(dir, name + ".part");
            long before = done;

            download(BASE + name, part, (read, total) -> {
                if (progress != null) {
                    progress.onProgress(before + read, APPROX_TOTAL_BYTES);
                }
            });

            if (!part.renameTo(target)) {
                throw new IOException("could not put " + name + " into place");
            }
            done += target.length();
        }

        if (!new File(dir, STAMP).createNewFile()) {
            throw new IOException("could not stamp the model");
        }
        Log.i(TAG, "model ready: " + (done / (1024 * 1024)) + " MB");
    }

    private static void download(String from, File to, Progress progress) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(from).openConnection();
        conn.setConnectTimeout(20000);
        conn.setReadTimeout(60000);
        conn.setInstanceFollowRedirects(true);

        try {
            int code = conn.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) {
                throw new IOException("HTTP " + code + " fetching " + to.getName());
            }

            long read = 0;
            try (InputStream in = conn.getInputStream();
                 OutputStream out = new FileOutputStream(to)) {
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    out.write(buffer, 0, n);
                    read += n;
                    if (progress != null) progress.onProgress(read, -1);
                }
            }
        } finally {
            conn.disconnect();
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
