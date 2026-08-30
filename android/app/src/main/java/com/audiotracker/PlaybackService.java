package com.audiotracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * Foreground service held for as long as media is playing.
 *
 * VLC's playInBackground keeps the *player* decoding but gives the OS no reason
 * to keep the *process*: backgrounded, the app is merely a cached process and
 * Android reclaims it after a few minutes, mid-playback.
 *
 * This is deliberately its own service rather than a task on
 * react-native-background-actions. That library exposes a single native service
 * that downloads and restore already share, and playback overlaps both — a
 * download finishing would call stop() and silently take playback's protection
 * with it, while playback holding the service would make enqueueDownload think
 * a download task was already running.
 */
public class PlaybackService extends Service {

    private static final String TAG        = "PlaybackService";
    private static final String CHANNEL_ID = "playback_channel";
    private static final int    NOTIF_ID   = 2001;

    /** Long enough for React's unmount + the final SQLite write to complete. */
    private static final long   SHUTDOWN_GRACE_MS = 4000L;

    public static final String EXTRA_TITLE = "title";

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : null;
        if (title == null || title.isEmpty()) {
            title = getString(R.string.app_name);
        }

        try {
            Notification notification = buildNotification(title);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                        NOTIF_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, notification);
            }
        } catch (Exception e) {
            // Android 12+ rejects a foreground-service start that comes from an
            // already-backgrounded process. Playback still works for as long as
            // the process happens to live; it just isn't protected.
            Log.w(TAG, "startForeground failed", e);
            stopSelf();
        }

        // Nothing here is worth resurrecting after a process kill — playback is
        // gone by then anyway, and a restart would show a notification for
        // media that isn't playing.
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Swiping the app away — or closing the PiP window — should not leave a
        // playback notification behind. But stopping instantly drops the
        // process to "empty" (oom_adj ~999) while React is still unmounting and
        // its final saveWatchProgress transaction is in flight, which loses the
        // session's watch time. Hold the service a few seconds longer so that
        // write lands, then go.
        new Handler(Looper.getMainLooper())
                .postDelayed(this::stopSelf, SHUTDOWN_GRACE_MS);
        super.onTaskRemoved(rootIntent);
    }

    private Notification buildNotification(String title) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Playback",
                    NotificationManager.IMPORTANCE_LOW); // silent — no sound/vibration
            channel.setShowBadge(false);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }

        Intent launch = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, launch, piFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText("Playing")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    // ── Helpers for the bridge module ────────────────────────────────────────

    static void start(Context context, String title) {
        Intent intent = new Intent(context, PlaybackService.class)
                .putExtra(EXTRA_TITLE, title);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, PlaybackService.class));
    }
}
