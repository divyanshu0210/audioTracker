package com.audiotracker.backup;

import android.content.Context;
import android.util.Log;

import io.requery.android.database.sqlite.SQLiteDatabase;
import org.json.JSONObject;

import java.util.concurrent.atomic.AtomicBoolean;

public class BackupEngine {

    private static final String TAG = "BackupDebug";
    private static final AtomicBoolean isBackupRunning = new AtomicBoolean(false);

    private Context context;

    public BackupEngine(Context context) {
        this.context = context;
    }

    public void performBackup() throws Exception {

        //prevent duplicate runs
        if (!isBackupRunning.compareAndSet(false, true)) {
            Log.d(TAG, "Backup already running → skipping");
            return;
        }

        String userId = BackupUtils.getUserId(context);
        if (userId == null) {
            Log.d(TAG, "No userId → skipping backup");
            isBackupRunning.set(false);
            return;
        }

        SQLiteDatabase db = null;

        try {
            db = BackupUtils.openDatabase(context, userId);

            String now = BackupUtils.getCurrentTimestamp();
            String last = BackupUtils.getLastBackupTime(context, userId);

            Log.d(TAG, "Backup window: " + last + " → " + now);

            long startEpoch = BackupUtils.toEpoch(last);
            long endEpoch = BackupUtils.toEpoch(now);

            // Images
            BackupUtils.backupImagesIncremental(db, context, last, now);

            // L0
            JSONObject data = BackupUtils.prepareRangeBackup(db, last, now);

            if (!BackupUtils.isEmpty(data)) {
                BackupUtils.writeLevelFile(context, db, 0, data, startEpoch, endEpoch);
            } else {
                Log.d(TAG, "No structured data changes");
            }

            BackupUtils.saveBackupTimestamp(context, userId, now);

            // Compaction
            BackupUtils.runCompaction(context, db);

        } finally {
            if (db != null) {
                db.close();
                Log.d(TAG, "DB closed");
            }

            // ✅ Always release lock
            isBackupRunning.set(false);
        }
    }
}