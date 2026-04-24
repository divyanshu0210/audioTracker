package com.audiotracker.drivesync;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import io.requery.android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.audiotracker.backup.BackupUtils;
import com.audiotracker.backup.BackupDbHelper;

public class DriveSyncEngine {

    private static final String TAG = "BackupDebug";
    private static final String DRIVE_MAIN_FOLDER_NAME = "AppBackups";
    private static final String PREF_NAME           = "backup";
    private static final String KEY_LAST_DRIVE_SYNC = "LAST_BACKUP_SYNC_TIME_";
    private static final String LAST_BACKUP_PREFIX  = "LAST_NATIVE_BACKUP_TIME_";
    private static final int CONCURRENCY = 3;

    // Called from DriveSyncWorker. Network is guaranteed by WorkManager constraint.
    public static void syncBackupsToDrive(Context context) throws Exception {

        String userId = BackupUtils.getUserId(context);
        if (userId == null) {
            Log.w(TAG, "[SYNC] No userId — skipping");
            return;
        }

        SharedPreferences prefs =
                context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);

        String lastNativeBackup = prefs.getString(LAST_BACKUP_PREFIX + userId, null);
        if (lastNativeBackup == null) {
            Log.d(TAG, "[SYNC] No native backup found — nothing to sync");
            return;
        }

        String lastDriveSync = prefs.getString(KEY_LAST_DRIVE_SYNC + userId, null);
        long nativeTime = BackupUtils.toEpoch(lastNativeBackup);
        long driveTime  = (lastDriveSync != null) ? BackupUtils.toEpoch(lastDriveSync) : 0;

        Log.d(TAG, "[SYNC] Last native backup : " + lastNativeBackup + " (" + nativeTime + ")");
        Log.d(TAG, "[SYNC] Last Drive sync    : " + lastDriveSync    + " (" + driveTime  + ")");

        if (driveTime >= nativeTime) {
            Log.d(TAG, "[SYNC] Already up to date — skipping");
            saveDriveSyncTimestamp(context, userId); 
            return;
        }

        Log.d(TAG, "[SYNC] Starting Drive sync...");

        SQLiteDatabase db = BackupUtils.openDatabase(context, userId);
        try {
            FolderIds folderIds = initializeDriveFolders(context);
            uploadLocalBackups(context, db, folderIds.root);
            deleteGhostBackups(context, db, folderIds.root);
            syncImageFiles(context, folderIds.images);
        } finally {
            db.close();
            Log.d(TAG, "[SYNC] DB closed");
        }

