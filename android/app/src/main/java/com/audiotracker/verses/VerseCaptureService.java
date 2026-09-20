package com.audiotracker.verses;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;
import androidx.core.app.NotificationCompat;

import com.audiotracker.bridge.ReactEmitter;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;

/**
 * Listening to what the player is playing, as it plays.
 *
 * Android will not let an app read another app's audio, but it will let one
 * read its own - and this app is the one playing the lecture, through VLC for a
 * file and through a WebView for YouTube. Both are inside this process, so a
 * single playback capture picks up either without knowing which is running.
 *
 * Capturing rather than reading the file is what makes this format-agnostic.
 * VLC has already decoded whatever it is by the time this hears it, so a WMA
 * recording that Android's own MediaExtractor refuses to open comes through
 * like anything else.
 *
 * Why this is a service: from Android 14 a MediaProjection may only be used
 * while a foreground service of type mediaProjection is running. The projection
 * is also why the person sees a consent dialog before any of this starts -
 * there is no way to capture audio silently, which is right and not worth
 * working around.
 *
 * One model, and no language probe. An earlier version carried English and
 * Hindi and spent two hundred lines choosing between them per recording; the
 * choice turned out not to be worth making, because English was never the right
 * answer - see VerseModelStore for why the Hindi model alone does better on
 * material that is mostly English.
 *
 * Nothing here decides anything. What comes out is a guess at words, and
 * useVerseStore is what turns a stream of those into a verse.
 */
@RequiresApi(api = Build.VERSION_CODES.Q)
public class VerseCaptureService extends Service {

    private static final String TAG = "VerseCapture";

    public static final String EVENT_SPEECH = "verseSpeech";
    public static final String EVENT_STATE = "verseCaptureState";

    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";

    public static final String ACTION_STOP = "com.audiotracker.verses.STOP";
    // Pausing is not stopping. A MediaProjection cannot be re-used, so
    // releasing it means the consent dialog again on the way back - and
    // playback pauses often. A pause keeps the projection and only stops
    // reading.
    public static final String ACTION_PAUSE = "com.audiotracker.verses.PAUSE";
    public static final String ACTION_RESUME = "com.audiotracker.verses.RESUME";

    private static final String CHANNEL_ID = "verse_capture";
    private static final int NOTIFICATION_ID = 8821;

    /**
     * Vosk's models are trained at 16kHz, and feeding one anything else gets
     * quietly poor results rather than an error. The capture resamples to this
     * on the way out, so the rate here and the rate given to the Recognizer are
     * the same number for a reason.
     */
    private static final int SAMPLE_RATE = 16000;

    /**
     * A fifth of a second. Short enough that a partial result arrives while a
     * line is still being recited, long enough not to spend the whole budget on
     * call overhead.
     */
    private static final int CHUNK_BYTES = SAMPLE_RATE * 2 / 5;

    private MediaProjection projection;
    private AudioRecord record;
    private Recognizer recognizer;
    private Model model;
    private Thread worker;
    private volatile boolean running;
    private volatile boolean capturing;
    private String lastPartial = "";

    private static volatile boolean active = false;

    public static boolean isActive() {
        return active;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        final String action = intent == null ? null : intent.getAction();

        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_PAUSE.equals(action)) {
            setCapturing(false);
            return START_NOT_STICKY;
        }
        if (ACTION_RESUME.equals(action)) {
            setCapturing(true);
            return START_NOT_STICKY;
        }

        if (running) return START_NOT_STICKY;

        int resultCode = intent == null ? 0 : intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent resultData = intent == null ? null : intent.getParcelableExtra(EXTRA_RESULT_DATA);

        if (resultData == null) {
            fail("no screen capture permission was granted");
            return START_NOT_STICKY;
        }

        // The notification has to be up *before* the projection is touched on
        // Android 14, not merely soon after - getMediaProjection throws
        // otherwise.
        startForegroundNotification();

        try {
            begin(resultCode, resultData);
        } catch (Throwable t) {
            Log.e(TAG, "could not start capture", t);
            fail(t.getMessage() == null ? "capture failed to start" : t.getMessage());
            stopSelf();
        }

