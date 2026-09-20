package com.audiotracker.verses;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.audiotracker.bridge.ReactEmitter;
import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

/**
 * The JS side of verse detection - see src/verses/verseRecognition.js.
 *
 * Three things have to line up before a single sample can be read, and each can
 * fail in a way the person needs told apart:
 *
 *   the OS version   playback capture arrived in Android 10; below that there
 *                    is no way to read the app's own output at all
 *   the permission   RECORD_AUDIO, which AudioRecord requires even when the
 *                    audio is this app's own and no microphone is involved
 *   the consent      the system's screen-capture dialog, which is shown per
 *                    session and cannot be pre-authorised
 *
 * So `start` reports *why* it cannot run rather than a bare false. A feature
 * that silently does nothing is worse than one that is unavailable.
 */
public class VerseRecognitionModule extends ReactContextBaseJavaModule {

    private static final String TAG = "VerseRecognition";
    private static final int REQUEST_CAPTURE = 7731;

    /** Reasons, matched by name in verseRecognition.js. */
    private static final String ERR_UNSUPPORTED = "unsupported";
    private static final String ERR_PERMISSION = "permission";
    private static final String ERR_DECLINED = "declined";
    private static final String ERR_NO_ACTIVITY = "no_activity";
    private static final String ERR_NO_MODEL = "no_model";
    private static final String ERR_FAILED = "failed";

    private Promise pendingStart;

