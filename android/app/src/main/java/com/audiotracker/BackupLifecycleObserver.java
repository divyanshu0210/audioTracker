package com.audiotracker;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import androidx.lifecycle.ProcessLifecycleOwner;
import androidx.work.BackoffPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;
import android.content.SharedPreferences;

/**
 * Observes the entire app process lifecycle (not a single Activity).
 *
 * onStop fires when the app goes to background for any reason:
 *   - user presses Home
 *   - user switches to another app
 *   - user swipes app away from recents
 *   - screen turns off while app is open
 *
 * Register once in your Application.onCreate() via:
 *   BackupLifecycleObserver.register(this);
 */
public class BackupLifecycleObserver implements DefaultLifecycleObserver {

    private static final String TAG      = "BackupDebug";
    private static final String WORK_TAG = "backupOnBackground";

    private final Context context;

    private BackupLifecycleObserver(Context context) {
        this.context = context.getApplicationContext();
    }

    /**
     * Call once from Application.onCreate().
     * Must run on the main thread (ProcessLifecycleOwner requirement).
     */
    public static void register(Context context) {
        BackupLifecycleObserver observer = new BackupLifecycleObserver(context);
        ProcessLifecycleOwner.get()
                .getLifecycle()
                .addObserver(observer);
        Log.d(TAG, "[LIFECYCLE] BackupLifecycleObserver registered");
    }

    // -----------------------------------------------------------------------
    // Lifecycle callbacks
    // -----------------------------------------------------------------------

    @Override
    public void onStop(@NonNull LifecycleOwner owner) {
        Log.d(TAG, "[LIFECYCLE] App went to background");
        SharedPreferences prefs = context.getSharedPreferences("backup", Context.MODE_PRIVATE);
        String enabled = prefs.getString("BACKUP_ENABLED", "false");
        
        if (!"true".equals(enabled)) {
            Log.d(TAG, "[LIFECYCLE] Backup disabled — skipping");
            return;
        }
        Log.d(TAG, "[LIFECYCLE] Backup enabled — enqueueing backup job");
        enqueueBackup(context);
    }

    // onStart fires when app comes to foreground — nothing to do for backup
    @Override
    public void onStart(@NonNull LifecycleOwner owner) {
        Log.d(TAG, "[LIFECYCLE] App came to foreground");
    }

    // -----------------------------------------------------------------------
    // Enqueue one-time BackupWorker
    // -----------------------------------------------------------------------

    /**
     * Enqueues a one-time BackupWorker with KEEP policy.
     * If a backup is already queued/running from a previous background event,
     * we leave it — it will pick up all changes written so far.
     *
     * BackupWorker itself enqueues DriveSyncWorker on success.
     */
    static void enqueueBackup(Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BackupWorker.class)
                .setBackoffCriteria(
                        BackoffPolicy.LINEAR,
                        androidx.work.WorkRequest.MIN_BACKOFF_MILLIS,
                        TimeUnit.MILLISECONDS)
                .build();

        WorkManager.getInstance(context)
                .enqueueUniqueWork(WORK_TAG, ExistingWorkPolicy.KEEP, request);

        Log.d(TAG, "[LIFECYCLE] BackupWorker enqueued on background");
    }
}