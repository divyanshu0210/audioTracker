package com.audiotracker;

import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;

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

    @Override
    public void onActivityResumed(Activity activity) {
        resumedCount++;
        Log.d(TAG, "[PAUSE_OBS] Activity resumed, count=" + resumedCount);
    }

    @Override
    public void onActivityPaused(Activity activity) {
        resumedCount--;
        Log.d(TAG, "[PAUSE_OBS] Activity paused, count=" + resumedCount);

        // Only trigger when NO activities remain in resumed state.
        // count > 0 means another activity is still in foreground
        // (e.g. you opened a settings screen within the app — not a real background)
        if (resumedCount > 0) {
            Log.d(TAG, "[PAUSE_OBS] Another activity still active — skipping");
            return;
        }

        Context ctx = activity.getApplicationContext();
        SharedPreferences prefs = ctx.getSharedPreferences("backup", Context.MODE_PRIVATE);
        String enabled = prefs.getString("BACKUP_ENABLED", "false");

        if (!"true".equals(enabled)) {
            Log.d(TAG, "[PAUSE_OBS] Backup disabled — skipping");
            return;
        }

        Log.d(TAG, "[PAUSE_OBS] App going to background via onPause — enqueueing backup");
        BackupLifecycleObserver.enqueueBackup(ctx);
    }

    // ---- unused callbacks ----
    @Override public void onActivityCreated(Activity a, Bundle b) {}
    @Override public void onActivityStarted(Activity a) {}
    @Override public void onActivityStopped(Activity a) {}
    @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
    @Override public void onActivityDestroyed(Activity a) {}
}