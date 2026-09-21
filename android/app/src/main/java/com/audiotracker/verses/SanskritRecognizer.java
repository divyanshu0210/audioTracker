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

    /** What one pass heard, and how sure it was of it. */
    public static final class Heard {
        public final String text;

        /**
         * Mean probability of the characters actually emitted, 0..1.
         *
         * Averaged over emitted frames only. Most frames of any window are
         * blank - the gaps between letters - and the model is extremely sure
         * about those, so including them pins every window near 1.0 and
         * measures nothing.
         */
        public final float confidence;

        Heard(String text, float confidence) {
            this.text = text;
            this.confidence = confidence;
        }
    }

    private static final Heard NOTHING = new Heard("", 0f);

    /**
     * Read a buffer of 16 kHz mono samples.
     *
     * @param samples normalised to -1..1
     * @param count   how many of them are real; the array may be longer
     * @return what was heard, in Devanagari, with "" for silence
     */
    public synchronized Heard transcribe(float[] samples, int count) throws OrtException {
        if (count <= 0) return NOTHING;

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
     *
     * The probabilities are kept rather than discarded. A model asked to read
     * Sanskrit out of English commentary, or out of a kirtan with a mrdanga
     * over it, still returns its best guess at Devanagari - and that guess is
     * what the matcher then tries to find a verse in. The difference between
     * that and a real recitation is not in the text, which looks equally like
     * Sanskrit either way. It is in how sure the model was.
     */
    private Heard decode(OnnxTensor logits) throws OrtException {
        // [batch, frames, classes]
        float[][][] scores = (float[][][]) logits.getValue();
        if (scores.length == 0) return NOTHING;
        float[][] frames = scores[0];
        if (frames.length == 0) return NOTHING;

        // NeMo's exports differ in where they stop: some graphs end in a
        // log_softmax and some in a bare linear layer. Log probabilities are
        // never positive, so one look at a frame separates them - and guessing
        // wrong would not fail loudly, it would just make every confidence
        // meaningless.
        boolean logProbs = true;
        for (float v : frames[0]) {
            if (v > 0f) {
                logProbs = false;
                break;
            }
        }

        StringBuilder text = new StringBuilder();
        int previous = -1;
        double total = 0;
        int emitted = 0;

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
                total += logProbs ? Math.exp(bestScore) : softmaxOfMax(frame, bestScore);
                emitted++;
            }
            previous = best;
        }

        return new Heard(
                text.toString().replace(WORD_START, " ").trim(),
                emitted > 0 ? (float) (total / emitted) : 0f);
    }

    /**
     * The winning class's probability, for a frame of raw scores.
     *
     * Shifted by the maximum before exponentiating, which is the usual guard
     * against overflow - and since the maximum is the winner, the whole
     * expression collapses to one over the sum.
     */
    private static double softmaxOfMax(float[] frame, float best) {
        double sum = 0;
        for (float v : frame) sum += Math.exp(v - best);
        return 1.0 / sum;
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
