package com.audiotracker;

import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.os.Handler;
import android.os.Looper;

/**
 * Triggers backup on onPause of any activity.
 * onPause is the ONLY lifecycle event guaranteed to fire before:
 *   - Home button
 *   - App switcher / recents button
 *   - Swipe away from recents
 *   - Another app coming to foreground
 *
 * We guard against spurious triggers (e.g. activity rotation, 
 * internal navigation) using a resumed-activity counter.
 */


public class BackupPauseObserver implements Application.ActivityLifecycleCallbacks {

    private static final String TAG = "BackupDebug";
    private int resumedCount = 0;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable backupRunnable;

    @Override
    public void onActivityResumed(Activity activity) {
        resumedCount++;
        Log.d(TAG, "[PAUSE_OBS] Activity resumed, count=" + resumedCount);

        // Cancel pending backup (false trigger)
        if (backupRunnable != null) {
            handler.removeCallbacks(backupRunnable);
            backupRunnable = null;
            Log.d(TAG, "[PAUSE_OBS] Cancelled pending backup");
        }
    }

    @Override
    public void onActivityPaused(Activity activity) {
        resumedCount--;
        Log.d(TAG, "[PAUSE_OBS] Activity paused, count=" + resumedCount);

        if (resumedCount > 0) {
            Log.d(TAG, "[PAUSE_OBS] Another activity active — skipping");
            return;
        }

        Context ctx = activity.getApplicationContext();

        backupRunnable = () -> {
            SharedPreferences prefs = ctx.getSharedPreferences("backup", Context.MODE_PRIVATE);
            String enabled = prefs.getString("BACKUP_ENABLED", "false");

            if (!"true".equals(enabled)) {
                Log.d(TAG, "[PAUSE_OBS] Backup disabled — skipping");
                return;
            }

            Log.d(TAG, "[PAUSE_OBS] Confirmed background — enqueueing backup");
            BackupLifecycleObserver.enqueueBackup(ctx);
        };

        // Delay ensures it's not just an activity transition
        handler.postDelayed(backupRunnable, 700); // tweak 500–1000ms
    }

     // ---- unused callbacks ----
    @Override public void onActivityCreated(Activity a, Bundle b) {}
    @Override public void onActivityStarted(Activity a) {}
    @Override public void onActivityStopped(Activity a) {}
    @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
    @Override public void onActivityDestroyed(Activity a) {}
}
