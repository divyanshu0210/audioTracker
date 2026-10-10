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

import ai.onnxruntime.OrtException;

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
 * choice turned out not to be worth making, because neither was ever the right
 * answer. The model here recognises Sanskrit and nothing else, which is the
 * whole of what the panel wants - see VerseModelStore.
 *
 * Two threads, and that is the one structural thing to know: this recogniser
 * reads a buffer rather than a stream, and a pass takes seconds. One thread
 * reads audio and does nothing else, the other recognises whatever has
 * accumulated. Doing both on one thread leaves AudioRecord unattended for the
 * length of every pass, and what gets lost is precisely the audio that arrives
 * while the previous window is being recognised.
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
     * The model is trained at 16kHz, and feeding one anything else gets quietly
     * poor results rather than an error. The capture resamples to this on the
     * way out.
     */
    private static final int SAMPLE_RATE = 16000;

    /** A fifth of a second of PCM, which is how much is read at a time. */
    private static final int CHUNK_BYTES = SAMPLE_RATE * 2 / 5;

    /**
     * How much audio is read at once, and how often.
     *
     * The recogniser is not a streaming one - it reads a whole buffer - so
     * these two numbers are the whole of the latency design.
     *
     * Ten seconds is about half a verse, which is more than the matcher needs:
     * a run of twenty-six characters is its threshold and half a line clears
     * that. Longer would recognise more per pass and report it later, and the
     * store is already accumulating twenty-five seconds of these, so there is
     * nothing to gain by making each one bigger.
     *
     * The hop has to exceed how long a pass actually takes, or the reader gets
     * ahead of the recogniser for the whole lecture. Four seconds against a
     * ten-second window means the model must run at better than 0.4 real time,
     * which it does comfortably - it is quoted at thirty times real time on a
     * laptop CPU. The consequence of being wrong about that is mild: passes get
     * skipped, not queued.
     *
     * It is also half of the panel's latency. A verse cannot appear before the
     * hop that first covers it, and a verse needing corroboration cannot appear
     * before the second - so every second here costs two on screen. Anything
     * below about three would start racing the inference on a slow device.
     */
    private static final int WINDOW_SAMPLES = SAMPLE_RATE * 10;
    private static final int HOP_SAMPLES = SAMPLE_RATE * 4;

    /** Below this there is not enough context to recognise anything. */
    private static final int MIN_SAMPLES = SAMPLE_RATE * 2;

    private MediaProjection projection;
    private AudioRecord record;
    private SanskritRecognizer recognizer;

    /**
     * The last WINDOW_SAMPLES of audio, oldest overwritten first.
     *
     * A ring rather than a queue, and read by a second thread rather than the
     * one doing the reading, because a pass over ten seconds of audio takes
     * seconds. Doing it on the reading thread would leave AudioRecord
     * unattended for that whole time, and its buffer holds under a second -
     * every pass would lose audio, and the part lost is the part that arrives
     * while the model is busy recognising the part before it.
     */
    private final float[] ring = new float[WINDOW_SAMPLES];
    private int ringAt = 0;

    /**
     * Every sample ever written, and never reset.
     *
     * Monotonic on purpose. An earlier version zeroed this when playback
     * resumed, to discard what had been heard before the pause - and the
     * recogniser thread, which remembers where it had got to, then found itself
     * apparently ahead of the writer. Its "has a hop arrived yet" test went
     * negative and stayed negative, so it waited for the rest of the lecture and
     * the panel never heard another word.
     *
     * Staleness is marked rather than erased: validFrom moves forward instead,
     * and nothing before it is read. Counters that only ever increase cannot
     * produce that class of bug at all.
     */
    private long totalSamples = 0;

    /** Samples written before this were heard before the last pause. */
    private long validFrom = 0;
    private final Object ringLock = new Object();
    private Thread recogniser;
    private Thread worker;
    private volatile boolean running;
    private volatile boolean capturing;

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

        recognizer = new SanskritRecognizer(this);

        record.startRecording();
        running = true;
        capturing = true;
        active = true;
        emitState("listening", null);

        worker = new Thread(this::readLoop, "verse-capture");
        worker.start();
        recogniser = new Thread(this::recogniseLoop, "verse-recognise");
        recogniser.start();
    }

    /**
     * Start or stop recognising, without touching the projection.
     *
     * The AudioRecord keeps running throughout, and that is the point. An
     * earlier version stopped it on pause and started it again on resume, to
     * avoid reading silence - and after a resume nothing was ever heard again.
     * Restarting a stopped AudioPlaybackCapture is not reliable: on some
     * devices it returns successfully and then delivers silence forever, which
     * looks from the outside exactly like a recogniser that has died.
     *
     * The battery argument for stopping it was aimed at the wrong thing
     * anyway. Reading PCM is a few kilobytes of memcpy every fifth of a second;
     * what costs real power is the recognition pass over it, and that is what
     * this gates. A lecture left paused for an hour now reads and discards, and
     * runs the model not once.
     */
    private synchronized void setCapturing(boolean want) {
        if (!running || capturing == want) return;

        if (want) {
            // Whatever is in the ring was heard before the pause and does not
            // join onto what comes next. Marked stale rather than cleared - see
            // totalSamples.
            synchronized (ringLock) {
                validFrom = totalSamples;
            }
        }
        capturing = want;
        emitState(want ? "listening" : "idle", null);
    }

    /**
     * Read PCM as fast as it arrives and put it in the ring. Nothing else.
     *
     * Deliberately trivial: anything expensive here is time AudioRecord spends
     * unattended, and its buffer is under a second deep.
     */
    private void readLoop() {
        byte[] buffer = new byte[CHUNK_BYTES];
        try {
            while (running) {
                // Read whether or not anything wants the audio. Draining the
                // AudioRecord costs almost nothing and keeps it healthy;
                // stopping it was what broke resuming. While paused the samples
                // are simply dropped on the floor.
                int n = record.read(buffer, 0, buffer.length);
                if (n <= 0) continue;
                if (capturing) append(buffer, n);
            }
        } catch (Throwable t) {
            if (running) {
                Log.e(TAG, "capture stopped", t);
                fail("capture stopped unexpectedly");
            }
        } finally {
            close();
        }
    }

    /** 16-bit little-endian PCM into the ring, as floats in -1..1. */
    private void append(byte[] buffer, int bytes) {
        synchronized (ringLock) {
            for (int i = 0; i + 1 < bytes; i += 2) {
                int sample = (buffer[i] & 0xff) | (buffer[i + 1] << 8);
                ring[ringAt] = sample / 32768f;
                ringAt = (ringAt + 1) % ring.length;
                totalSamples++;
            }
            ringLock.notifyAll();
        }
    }

    /**
     * Every hop, read the whole ring and recognise it.
     *
     * Takes whatever is in the ring at the moment it asks rather than queueing
     * work, so a pass that runs long costs a skipped hop and never builds a
     * backlog. On a lecture that plays for an hour, a backlog would mean the
     * panel drifting further behind the audio all the way through.
     */
    private void recogniseLoop() {
        float[] snapshot = new float[WINDOW_SAMPLES];
        long lastAt = 0;
        String previous = "";

        try {
            while (running) {
                int count;
                synchronized (ringLock) {
                    while (running
                            && (!capturing
                                || totalSamples - lastAt < HOP_SAMPLES
                                || totalSamples - validFrom < MIN_SAMPLES)) {
                        ringLock.wait(200);
                    }
                    if (!running) return;

                    // Never more than the ring holds, and never back past the
                    // last resume.
                    long available = Math.min(totalSamples - validFrom, WINDOW_SAMPLES);
                    count = (int) available;

                    // Oldest first. The newest sample sits just behind the
                    // write head, so the run of `count` samples starts that far
                    // back from it - which is right whether or not the ring has
                    // wrapped, and needs no special case for either.
                    int from = (ringAt - count + ring.length) % ring.length;
                    for (int i = 0; i < count; i++) {
                        snapshot[i] = ring[(from + i) % ring.length];
                    }
                    lastAt = totalSamples;
                }

                if (count < MIN_SAMPLES) continue;

                SanskritRecognizer.Heard heard = recognizer.transcribe(snapshot, count);
                String text = heard.text;
                if (text.isEmpty()) continue;

                // Windows overlap, so a passage that spans two of them comes
                // back twice. Forwarding the repeat would have the store
                // counting one reading as two, which is exactly the
                // corroboration it uses to decide it is sure.
                if (text.equals(previous)) continue;
                previous = text;

                emitSpeech(text, heard.confidence);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (OrtException e) {
            Log.e(TAG, "recognition failed", e);
            fail("the recogniser stopped: " + e.getMessage());
        } catch (Throwable t) {
            if (running) {
                Log.e(TAG, "recognition stopped", t);
                fail("recognition stopped unexpectedly");
            }
        }
    }

    private void close() {
        try {
            if (recognizer != null) recognizer.close();
        } catch (Throwable ignored) {
        }
        synchronized (ringLock) {
            ringLock.notifyAll();
        }
        recognizer = null;
    }

    private void emitSpeech(String text, float confidence) {
        WritableMap payload = Arguments.createMap();
        payload.putString("text", text);
        payload.putDouble("confidence", confidence);
        // Always final now. The recogniser reads whole windows rather than
        // streaming, so there is no such thing as a partial result any more -
        // kept in the payload because the JS side still reads it.
        payload.putBoolean("isFinal", true);
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
