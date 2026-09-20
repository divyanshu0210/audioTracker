package com.audiotracker.verses;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Map;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;

/**
 * Sanskrit out of raw PCM, via two ONNX graphs.
 *
 * Vosk, which this replaces, was a streaming recogniser: samples went in
 * continuously and partial results came back several times a second. This is
 * not that. It is an offline CTC model that reads a whole buffer at once, so
 * the caller accumulates a window of audio and asks for it to be read - see
 * VerseCaptureService, which decides how big that window is and how often.
 *
 * That difference is not a loss here. The panel never showed anything from a
 * single partial anyway: useVerseStore accumulates twenty-five seconds of
 * results before it will commit to a verse, because one utterance is weak
 * evidence. Getting a whole window read accurately every few seconds suits it
 * better than getting a word at a time badly.
 *
 * Two graphs because that is how the export is packaged: the first turns
 * samples into an 80-bin log-mel spectrogram, the second turns that into
 * per-frame scores over 257 classes. Both sessions are built once and reused;
 * constructing them costs the better part of a second.
 */
public class SanskritRecognizer implements AutoCloseable {

    private static final String TAG = "VerseRecognizer";

    /** Index 0 of the vocabulary. Dropped by the CTC collapse below. */
    private static final int BLANK = 0;

    /** SentencePiece's word-boundary marker, which becomes an ordinary space. */
    private static final String WORD_START = "▁";

    private final OrtEnvironment env;
    private final OrtSession preprocessor;
    private final OrtSession ctc;
    private final String[] vocab;

    public SanskritRecognizer(Context context) throws IOException, OrtException, JSONException {
        File dir = VerseModelStore.modelDir(context);
        this.env = OrtEnvironment.getEnvironment();

        OrtSession.SessionOptions options = new OrtSession.SessionOptions();
        // The phone is playing a lecture, and on some devices decoding video
        // while four inference threads run is what makes the audio stutter.
        // Two is enough to stay ahead of a window.
        options.setIntraOpNumThreads(2);
        options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);

        this.preprocessor = env.createSession(
                new File(dir, VerseModelStore.PREPROCESSOR).getAbsolutePath(), options);
        this.ctc = env.createSession(
                new File(dir, VerseModelStore.CTC).getAbsolutePath(), options);
        this.vocab = readVocab(new File(dir, VerseModelStore.VOCAB));

        Log.i(TAG, "loaded, " + vocab.length + " classes");
    }

    private static String[] readVocab(File file) throws IOException, JSONException {
        String json = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
        JSONArray array = new JSONArray(json);
        String[] out = new String[array.length()];
        for (int i = 0; i < out.length; i++) out[i] = array.getString(i);
        return out;
    }

    /**
     * Read a buffer of 16 kHz mono samples.
     *
     * @param samples normalised to -1..1
     * @param count   how many of them are real; the array may be longer
     * @return what was heard, in Devanagari, or "" for silence
     */
    public synchronized String transcribe(float[] samples, int count) throws OrtException {
        if (count <= 0) return "";

        long[] audioShape = {1, count};
        float[] trimmed = samples.length == count
                ? samples
                : java.util.Arrays.copyOf(samples, count);

        try (OnnxTensor audio = OnnxTensor.createTensor(
                     env, java.nio.FloatBuffer.wrap(trimmed), audioShape);
             OnnxTensor length = OnnxTensor.createTensor(
                     env, java.nio.LongBuffer.wrap(new long[]{count}), new long[]{1})) {

            Map<String, OnnxTensor> input = new HashMap<>();
            input.put("audio_signal", audio);
            input.put("length", length);

            try (OrtSession.Result features = preprocessor.run(input)) {
                Map<String, OnnxTensor> second = new HashMap<>();
                // The preprocessor's two outputs feed the recogniser's two
                // inputs, in order. Named rather than positional on the way in
                // because the recogniser's input names are fixed; taken
                // positionally on the way out because the export does not
                // name them consistently across versions.
                second.put("audio_signal", (OnnxTensor) features.get(0));
                second.put("length", (OnnxTensor) features.get(1));

                try (OrtSession.Result out = ctc.run(second)) {
                    return decode((OnnxTensor) out.get(0));
                }
            }
        }
    }

    /**
     * Greedy CTC: argmax each frame, collapse repeats, drop blanks.
     *
     * Greedy rather than a beam search, and deliberately. A beam would produce
     * more plausible *Sanskrit*, by preferring sequences that look like the
     * language - and that is precisely the wrong bias here. What the matcher
     * wants is what the model actually heard, including the parts it heard
     * badly; smoothing those towards real words is how a half-heard verse turns
     * into a confident, wrong one.
     */
    private String decode(OnnxTensor logits) throws OrtException {
        // [batch, frames, classes]
        float[][][] scores = (float[][][]) logits.getValue();
        if (scores.length == 0) return "";
        float[][] frames = scores[0];

        StringBuilder text = new StringBuilder();
        int previous = -1;

        for (float[] frame : frames) {
            int best = 0;
            float bestScore = frame[0];
            for (int c = 1; c < frame.length; c++) {
                if (frame[c] > bestScore) {
                    bestScore = frame[c];
                    best = c;
                }
            }

            if (best != previous && best != BLANK && best < vocab.length) {
                text.append(vocab[best]);
            }
            previous = best;
        }

        return text.toString().replace(WORD_START, " ").trim();
    }

    @Override
    public void close() {
        closeQuietly(ctc);
        closeQuietly(preprocessor);
        // The environment is a process-wide singleton and is deliberately not
        // closed: another session may want it, and closing it here has been a
        // source of crashes on the next start.
    }

    private static void closeQuietly(OrtSession session) {
        if (session == null) return;
        try {
            session.close();
        } catch (OrtException e) {
            Log.w(TAG, "could not close a session: " + e.getMessage());
        }
    }
}
