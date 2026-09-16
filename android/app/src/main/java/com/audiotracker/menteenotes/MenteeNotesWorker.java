package com.audiotracker.menteenotes;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.WorkRequest;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.audiotracker.bridge.ReactEmitter;

import java.util.concurrent.TimeUnit;

/**
 * Both halves of the mentorship notes exchange, on WorkManager.
 *
 * Granting a mentor access and reading a mentee's notes are the same job from
 * a scheduling point of view: each needs a network, each is worth retrying,
 * and each should happen whether or not anyone opens the app. That last part
 * is why this is not JS — a phone that is never launched still runs its
 * WorkManager jobs, and the mentee granting access is the step everything
 * else waits on.
 */
public class MenteeNotesWorker extends Worker {

    private static final String TAG = "MenteeNotes";
    private static final String PERIODIC_TAG = "menteeNotesPeriodic";
    private static final String ONE_SHOT_TAG = "menteeNotesNow";
    // Which mentee this run is about. Absent means all of them, which is what
    // the periodic backstop wants and what a push never does.
    private static final String KEY_MENTEE_ID = "menteeId";

    public MenteeNotesWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    private static Constraints constraints() {
        return new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
    }

    /**
     * Runs roughly every six hours — to reconcile sharing, not to fetch.
     *
     * The backstop for a grant whose push was lost: without it, a mentee
     * whose device missed the notification would leave their mentor locked
     * out indefinitely. It fetches no notes, because nobody has asked for
     * any.
     *
     * KEEP rather than REPLACE: rescheduling on every launch would reset the
     * interval each time and, for someone who opens the app often, mean it
     * never actually fires.
     */
    public static void schedulePeriodic(Context context) {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                MenteeNotesWorker.class, 6, TimeUnit.HOURS)
                .setConstraints(constraints())
                .setBackoffCriteria(
                        BackoffPolicy.LINEAR,
                        WorkRequest.MIN_BACKOFF_MILLIS,
                        TimeUnit.MILLISECONDS)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_TAG, ExistingPeriodicWorkPolicy.KEEP, request);
        Log.d(TAG, "Periodic sync scheduled");
    }

    /**
     * Now — because something said there is new data: a silent push, or a
     * mentor picking a mentee.
     *
     * APPEND_OR_REPLACE, not KEEP. KEEP discards a request while one is
     * already enqueued or running, which is precisely the case that must not
     * be dropped: a mentee uploading while their mentor's worker is mid-run
     * would have their new file thrown away until some later trigger
     * happened to notice it. Appending means the news is always acted on,
     * after whatever is in flight.
     *
     */
    public static void runNow(Context context) {
        runNow(context, null);
    }

    /**
     * `menteeId` names the mentee to fetch. Null fetches nobody.
     *
     * Notes are read when a mentor asks for them — by picking that mentee, or
     * by having their day open when something lands. Not otherwise: a mentor
     * with a hundred mentees would otherwise have their phone woken by every
     * one of them, all day, to download things nobody has asked to see.
     *
     * Sharing is different and always runs. It is this user's own obligation
     * to their own mentors, it cannot happen anywhere else, and it is one
     * call when there is nothing to do.
     */
    public static void runNow(Context context, String menteeId) {
        Data input = menteeId == null
                ? Data.EMPTY
                : new Data.Builder().putString(KEY_MENTEE_ID, menteeId).build();

        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(MenteeNotesWorker.class)
                .setConstraints(constraints())
                .setInputData(input)
                .setBackoffCriteria(
                        BackoffPolicy.LINEAR,
                        WorkRequest.MIN_BACKOFF_MILLIS,
                        TimeUnit.MILLISECONDS)
                .build();

        WorkManager.getInstance(context).enqueueUniqueWork(
                ONE_SHOT_TAG, ExistingWorkPolicy.APPEND_OR_REPLACE, request);
        Log.d(TAG, "One-off sync enqueued" + (menteeId == null ? " (all)" : " for " + menteeId));
    }

    public static void cancel(Context context) {
        WorkManager wm = WorkManager.getInstance(context);
        wm.cancelUniqueWork(PERIODIC_TAG);
        wm.cancelUniqueWork(ONE_SHOT_TAG);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Worker started");
        // Said before the work, not only after it. A first sync is a whole
        // backup, and a mentor who has just picked a mentee should be able to
        // see that something is happening rather than an empty list that
        // looks like an answer.
        ReactEmitter.emit(getApplicationContext(), "menteeNotesSyncing", null);
        try {
            // Granting first. A mentor cannot read anything until their
            // mentee's device has said yes, and on a two-device exchange this
            // one may be the mentee — so doing it before reading means the
            // pair can complete in fewer rounds.
            String menteeId = getInputData().getString(KEY_MENTEE_ID);

            // Always: granting a mentor access to this user's own backup is
            // theirs to do and nobody else's, and nothing downstream can
            // happen until it has.
            MentorSharing.reconcile(getApplicationContext());

            // Only when somebody asked for this mentee.
            if (menteeId != null) {
                MenteeNotesSync.syncAll(getApplicationContext(), menteeId);
            }

            // So a day report that is open right now re-reads its rows. The
            // emitter is a no-op when no React context is alive, which is the
            // usual case here — and costs nothing then, because a screen that
            // does not exist has nothing to refresh.
            ReactEmitter.emit(getApplicationContext(), "menteeNotesSynced", null);

            Log.d(TAG, "Worker finished");
            return Result.success();
        } catch (Exception e) {
            Log.e(TAG, "Worker failed", e);
            // So a screen waiting on this stops waiting. The retry will
            // announce itself again when it runs.
            ReactEmitter.emit(getApplicationContext(), "menteeNotesSynced", null);
            return Result.retry();
        }
    }
}
