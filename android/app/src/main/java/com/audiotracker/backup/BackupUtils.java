package com.audiotracker.backup;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.util.Log;

import io.requery.android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.text.SimpleDateFormat;
import java.util.*;

public class BackupUtils {

    private static final String TAG = "BackupDebug";

    private static final String[] TABLES = {
            "items",
            "notebooks",
            "categories",
            "youtube_meta",
            "category_items",
            "notes",
            "video_watch_history"
    };

    private static final String PREF_NAME = "backup";
    private static final String USER_ID_KEY = "userId";
    private static final String LAST_BACKUP_PREFIX = "LAST_NATIVE_BACKUP_TIME_";

    // =========================
    // LEVEL CONFIG
    // =========================
    public static class LevelConfig {
        public int maxFiles;
        public int compactCount;

        public LevelConfig(int maxFiles, int compactCount) {
            this.maxFiles = maxFiles;
            this.compactCount = compactCount;
        }
    }

    public static LevelConfig[] LEVELS = new LevelConfig[]{ 
                new LevelConfig(6, 6),
                new LevelConfig(4, 4),
                new LevelConfig(7, 7),
                new LevelConfig(4, 4),
                new LevelConfig(4, 4),
                new LevelConfig(Integer.MAX_VALUE, 0)
    };

    // =========================
    // DB
    // =========================
    public static SQLiteDatabase openDatabase(Context context, String userId) {
        String dbName = "DriveApp_" + userId + ".db";
        File dbFile = new File(context.getFilesDir(), dbName);

        Log.d(TAG, "Opening DB: " + dbFile.getAbsolutePath());

        SQLiteDatabase db = SQLiteDatabase.openDatabase(
                dbFile.getAbsolutePath(),
                null,
                SQLiteDatabase.OPEN_READWRITE
        );
        BackupDbHelper.ensureTable(db);
        return db;

    }

    // =========================
    // RANGE BACKUP
    // =========================
    public static JSONObject prepareRangeBackup(
            SQLiteDatabase db,
            String start,
            String end) throws Exception {

        Log.d(TAG, "Preparing range backup: " + start + " → " + end);

        JSONObject changes = new JSONObject();

        for (String table : TABLES) {
            JSONArray rows = fetchTableRange(db, table, start, end);
            Log.d(TAG, table + " rows: " + rows.length());
            changes.put(table, rows);
        }

        return changes;
    }

    private static JSONArray fetchTableRange(
            SQLiteDatabase db,
            String table,
            String start,
            String end) throws Exception {

        JSONArray arr = new JSONArray();
        Cursor cursor = null;

        try {
            String query;
            String[] params;

            if (table.equals("notes")) {
                query = "SELECT rowid,* FROM notes WHERE created_at >= ? AND created_at < ?";
                params = new String[]{start, end};

            } else if (table.equals("video_watch_history")) {
                query = "SELECT * FROM video_watch_history WHERE lastWatchedAt >= ? AND lastWatchedAt < ?";
                params = new String[]{start, end};

            } else {
                query = "SELECT * FROM " + table + " WHERE created_at >= ? AND created_at < ?";
                params = new String[]{start, end};
            }

            cursor = db.rawQuery(query, params);

            while (cursor.moveToNext()) {
                JSONObject row = new JSONObject();
                for (int i = 0; i < cursor.getColumnCount(); i++) {
                    row.put(cursor.getColumnName(i), cursor.getString(i));
                }
                arr.put(row);
            }

        } finally {
            if (cursor != null) cursor.close();
        }

        return arr;
    }

    // =========================
    // IMAGE BACKUP
    // =========================
    public static void backupImagesIncremental(
            SQLiteDatabase db,
            Context context,
            String start,
            String end) {

        try {
            Log.d(TAG, "Backing up images: " + start + " → " + end);

            JSONArray imageInc =
                    fetchTableRange(db, "images", start, end);

            if (imageInc.length() == 0) {
                Log.d(TAG, "No new images");
                return;
            }

            JSONObject imageData = new JSONObject();
            imageData.put("images", imageInc);

            writeImageFile(context, imageData, start, end);

            Log.d(TAG, "Images backed up: " + imageInc.length());

        } catch (Exception e) {
            Log.e(TAG, "Image backup failed", e);
            throw new RuntimeException(e);
        }
    }

