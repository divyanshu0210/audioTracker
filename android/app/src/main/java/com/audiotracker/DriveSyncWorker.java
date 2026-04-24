package com.audiotracker;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.audiotracker.drivesync.DriveSyncEngine;
import com.audiotracker.bridge.ReactEmitter;

public class DriveSyncWorker extends Worker {

    private static final String TAG      = "BackupDebug";
    private static final String WORK_TAG = "driveSyncJob";

    public DriveSyncWorker(
            @NonNull Context context,
            @NonNull WorkerParameters params) {
        super(context, params);
    }

    // -----------------------------------------------------------------------
    // Static enqueue helper — called by BackupWorker after a successful backup
    // -----------------------------------------------------------------------

    /**
     * Enqueues a one-time Drive sync job with a CONNECTED network constraint.
     * WorkManager will hold the job until network is available and retry
     * automatically on failure using linear back-off.
     *
     * Uses KEEP policy: if a sync is already waiting/running, we don't
     * replace it — the existing one will pick up the latest state anyway
     * since it reads from the DB at execution time.
     */
    public static void enqueue(Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(DriveSyncWorker.class)
                .setConstraints(constraints)
                .setBackoffCriteria(
                        androidx.work.BackoffPolicy.LINEAR,
                        androidx.work.WorkRequest.MIN_BACKOFF_MILLIS,
                        java.util.concurrent.TimeUnit.MILLISECONDS)
                .build();

        WorkManager.getInstance(context)
                .enqueueUniqueWork(WORK_TAG, ExistingWorkPolicy.KEEP, request);

        Log.d(TAG, "[DRIVE SYNC] DriveSyncWorker enqueued (waiting for network if needed)");
    }

    // -----------------------------------------------------------------------
    // Worker execution
    // -----------------------------------------------------------------------

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "[DRIVE SYNC] Worker started");
          ReactEmitter.emit( getApplicationContext(), "driveSyncStarted", null);

        try {
            DriveSyncEngine.syncBackupsToDrive(getApplicationContext());

            Log.d(TAG, "[DRIVE SYNC] Worker finished successfully");
            ReactEmitter.emit( getApplicationContext(), "driveSyncCompleted", null);
            return Result.success();

        } catch (Exception e) {
            Log.e(TAG, "[DRIVE SYNC] Worker failed", e);
            ReactEmitter.emit( getApplicationContext(), "driveSyncFailed", null);
            return Result.retry();
        }
    }
}