    private final ActivityEventListener activityListener = new BaseActivityEventListener() {
        @Override
        public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
            if (requestCode != REQUEST_CAPTURE) return;

            Promise promise = pendingStart;
            pendingStart = null;
            if (promise == null) return;

            if (resultCode != Activity.RESULT_OK || data == null) {
                promise.reject(ERR_DECLINED, "Screen capture was not allowed");
                return;
            }

            try {
                Intent service = new Intent(getReactApplicationContext(), VerseCaptureService.class);
                service.putExtra(VerseCaptureService.EXTRA_RESULT_CODE, resultCode);
                service.putExtra(VerseCaptureService.EXTRA_RESULT_DATA, data);
                ContextCompat.startForegroundService(getReactApplicationContext(), service);
                promise.resolve(true);
            } catch (Throwable t) {
                Log.e(TAG, "could not start the capture service", t);
                promise.reject(ERR_FAILED, t.getMessage());
            }
        }
    };

    public VerseRecognitionModule(ReactApplicationContext context) {
        super(context);
        context.addActivityEventListener(activityListener);
    }

    @Override
    public String getName() {
        return "VerseRecognition";
    }

    /** What this device can do. Cheap enough for a settings screen to ask freely. */
    @ReactMethod
    public void capabilities(Promise promise) {
        WritableMap map = Arguments.createMap();
        map.putBoolean("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q);
        map.putInt("sdk", Build.VERSION.SDK_INT);
        map.putBoolean("hasPermission", hasRecordPermission());
        map.putBoolean("modelReady", VerseModelStore.isReady(getReactApplicationContext()));
        map.putBoolean("listening", VerseCaptureService.isActive());
        promise.resolve(map);
    }

    private boolean hasRecordPermission() {
        return ContextCompat.checkSelfPermission(
                getReactApplicationContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Fetch the model now, resolving when it is here.
     *
     * The counterpart to scheduleModelDownload, which asks the system to do it
     * when convenient. This one is for somebody who has asked and is waiting.
     */
    @ReactMethod
    public void prepareModel(Promise promise) {
        Context context = getReactApplicationContext();

        if (VerseModelStore.isReady(context)) {
            promise.resolve(true);
            return;
        }

        new Thread(() -> {
            try {
                VerseModelStore.ensure(context, (read, total) -> {
                    WritableMap payload = Arguments.createMap();
                    payload.putDouble("read", read);
                    payload.putDouble("total", total);
                    ReactEmitter.emit(context, "verseModelProgress", payload);
                });
                promise.resolve(true);
            } catch (Throwable t) {
                Log.e(TAG, "model download failed", t);
                promise.reject(ERR_FAILED, t.getMessage());
            }
        }, "verse-model-fetch").start();
    }

    /** Hand the download to WorkManager and return at once. */
    @ReactMethod
    public void scheduleModelDownload(Promise promise) {
        try {
            VerseModelWorker.enqueue(getReactApplicationContext());
        } catch (Throwable t) {
            Log.w(TAG, "could not enqueue the model download", t);
        }
        if (promise != null) promise.resolve(true);
    }

    @ReactMethod
    public void deleteModel(Promise promise) {
        VerseModelWorker.cancel(getReactApplicationContext());
        VerseModelStore.delete(getReactApplicationContext());
        promise.resolve(true);
    }

    /**
     * Begin listening, which shows the system's capture-consent dialog.
     *
     * Resolves once the service is starting, not once anything has been heard -
     * the first speech event is what says it is really running.
     */
    @ReactMethod
    public void start(Promise promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.reject(ERR_UNSUPPORTED, "Listening needs Android 10 or newer");
            return;
        }
        if (!hasRecordPermission()) {
            // Requested from JS, where the rationale can be shown in context.
            promise.reject(ERR_PERMISSION, "Permission is needed to read the audio");
            return;
        }
        if (!VerseModelStore.isReady(getReactApplicationContext())) {
            promise.reject(ERR_NO_MODEL, "The speech model has not been downloaded yet");
            return;
        }
        if (VerseCaptureService.isActive()) {
            promise.resolve(true);
            return;
        }

        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject(ERR_NO_ACTIVITY, "The app is not in the foreground");
            return;
        }

        if (pendingStart != null) pendingStart.reject(ERR_FAILED, "superseded by another start");
        pendingStart = promise;

        try {
            MediaProjectionManager manager = (MediaProjectionManager)
                    activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            activity.startActivityForResult(manager.createScreenCaptureIntent(), REQUEST_CAPTURE);
        } catch (Throwable t) {
            pendingStart = null;
            Log.e(TAG, "could not ask for capture consent", t);
            promise.reject(ERR_FAILED, t.getMessage());
        }
    }

    /**
     * Stop and start reading without releasing the projection.
     *
     * What playback pause and resume map onto. `stop` would work too and would
     * release more, but the projection cannot be re-acquired without asking the
     * person again - so stopping on every pause meant a consent dialog on every
     * resume.
     */
    @ReactMethod
    public void setCapturing(boolean capturing, Promise promise) {
        try {
            Intent intent = new Intent(getReactApplicationContext(), VerseCaptureService.class);
            intent.setAction(capturing
                    ? VerseCaptureService.ACTION_RESUME
                    : VerseCaptureService.ACTION_PAUSE);
            getReactApplicationContext().startService(intent);
        } catch (Throwable t) {
            // The service not being up is the same outcome as pausing it.
            Log.w(TAG, "setCapturing: " + t.getMessage());
        }
        if (promise != null) promise.resolve(true);
    }

    @ReactMethod
    public void stop(Promise promise) {
        try {
            Intent intent = new Intent(getReactApplicationContext(), VerseCaptureService.class);
            intent.setAction(VerseCaptureService.ACTION_STOP);
            getReactApplicationContext().startService(intent);
        } catch (Throwable t) {
            Log.w(TAG, "stop: " + t.getMessage());
        }
        if (promise != null) promise.resolve(true);
    }

    /** Required by NativeEventEmitter; the work is in ReactEmitter. */
    @ReactMethod
    public void addListener(String eventName) {
    }

    @ReactMethod
    public void removeListeners(Integer count) {
    }

    /** The bridge going away takes the capture with it. */
    @Override
    public void invalidate() {
        stop(null);
        super.invalidate();
    }
}
