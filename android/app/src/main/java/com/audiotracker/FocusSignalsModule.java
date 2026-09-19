package com.audiotracker;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.ContentObserver;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.ContextCompat;

import java.util.ArrayDeque;

import com.audiotracker.bridge.ReactEmitter;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

/**
 * The signals that say nobody is listening any more — see
 * src/music/useFocusSignals.js.
 *
 * Focus mode's other gates ask whether the app is in front. These ask something
 * the app cannot see for itself: whether the sound is still reaching a person.
 * Headphones coming out is the clearest evidence of that there is, and unlike an
 * attention check it needs no cooperation and cannot be gamed.
 *
 * Two of these are ordinary media-player correctness rather than anything to do
 * with focus mode. Nothing in this app requested audio focus before, so a phone
 * call did not pause a lecture — it played on underneath, and was credited. The
 * JS side decides which signals to act on; this only reports them.
 */
public class FocusSignalsModule extends ReactContextBaseJavaModule {

    private static final String TAG   = "FocusSignals";
    private static final String EVENT = "focusSignal";

    /** Reasons, matched by name in useFocusSignals.js. */
    private static final String REASON_NOISY  = "becomingNoisy";
    private static final String REASON_FOCUS  = "audioFocusLost";
    private static final String REASON_VOLUME = "volumeZero";
    private static final String REASON_WALKING = "walking";
    private static final String REASON_CALL    = "callActive";

    /**
     * How often the audio mode is re-read below API 31.
     *
     * 31 has addOnModeChangedListener and needs no polling. Below it there is no
     * callback at all without READ_PHONE_STATE, which is a dangerous permission
     * to add for one signal - so the mode is read on a timer instead, and only
     * while something is playing.
     */
    private static final long MODE_POLL_MS = 1500L;

    /**
     * What counts as walking off, rather than shifting in a chair.
     *
     * Twelve steps inside fifteen seconds is someone crossing a room, not
     * someone reaching for a cup. A single step means nothing and is not worth
     * stopping a lecture over; a sustained gait is the person leaving.
     */
    private static final int  WALK_STEPS     = 12;
    private static final long WALK_WINDOW_MS = 15000L;

    private AudioManager audioManager;
    private AudioManager.OnAudioFocusChangeListener focusListener;
    private AudioFocusRequest focusRequest;   // API 26+ only
    private BroadcastReceiver noisyReceiver;
    private ContentObserver volumeObserver;

    private SensorManager sensorManager;
    private Sensor stepSensor;
    private SensorEventListener stepListener;
    /** Timestamps of recent steps, oldest first. */
    private final ArrayDeque<Long> stepTimes = new ArrayDeque<>();

    private AudioManager.OnModeChangedListener modeListener;  // API 31+
    private Handler modeHandler;
    private Runnable modePoll;
    private int lastMode = AudioManager.MODE_NORMAL;

    private boolean listening = false;
    private boolean watchingSteps = false;
    /** Whether this module is the one holding audio focus - see start(). */
    private boolean holdsAudioFocus = false;
    /** So a volume change that is not a change to or from zero says nothing. */
    private boolean wasMuted = false;

