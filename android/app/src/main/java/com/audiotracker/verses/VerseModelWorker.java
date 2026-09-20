package com.audiotracker.verses;

import android.content.Context;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.WorkRequest;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.audiotracker.bridge.ReactEmitter;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;

import java.util.concurrent.TimeUnit;

/**
 * Fetching the speech model, in the background, whether or not the app is
 * open.
 *
 * This used to be a JS function called from the login screen, which meant it
 * only ever ran while somebody was looking at the app, and only at the moment
 * they launched it. Someone onboarding with no signal got nothing, and had to
 * wait for a later launch to happen to have some - and if a download died
 * halfway, that retry also waited for a launch.
 *
 * WorkManager does the whole of that better, and does it with constraints the
 * OS enforces rather than conditions this app checks once:
 *
 *   network     held until there is a connection. The system waits for one,
 *               where the old code checked once and gave up on finding none.
 *   retry       exponential backoff, run by the system, surviving the app
 *               being closed and the device being rebooted.
 *   unique      KEEP, so enqueueing it on every launch is free and cannot
 *               stack up duplicates of a 57MB download.
 *
 * What it does not do is run in a hurry. There is no deadline here: the model
 * is wanted before somebody first switches verse detection on, which is usually
 * days away, and never at a particular moment. If they switch it on sooner than
 * the download, the on-demand path in useVerseDetection still fetches it there
 * and then, with a toast saying what it costs.
 */
public class VerseModelWorker extends Worker {

    private static final String TAG = "VerseModelWorker";
    private static final String WORK_TAG = "verse-model-download";

    /**
     * Any connection at all.
     *
     * This began as UNMETERED, on the reasoning that 57MB is not something to
     * take off somebody's data plan uninvited. That reasoning does not hold up
     * in this app. It streams lectures - anyone using it for an hour has moved
     * far more data than this download costs - so guarding a one-time 57MB
     * against a connection the app is already saturating was protecting nobody.
     *
     * It also had a failure mode worth avoiding: for the many people with no
     * wifi, wifi-only did not mean "later", it meant "never". The feature would
     * sit looking broken indefinitely, or make them wait out the whole download
     * the first time they switched it on - which is precisely the wait this
     * whole mechanism exists to remove.
     */
    private static final NetworkType NETWORK = NetworkType.CONNECTED;

    public VerseModelWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /**
     * Ask for the model, if it is not already here.
     *
     * Safe and cheap to call on every launch: the work is unique and KEEP, so a
     * job already waiting on its constraints is left alone, not replaced.
     */
    public static void enqueue(Context context) {
        // Playback capture arrived in Android 10. Below that the models are
        // 57MB of something that can never run.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        if (VerseModelStore.isReady(context)) return;

        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NETWORK)
                // Nothing here is urgent enough to finish at the cost of
                // somebody's last few percent.
                .setRequiresBatteryNotLow(true)
                .setRequiresStorageNotLow(true)
                .build();

        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(VerseModelWorker.class)
                .setConstraints(constraints)
                .setBackoffCriteria(
                        BackoffPolicy.EXPONENTIAL,
                        WorkRequest.MIN_BACKOFF_MILLIS,
                        TimeUnit.MILLISECONDS)
                .build();

        WorkManager.getInstance(context)
                .enqueueUniqueWork(WORK_TAG, ExistingWorkPolicy.KEEP, request);

        Log.d(TAG, "verse model download enqueued");
    }

    /** Drops a waiting job - for when the model is deleted deliberately. */
    public static void cancel(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_TAG);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();

        if (VerseModelStore.isReady(context)) return Result.success();
        if (isStopped()) return Result.retry();

        try {
            VerseModelStore.ensure(context, (read, total) -> {
                // Only reaches JS when the app happens to be running. That is
                // the point of doing this here: the download does not need
                // anybody watching it.
                WritableMap payload = Arguments.createMap();
                payload.putDouble("read", read);
                payload.putDouble("total", total);
                ReactEmitter.emit(context, "verseModelProgress", payload);
            });
        } catch (Throwable t) {
            Log.w(TAG, "could not fetch the speech model", t);
            // Retry rather than failure: the constraints say there was a usable
            // connection a moment ago, so a dropped one is far likelier than
            // anything permanent. WorkManager backs off, and a genuinely broken
            // host keeps failing harmlessly in the background.
            return Result.retry();
        }

        Log.d(TAG, "verse model ready");
        WritableMap done = Arguments.createMap();
        done.putBoolean("ready", true);
        ReactEmitter.emit(context, "verseModelReady", done);
        return Result.success();
    }
}