    // =========================
    // FILE HELPERS
    // =========================
    public static File getLevelDir(Context context, int level) {
        File base = new File(context.getFilesDir(), "backups");
        File dir = new File(base, "L" + level);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    public static class BackupFile {
        public String file;
        public long start;
        public long end;

        public BackupFile(String f, long s, long e) {
            file = f;
            start = s;
            end = e;
        }
    }

    public static List<BackupFile> getLevelFiles(SQLiteDatabase db, int level) {

        List<BackupFile> list = new ArrayList<>();

        Cursor c = BackupDbHelper.getLevelFiles(db, level);

        while (c.moveToNext()) {
            list.add(new BackupFile(
                    c.getString(0),
                    c.getLong(1),
                    c.getLong(2)
            ));
        }

        c.close();
        return list;
    }

    public static void writeLevelFile(
            Context context,
            SQLiteDatabase db,
            int level,
            JSONObject data,
            long start,
            long end) throws Exception {

        
        String fileName = "L" + level + "_" + start + "-" + end + ".json";
        File file = new File(
                getLevelDir(context, level),
                fileName
        );

        Log.d(TAG, "Writing L" + level + " file: " + file.getName());

        FileOutputStream fos = new FileOutputStream(file);
        fos.write(data.toString().getBytes());
        fos.close();

        BackupDbHelper.insert(db, fileName, level, start, end);
    }

    public static void writeImageFile(
            Context context,
            JSONObject data,
            String start,
            String end) throws Exception {

        File dir = new File(context.getFilesDir(), "backups/images");
        if (!dir.exists()) dir.mkdirs();

        long s = toEpoch(start);
        long e = toEpoch(end);

        File file = new File(dir, "img_" + s + "-" + e + ".json");

        Log.d(TAG, "Writing image file: " + file.getName());

        FileOutputStream fos = new FileOutputStream(file);
        fos.write(data.toString().getBytes());
        fos.close();
    }

    // =========================
    // COMPACTION
    // =========================
public static void runCompaction(
        Context context,
        SQLiteDatabase db) throws Exception {

    boolean didCompact;

    do {
        didCompact = false;

        for (int level = 0; level < LEVELS.length - 1; level++) {

            LevelConfig cfg = LEVELS[level];

            List<BackupFile> files = getLevelFiles(db, level);

            if (files.size() <= cfg.maxFiles) continue;

            int K = cfg.compactCount;

            if (files.size() < K) continue;

            List<BackupFile> merge =
                    new ArrayList<>(files.subList(0, K));

            long start = merge.get(0).start;
            long end = merge.get(K - 1).end;

            Log.d(TAG, "INLINE COMPACT L" + level +
                    " → L" + (level + 1));

            JSONObject data = prepareRangeBackup(
                    db,
                    fromEpoch(start),
                    fromEpoch(end)
            );

            if (!isEmpty(data)) {
                writeLevelFile(context, db, level + 1, data, start, end);
            }

            for (BackupFile bf : merge) {

                String state = BackupDbHelper.getState(db, bf.file);

                if ("synced".equals(state)) {
                    BackupDbHelper.updateState(db, bf.file, "ghost");
                } else {
                    BackupDbHelper.delete(db, bf.file);
                }

                File f = new File(
                        context.getFilesDir(),
                        "backups/L" + level + "/" + bf.file
                );

                if (f.exists()) f.delete();
            }

            didCompact = true;
            break; // restart from L0 after each compaction
        }

    } while (didCompact);
}

    // =========================
    // UTILS
    // =========================
    public static boolean isEmpty(JSONObject data) throws Exception {
        for (String table : TABLES) {
            if (data.getJSONArray(table).length() > 0) return false;
        }
        return true;
    }

    public static String getCurrentTimestamp() {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date());
    }

    public static long toEpoch(String ts) throws Exception {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss")
                .parse(ts).getTime() / 1000;
    }

    public static String fromEpoch(long epoch) {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss")
                .format(new Date(epoch * 1000));
    }

    public static void saveBackupTimestamp(Context c, String userId, String time) {
        c.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(LAST_BACKUP_PREFIX + userId, time)
                .apply();
    }

    public static String getLastBackupTime(Context c, String userId) {
        return c.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .getString(LAST_BACKUP_PREFIX + userId, "2000-01-01 00:00:00");
    }

    public static String getUserId(Context c) {
        return c.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .getString(USER_ID_KEY, null);
    }
}