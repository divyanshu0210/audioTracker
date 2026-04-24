package com.audiotracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.ForegroundInfo;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.audiotracker.backup.BackupEngine;
import com.audiotracker.bridge.ReactEmitter;

public class BackupWorker extends Worker {

    private static final String CHANNEL_ID  = "backup_channel";
    private static final int    NOTIF_ID    = 1001;

    public BackupWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d("BackupWorker", "Worker started");

        // ✅ Promote to foreground service so OS doesn't kill us
        try {
            setForegroundAsync(createForegroundInfo());
        } catch (Exception e) {
            Log.w("BackupWorker", "setForeground failed (non-fatal)", e);
        }

        ReactEmitter.emit(getApplicationContext(), "backupStarted", null);

        try {
            BackupEngine engine = new BackupEngine(getApplicationContext());
            engine.performBackup();

            Log.d("BackupWorker", "Backup finished");
            ReactEmitter.emit(getApplicationContext(), "backupCompleted", null);

            DriveSyncWorker.enqueue(getApplicationContext());
            return Result.success();

        } catch (Exception e) {
            Log.e("BackupWorker", "Backup failed", e);
            ReactEmitter.emit(getApplicationContext(), "backupFailed", null);
            return Result.retry();
        }
    }

    private ForegroundInfo createForegroundInfo() {
        Context ctx = getApplicationContext();

        // Create channel (required on API 26+, safe to call repeatedly)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Backup",
                    NotificationManager.IMPORTANCE_LOW  // silent — no sound/vibration
            );
            channel.setShowBadge(false);
            ctx.getSystemService(NotificationManager.class)
               .createNotificationChannel(channel);
        }

        Notification notification = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setContentTitle("Backing up...")
                .setSmallIcon(android.R.drawable.ic_menu_save)
                .setOngoing(true)       // can't be dismissed by user
                .setSilent(true)
                .build();

        // On API 29+ you must declare the foreground service type
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return new ForegroundInfo(
                    NOTIF_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            );
        }

        return new ForegroundInfo(NOTIF_ID, notification);
    }
}