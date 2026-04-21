package com.audiotracker;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.*;

import com.facebook.react.bridge.*;
import com.facebook.react.ReactPackage;
import com.facebook.react.uimanager.ViewManager;

import com.google.common.util.concurrent.ListenableFuture;

import java.util.Collections;
import java.util.List;
import java.util.ArrayList;
import java.util.concurrent.TimeUnit;

class BackupModulePackage implements ReactPackage {

    private static final String TAG = "BackupScheduler";

    @NonNull
    @Override
    public List<NativeModule> createNativeModules(
            @NonNull ReactApplicationContext reactContext) {

        Log.d(TAG, "Creating BackupModule NativeModule");

        List<NativeModule> modules = new ArrayList<>();
        modules.add(new BackupModule(reactContext));

        return modules;
    }

    @NonNull
    @Override
    public List<ViewManager> createViewManagers(
            @NonNull ReactApplicationContext reactContext) {

        Log.d(TAG, "No ViewManagers required for BackupModule");

        return Collections.emptyList();
    }
}

public class BackupModule extends ReactContextBaseJavaModule {

    private static final String TAG = "BackupScheduler";

    public BackupModule(ReactApplicationContext context) {
        super(context);
        Log.d(TAG, "BackupModule initialized");
    }

    @NonNull
    @Override
    public String getName() {
        return "BackupModule";
    }

    private long calculateInitialDelay(String hhmm) {

        Log.d(TAG, "Calculating delay for backup time: " + hhmm);

        int hour = Integer.parseInt(hhmm.substring(0, 2));
        int minute = Integer.parseInt(hhmm.substring(2, 4));

        java.util.Calendar now = java.util.Calendar.getInstance();
        now.set(java.util.Calendar.SECOND, 0);
        now.set(java.util.Calendar.MILLISECOND, 0);

        java.util.Calendar nextRun = java.util.Calendar.getInstance();
        nextRun.set(java.util.Calendar.HOUR_OF_DAY, hour);
        nextRun.set(java.util.Calendar.MINUTE, minute);
        nextRun.set(java.util.Calendar.SECOND, 0);
        nextRun.set(java.util.Calendar.MILLISECOND, 0);

        if (!nextRun.after(now)) {
            Log.d(TAG, "Selected time already passed today. Scheduling for tomorrow.");
            nextRun.add(java.util.Calendar.DAY_OF_YEAR, 1);
        }

        Log.d(TAG, "Current time: " + now.getTime());
        Log.d(TAG, "Next backup run: " + nextRun.getTime());

        long delay = nextRun.getTimeInMillis() - now.getTimeInMillis();

        Log.d(TAG, "Initial delay (ms): " + delay);

        return delay;
    }

    @ReactMethod
    public void scheduleBackupAtTime(String hhmm, int retryMinutes) {

        Log.d(TAG, "Scheduling backup at time: " + hhmm);
        Log.d(TAG, "Retry minutes: " + retryMinutes);

        long delay = calculateInitialDelay(hhmm);

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                BackupWorker.class,
                1,
                TimeUnit.HOURS)
                .setInitialDelay(delay, TimeUnit.MILLISECONDS)
                .setBackoffCriteria(
                        BackoffPolicy.LINEAR,
                        retryMinutes,
                        TimeUnit.MINUTES)
                .build();

        WorkManager.getInstance(getReactApplicationContext())
                .enqueueUniquePeriodicWork(
                        "backupJob",
                        ExistingPeriodicWorkPolicy.REPLACE,
                        request);

        Log.d(TAG, "Backup job scheduled successfully");
    }

    @ReactMethod
    public void runBackupNow() {

        Log.d(TAG, "Manual backup triggered");

        OneTimeWorkRequest request =
                new OneTimeWorkRequest.Builder(BackupWorker.class)
                        .build();

        WorkManager.getInstance(getReactApplicationContext())
                .enqueue(request);

        Log.d(TAG, "BackupWorker enqueued for immediate execution");
    }

    @ReactMethod
    public void cancelBackup() {

        Log.d(TAG, "Cancelling scheduled backup");

        WorkManager.getInstance(getReactApplicationContext())
                .cancelUniqueWork("backupJob");

        Log.d(TAG, "Backup cancelled successfully");
    }

    @ReactMethod
    public void getBackupStatus(Promise promise) {

        Log.d(TAG, "Checking backup job status");

        try {

            ListenableFuture<List<WorkInfo>> future =
                    WorkManager.getInstance(getReactApplicationContext())
                            .getWorkInfosForUniqueWork("backupJob");

            List<WorkInfo> workInfos = future.get(5, TimeUnit.SECONDS);

            if (workInfos == null || workInfos.isEmpty()) {

                Log.d(TAG, "No backup job scheduled");

                WritableMap result = Arguments.createMap();
                result.putString("state", "NOT_SCHEDULED");

                promise.resolve(result);
                return;
            }

            WorkInfo info = workInfos.get(0);

            Log.d(TAG, "Backup job state: " + info.getState().name());

            WritableMap result = Arguments.createMap();
            result.putString("state", info.getState().name());

            if (info.getState() == WorkInfo.State.ENQUEUED
                    && android.os.Build.VERSION.SDK_INT >= 31) {

                long nextRun = info.getNextScheduleTimeMillis();

                Log.d(TAG, "Next scheduled run: " + nextRun);

                result.putDouble("nextRunTime", nextRun);
            }

            promise.resolve(result);

        } catch (Exception e) {

            Log.e(TAG, "Error fetching backup status", e);

            promise.reject("ERROR", e.getMessage(), e);
        }
    }

@ReactMethod
    public void setPreference(String key, String value) {

        Log.d(TAG, "Saving preference: " + key + " = " + value);

        SharedPreferences prefs =
                getReactApplicationContext()
                        .getSharedPreferences("backup", Context.MODE_PRIVATE);

        prefs.edit()
                .putString(key, value)
                .apply();

        Log.d(TAG, "Preference saved successfully: " + key);
    }


    @ReactMethod
    public void getPreference(String key, Promise promise) {
        Log.d(TAG, "Fetching preference for key: " + key);
        try {

            SharedPreferences prefs =
                    getReactApplicationContext()
                            .getSharedPreferences("backup", Context.MODE_PRIVATE);

            String value = prefs.getString(key, null);
            Log.d(TAG, "Retrieved preference for key " + key + ": " + value);

            promise.resolve(value);

        } catch (Exception e) {
            Log.e(TAG, "Error reading preference for key: " + key, e);

            promise.reject("PREF_ERROR", e);

        }
    }
}