        return START_NOT_STICKY;
    }

    private void begin(int resultCode, Intent resultData) throws Exception {
        MediaProjectionManager manager =
                (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        projection = manager.getMediaProjection(resultCode, resultData);
        if (projection == null) throw new IllegalStateException("screen capture was refused");

        // The person can revoke the projection from the system UI at any time,
        // and when they do the AudioRecord goes silent rather than erroring -
        // so without this the feature would look like it was listening forever
        // and never hearing anything.
        projection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                Log.i(TAG, "projection stopped by the system or the person");
                stopSelf();
            }
        }, null);

        AudioPlaybackCaptureConfiguration config =
                new AudioPlaybackCaptureConfiguration.Builder(projection)
                        // What a media player emits. USAGE_UNKNOWN is included
                        // because a WebView playing YouTube does not always
                        // label its stream, and dropping it would mean that
                        // path captured silence.
                        .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                        .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                        .addMatchingUsage(AudioAttributes.USAGE_GAME)
                        .build();

        AudioFormat format = new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                .build();

        int minBuffer = AudioRecord.getMinBufferSize(
                SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minBuffer <= 0) minBuffer = SAMPLE_RATE * 2;

        record = new AudioRecord.Builder()
                .setAudioFormat(format)
                // Four times the minimum: the recogniser occasionally takes
                // longer than one buffer to process a chunk, and a buffer that
                // only just fits drops audio when it does. Dropped audio is a
                // hole in the middle of a verse.
                .setBufferSizeInBytes(minBuffer * 4)
                .setAudioPlaybackCaptureConfig(config)
                .build();

        model = new Model(VerseModelStore.modelDir(this).getAbsolutePath());
        recognizer = new Recognizer(model, SAMPLE_RATE);

        record.startRecording();
        running = true;
        capturing = true;
        active = true;
        emitState("listening", null);

        worker = new Thread(this::loop, "verse-capture");
        worker.start();
    }

    /**
     * Start or stop reading, without touching the projection.
     *
     * Stopping the AudioRecord rather than reading and discarding: a paused
     * player produces silence, and silence costs the recogniser exactly as much
     * as speech. On a lecture left paused for an hour that is an hour of
     * pointless work on somebody's battery.
     */
    private synchronized void setCapturing(boolean want) {
        if (!running || capturing == want || record == null) return;
        try {
            if (want) {
                record.startRecording();
                // Whatever half-utterance was in flight when playback stopped
                // is not the start of what comes next.
                if (recognizer != null) recognizer.reset();
                capturing = true;
                emitState("listening", null);
            } else {
                capturing = false;
                record.stop();
                emitState("idle", null);
            }
        } catch (Throwable t) {
            Log.w(TAG, "could not " + (want ? "resume" : "pause") + " capture", t);
        }
    }

    private void loop() {
        byte[] buffer = new byte[CHUNK_BYTES];
        try {
            while (running) {
                if (!capturing) {
                    Thread.sleep(150);
                    lastPartial = "";
                    continue;
                }
                int n = record.read(buffer, 0, buffer.length);
                if (n <= 0) continue;
                consume(buffer, n);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Throwable t) {
            if (running) {
                Log.e(TAG, "recognition stopped", t);
                fail("recognition stopped unexpectedly");
            }
        } finally {
            close();
        }
    }

    private void consume(byte[] buffer, int n) {
        if (recognizer.acceptWaveForm(buffer, n)) {
            String text = textFrom(recognizer.getResult(), "text");
            if (!text.isEmpty()) {
                emitSpeech(text, true);
                lastPartial = "";
            }
        } else {
            String partial = textFrom(recognizer.getPartialResult(), "partial");
            // Vosk repeats the same partial until something changes; forwarding
            // every repeat would have the store counting one guess as many,
            // which is exactly the corroboration it uses to decide it is sure.
            if (!partial.isEmpty() && !partial.equals(lastPartial)) {
                emitSpeech(partial, false);
                lastPartial = partial;
            }
        }
    }

    private void close() {
        try {
            if (recognizer != null) recognizer.close();
        } catch (Throwable ignored) {
        }
        try {
            if (model != null) model.close();
        } catch (Throwable ignored) {
        }
        recognizer = null;
        model = null;
    }

    private static String textFrom(String json, String key) {
        if (json == null) return "";
        try {
            return new JSONObject(json).optString(key, "").trim();
        } catch (Exception e) {
            return "";
        }
    }

    private void emitSpeech(String text, boolean isFinal) {
        WritableMap payload = Arguments.createMap();
        payload.putString("text", text);
        payload.putBoolean("isFinal", isFinal);
        ReactEmitter.emit(this, EVENT_SPEECH, payload);
    }

    private void emitState(String state, String reason) {
        WritableMap payload = Arguments.createMap();
        payload.putString("state", state);
        if (reason != null) payload.putString("reason", reason);
        ReactEmitter.emit(this, EVENT_STATE, payload);
    }

    private void fail(String reason) {
        emitState("failed", reason);
    }

    private void startForegroundNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Verse detection", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shown while the app is listening for verses and songs");
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Listening for verses")
                .setContentText("Verses and songs will appear under the player")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();

        // No version branch: the class is @RequiresApi(Q) because playback
        // capture does not exist below it, and the typed overload is the only
        // one that works from Android 14 anyway.
        startForeground(NOTIFICATION_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
    }

    @Override
    public void onDestroy() {
        running = false;
        capturing = false;
        active = false;

        if (worker != null) {
            try {
                // Bounded: the loop checks `running` once per read, so it exits
                // within a buffer's worth of audio. Waiting forever on a thread
                // stuck in a bad AudioRecord would hang the shutdown.
                worker.join(1500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            worker = null;
        }

        if (record != null) {
            try {
                if (record.getState() == AudioRecord.STATE_INITIALIZED) record.stop();
                record.release();
            } catch (Throwable t) {
                Log.w(TAG, "could not release the recorder", t);
            }
            record = null;
        }

        if (projection != null) {
            try {
                projection.stop();
            } catch (Throwable t) {
                Log.w(TAG, "could not stop the projection", t);
            }
            projection = null;
        }

        emitState("stopped", null);
        super.onDestroy();
    }
}