    public FocusSignalsModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "FocusSignalsModule";
    }

    /**
     * Begin listening. Called as playback starts.
     *
     * Idempotent: JS calls this on every play, and registering a receiver twice
     * would deliver every unplug twice and leak one of the registrations.
     *
     * withAudioFocus is false for the YouTube path, and has to be: that player
     * is a WebView embed which requests audio focus for itself. Two requests
     * inside one app fight, and both outcomes look like the same bug - either
     * this module takes focus and the embed pauses, or the embed takes it back
     * and this module reads its own app losing focus as another app stealing
     * it, and pauses. The embed handles calls and other players on its own,
     * which is the same reason it is excluded from the foreground service.
     */
    @ReactMethod
    public void start(boolean withAudioFocus, Promise promise) {
        if (listening) {
            promise.resolve(true);
            return;
        }
        try {
            Context context = getReactApplicationContext();
            audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (audioManager == null) {
                promise.resolve(false);
                return;
            }

            wasMuted = isStreamMuted();
            if (withAudioFocus) {
                requestAudioFocus();
                holdsAudioFocus = true;
            }
            registerNoisyReceiver(context);
            registerVolumeObserver(context);
            watchAudioMode(context);

            listening = true;
            promise.resolve(true);
        } catch (Exception e) {
            Log.w(TAG, "start failed", e);
            promise.resolve(false);
        }
    }

    /** Stop listening. Called as playback stops and on unmount. */
    @ReactMethod
    public void stop(Promise promise) {
        teardown();
        promise.resolve(true);
    }

    /** Whether the music stream is at zero right now, for a check before play. */
    @ReactMethod
    public void isMuted(Promise promise) {
        try {
            if (audioManager == null) {
                audioManager = (AudioManager)
                        getReactApplicationContext().getSystemService(Context.AUDIO_SERVICE);
            }
            promise.resolve(isStreamMuted());
        } catch (Exception e) {
            // Unknown is reported as "not muted" so a failure here can never be
            // what stops a lecture playing.
            Log.w(TAG, "isMuted failed", e);
            promise.resolve(false);
        }
    }

    /**
     * Whether the app is sharing the screen with another app.
     *
     * Picture-in-Picture counts as multi-window on some versions, so it is
     * excluded: focus mode never arms PiP in the first place, and reporting it
     * here would mean answering for a state that cannot occur.
     */
    @ReactMethod
    public void isInMultiWindow(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            promise.resolve(false);
            return;
        }
        boolean pip = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && activity.isInPictureInPictureMode();
        promise.resolve(activity.isInMultiWindowMode() && !pip);
    }

    /**
     * invalidate(), not onCatalystInstanceDestroy().
     *
     * The latter is still on the NativeModule interface but only as a default
     * no-op; BaseJavaModule overrides invalidate() and that is what React
     * actually calls now. Overriding the wrong one compiles cleanly and leaks
     * the receiver forever.
     */
    @Override
    public void invalidate() {
        teardown();
        super.invalidate();
    }

    // ── Walking ─────────────────────────────────────────────────────────────

    /**
     * Start watching for the person walking off, for focus mode only.
     *
     * The step detector rather than the accelerometer, and that choice is the
     * whole reason this is worth having. Raw motion cannot tell a lecture
     * watched on a bus from one abandoned in a pocket - both are moving. Steps
     * can: a passenger takes none, and neither does someone holding the phone
     * to write a note. It is also hardware-batched, so it costs far less than
     * sampling the accelerometer for three quarters of an hour.
     *
     * Resolves false when the permission has not been granted or the device has
     * no step sensor. The caller treats that as "this signal is unavailable"
     * and carries on with the rest; nothing here is worth failing playback for.
     */
    @ReactMethod
    public void startWalkingDetection(Promise promise) {
        if (watchingSteps) {
            promise.resolve(true);
            return;
        }
        try {
            Context context = getReactApplicationContext();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    && ContextCompat.checkSelfPermission(
                                    context, Manifest.permission.ACTIVITY_RECOGNITION)
                            != PackageManager.PERMISSION_GRANTED) {
                promise.resolve(false);
                return;
            }

            sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
            stepSensor = sensorManager == null
                    ? null
                    : sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);
            if (stepSensor == null) {
                promise.resolve(false);
                return;
            }

            stepTimes.clear();
            stepListener = new SensorEventListener() {
                @Override
                public void onSensorChanged(SensorEvent event) {
                    long now = System.currentTimeMillis();
                    stepTimes.addLast(now);
                    // Drop anything that has fallen out of the window, so this
                    // measures a current gait rather than a day's total.
                    while (!stepTimes.isEmpty()
                            && now - stepTimes.peekFirst() > WALK_WINDOW_MS) {
                        stepTimes.pollFirst();
                    }
                    if (stepTimes.size() >= WALK_STEPS) {
                        // Cleared so the next report needs a fresh run of steps
                        // rather than firing on every footfall afterwards.
                        stepTimes.clear();
                        emit(REASON_WALKING);
                    }
                }

                @Override
                public void onAccuracyChanged(Sensor sensor, int accuracy) {}
            };

            // SENSOR_DELAY_NORMAL: a step detector reports per step regardless,
            // and the slowest rate lets the hardware batch them.
            sensorManager.registerListener(
                    stepListener, stepSensor, SensorManager.SENSOR_DELAY_NORMAL);
            watchingSteps = true;
            promise.resolve(true);
        } catch (Exception e) {
            Log.w(TAG, "startWalkingDetection failed", e);
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void stopWalkingDetection(Promise promise) {
        teardownSteps();
        promise.resolve(true);
    }

    private void teardownSteps() {
        if (!watchingSteps) return;
        watchingSteps = false;
        try {
            if (sensorManager != null && stepListener != null) {
                sensorManager.unregisterListener(stepListener);
            }
        } catch (Exception e) {
            Log.w(TAG, "unregisterListener failed", e);
        }
        stepListener = null;
        stepTimes.clear();
    }

    // ── Audio focus ─────────────────────────────────────────────────────────

    private void requestAudioFocus() {
        focusListener = change -> {
            switch (change) {
                case AudioManager.AUDIOFOCUS_LOSS:
                case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                    // Another player took over, or a call arrived. Either way
                    // the lecture is no longer the thing being heard.
                    emit(REASON_FOCUS);
                    break;
                case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                    // A notification chirping over the top. The system lowers
                    // our volume for a second and the person hears both; that
                    // is not a reason to stop a lecture.
                    break;
                default:
                    // Regaining focus deliberately does not resume. Whatever
                    // took the audio away took the person with it, and playback
                    // starting again by itself when a call ends is how a
                    // lecture ends up running in a pocket.
                    break;
            }
        };

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
            // The two-argument form, with a handler on the main looper.
            //
            // Without it Android binds the callback to the Looper of whatever
            // thread built the request - and start() is called over the bridge,
            // so that is React's native-modules thread, not the main one. Focus
            // was granted and the listener simply never fired: a call took the
            // audio and nothing here heard about it.
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(
                            focusListener, new Handler(Looper.getMainLooper()))
                    .build();
            audioManager.requestAudioFocus(focusRequest);
        } else {
            audioManager.requestAudioFocus(
                    focusListener,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN);
        }
    }

    private void abandonAudioFocus() {
        if (audioManager == null || !holdsAudioFocus) return;
        holdsAudioFocus = false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (focusRequest != null) audioManager.abandonAudioFocusRequest(focusRequest);
            } else if (focusListener != null) {
                audioManager.abandonAudioFocus(focusListener);
            }
        } catch (Exception e) {
            Log.w(TAG, "abandonAudioFocus failed", e);
        }
        focusRequest = null;
        focusListener = null;
    }

    // ── Calls ───────────────────────────────────────────────────────────────

    /**
     * Watch the audio mode, which is what actually says a call is happening.
     *
     * Audio focus was the obvious way to catch this and it did not hold up: the
     * request is granted, and whether the loss callback ever arrives depends on
     * which thread registered it and on the ringtone bothering to take focus at
     * all - a phone on silent may never do so. The mode is a direct statement
     * about telephony instead. MODE_RINGTONE is set the moment it starts
     * ringing, before anybody answers, which is when this should fire.
     */
    private void watchAudioMode(Context context) {
        lastMode = audioManager.getMode();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            modeListener = this::handleModeChange;
            audioManager.addOnModeChangedListener(
                    ContextCompat.getMainExecutor(context), modeListener);
            return;
        }

        modeHandler = new Handler(Looper.getMainLooper());
        modePoll = new Runnable() {
            @Override
            public void run() {
                handleModeChange(audioManager.getMode());
                modeHandler.postDelayed(this, MODE_POLL_MS);
            }
        };
        modeHandler.postDelayed(modePoll, MODE_POLL_MS);
    }

    private void handleModeChange(int mode) {
        if (mode == lastMode) return;
        boolean wasOnCall = isCallMode(lastMode);
        lastMode = mode;
        // Only the way in. Coming off a call does not restart anything here,
        // for the same reason regaining audio focus does not.
        if (!wasOnCall && isCallMode(mode)) {
            emit(REASON_CALL);
        }
    }

    private static boolean isCallMode(int mode) {
        return mode == AudioManager.MODE_RINGTONE
                || mode == AudioManager.MODE_IN_CALL
                || mode == AudioManager.MODE_IN_COMMUNICATION;
    }

    private void unwatchAudioMode() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && modeListener != null) {
                audioManager.removeOnModeChangedListener(modeListener);
            }
        } catch (Exception e) {
            Log.w(TAG, "removeOnModeChangedListener failed", e);
        }
        modeListener = null;

        if (modeHandler != null && modePoll != null) {
            modeHandler.removeCallbacks(modePoll);
        }
        modeHandler = null;
        modePoll = null;
    }

    // ── Headphones ──────────────────────────────────────────────────────────

    private void registerNoisyReceiver(Context context) {
        noisyReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                    emit(REASON_NOISY);
                }
            }
        };
        // Through ContextCompat with an explicit NOT_EXPORTED. Apps targeting
        // API 34 must declare export state for receivers, and while a protected
        // system broadcast like this one is exempt, the exemption is a detail of
        // which broadcasts the platform considers protected - not something to
        // rest a SecurityException on.
        ContextCompat.registerReceiver(
                context,
                noisyReceiver,
                new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
                ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    // ── Volume ──────────────────────────────────────────────────────────────

    private boolean isStreamMuted() {
        if (audioManager == null) return false;
        return audioManager.getStreamVolume(AudioManager.STREAM_MUSIC) == 0;
    }

    /**
     * Watch for the music stream being turned all the way down.
     *
     * A ContentObserver on the settings table rather than the undocumented
     * VOLUME_CHANGED_ACTION broadcast, which is not part of the public API and
     * has been restricted on newer versions. It fires for unrelated settings
     * too, which is why the volume is re-read and compared rather than assumed.
     */
    private void registerVolumeObserver(Context context) {
        volumeObserver = new ContentObserver(new Handler(Looper.getMainLooper())) {
            @Override
            public void onChange(boolean selfChange) {
                boolean muted = isStreamMuted();
                // Only the transition is worth reporting. Every step between 3
                // and 4 comes through here as well.
                if (muted && !wasMuted) {
                    emit(REASON_VOLUME);
                }
                wasMuted = muted;
            }
        };
        context.getContentResolver().registerContentObserver(
                Settings.System.CONTENT_URI, true, volumeObserver);
    }

    // ── Teardown ────────────────────────────────────────────────────────────

    private void teardown() {
        // Steps are torn down whether or not the rest is running: they are
        // started separately, only for focus mode.
        teardownSteps();

        if (!listening) return;
        listening = false;

        Context context = getReactApplicationContext();
        abandonAudioFocus();
        unwatchAudioMode();

        if (noisyReceiver != null) {
            try {
                context.unregisterReceiver(noisyReceiver);
            } catch (Exception e) {
                // Already gone, e.g. the context was torn down first.
                Log.w(TAG, "unregisterReceiver failed", e);
            }
            noisyReceiver = null;
        }

        if (volumeObserver != null) {
            try {
                context.getContentResolver().unregisterContentObserver(volumeObserver);
            } catch (Exception e) {
                Log.w(TAG, "unregisterContentObserver failed", e);
            }
            volumeObserver = null;
        }
    }

    private void emit(String reason) {
        WritableMap payload = Arguments.createMap();
        payload.putString("reason", reason);
        ReactEmitter.emit(getReactApplicationContext(), EVENT, payload);
    }
}