        saveDriveSyncTimestamp(context, userId);
        Log.d(TAG, "[SYNC] Completed successfully");
    }

    private static class FolderIds {
        final String root;
        final String images;
        FolderIds(String root, String images) { this.root = root; this.images = images; }
    }

    private static FolderIds initializeDriveFolders(Context context) throws Exception {
        Log.d(TAG, "[INIT] Initializing Drive folders");
        String root   = DriveApiHelper.getOrCreateFolder(context, DRIVE_MAIN_FOLDER_NAME, "root");
        String images = DriveApiHelper.getOrCreateFolder(context, "images", root);
        Log.d(TAG, "[INIT] root=" + root + "  images=" + images);
        return new FolderIds(root, images);
    }

    private static void uploadLocalBackups(Context context, SQLiteDatabase db, String folderId) throws Exception {
        Log.d(TAG, "[PHASE] Upload local backups");
        List<BackupDbHelper.FileRow> localFiles = BackupDbHelper.getLocalFiles(db);
        Log.d(TAG, "[SYNC] Found " + localFiles.size() + " local files to sync");

        List<Runnable> tasks = new ArrayList<>();
        for (BackupDbHelper.FileRow row : localFiles) {
            final BackupDbHelper.FileRow r = row;
            tasks.add(() -> {
                File localPath = new File(BackupUtils.getLevelDir(context, r.level), r.file);
                uploadTask(context, db, localPath, r.file, folderId,
                        () -> BackupDbHelper.updateState(db, r.file, "synced"),
                        driveId -> BackupDbHelper.updateState(db, r.file, "synced", driveId),
                        true);
            });
        }
        runWithLimit(tasks, CONCURRENCY);
    }

    private static void deleteGhostBackups(Context context, SQLiteDatabase db, String folderId) throws Exception {
        Log.d(TAG, "[PHASE] Delete ghost files");
        List<BackupDbHelper.GhostRow> ghostFiles = BackupDbHelper.getGhostFiles(db);
        List<Runnable> tasks = new ArrayList<>();
        for (BackupDbHelper.GhostRow row : ghostFiles) {
            final BackupDbHelper.GhostRow r = row;
            tasks.add(() -> {
                try { deleteTask(context, db, r.file, r.driveId, folderId); }
                catch (Exception e) { Log.e(TAG, "[SYNC] Ghost delete failed: " + r.file, e); }
            });
        }
        runWithLimit(tasks, CONCURRENCY);
    }

    private static void syncImageFiles(Context context, String folderId) throws Exception {
        Log.d(TAG, "[PHASE] Sync images");
        File imageDir = new File(context.getFilesDir(), "backups/images");
        if (!imageDir.exists()) return;
        File[] files = imageDir.listFiles();
        if (files == null || files.length == 0) { Log.d(TAG, "[IMG] No images found"); return; }
        List<Runnable> tasks = new ArrayList<>();
        for (File f : files) {
            final File imageFile = f;
            tasks.add(() -> uploadTask(context, null, imageFile, imageFile.getName(), folderId, null, null, true));
        }
        runWithLimit(tasks, CONCURRENCY);
    }

    interface OnMissing { void run() throws Exception; }
    interface OnSynced  { void run(String driveId) throws Exception; }

    private static void uploadTask(Context context, SQLiteDatabase db, File localFile, String fileName,
                                   String folderId, OnMissing onMissing, OnSynced onSynced, boolean deleteAfterUpload) {
        try {
            if (!localFile.exists()) {
                Log.w(TAG, "[SYNC] Missing local file: " + fileName);
                if (onMissing != null) onMissing.run();
                return;
            }
            JSONObject existing = DriveApiHelper.findFileByName(context, fileName, folderId);
            if (existing != null) {
                Log.d(TAG, "[SYNC] Already exists on Drive: " + fileName);
                if (onSynced != null) onSynced.run(existing.getString("id"));
                if (localFile.exists()) localFile.delete();
                return;
            }
            JSONObject result = RetryHelper.retry(
                    () -> DriveApiHelper.uploadFile(context, localFile, fileName, folderId));
            if (onSynced != null) onSynced.run(result.getString("id"));
            if (deleteAfterUpload && localFile.exists()) localFile.delete();
        } catch (Exception e) {
            Log.e(TAG, "[SYNC] Upload failed: " + fileName, e);
        }
    }

    private static void deleteTask(Context context, SQLiteDatabase db, String file,
                                   String initialDriveId, String folderId) throws Exception {
        final String[] driveIdHolder = {initialDriveId};
        final boolean[] alreadyGone  = {false};
        RetryHelper.retry(() -> {
            if (driveIdHolder[0] == null) {
                JSONObject existing = DriveApiHelper.findFileByName(context, file, folderId);
                if (existing == null) { alreadyGone[0] = true; return null; }
                driveIdHolder[0] = existing.getString("id");
            }
            DriveApiHelper.deleteFile(context, driveIdHolder[0]);
            return null;
        });
        if (driveIdHolder[0] != null || alreadyGone[0]) {
            BackupDbHelper.delete(db, file);
            Log.d(TAG, "[SYNC] Ghost removed: " + file);
        }
    }

    private static void runWithLimit(List<Runnable> tasks, int limit) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(limit);
        List<Future<?>> futures  = new ArrayList<>();
        for (Runnable task : tasks) futures.add(executor.submit(task));
        executor.shutdown();
        for (Future<?> f : futures) f.get();
    }

    private static void saveDriveSyncTimestamp(Context context, String userId) {
        String now = BackupUtils.getCurrentTimestamp();
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .edit().putString(KEY_LAST_DRIVE_SYNC + userId, now).apply();
        Log.d(TAG, "[SYNC] Drive sync timestamp saved: " + now);
    }
}