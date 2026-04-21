package com.audiotracker.backup;

import android.database.Cursor;
import io.requery.android.database.sqlite.SQLiteDatabase;

public class BackupDbHelper {

    private static final String TABLE = "backup_files";

    public static void ensureTable(SQLiteDatabase db) {

        db.execSQL(
                "CREATE TABLE IF NOT EXISTS " + TABLE + " (" +
                        "file TEXT PRIMARY KEY," +
                        "level INTEGER NOT NULL," +
                        "start_epoch INTEGER NOT NULL," +
                        "end_epoch INTEGER NOT NULL," +
                        "state TEXT NOT NULL DEFAULT 'local' " +
                        "CHECK (state IN ('local','synced','ghost'))," +
                        "drive_id TEXT UNIQUE" +
                        ")"
        );

        // Optional but highly recommended index
        // db.execSQL(
        //         "CREATE INDEX IF NOT EXISTS idx_backup_level_state " +
        //                 "ON " + TABLE + "(level, state)"
        // );
    }

    // =========================
    // CRUD
    // =========================

    public static void insert(
            SQLiteDatabase db,
            String file,
            int level,
            long start,
            long end) {

        db.execSQL(
                "INSERT OR REPLACE INTO " + TABLE + " VALUES (?,?,?,?,?,?)",
                new Object[]{file, level, start, end, "local", null}
        );
    }

    public static Cursor getLevelFiles(SQLiteDatabase db, int level) {

        return db.rawQuery(
                "SELECT file,start_epoch,end_epoch FROM " + TABLE + " " +
                        "WHERE level=? AND state!='ghost' " +
                        "ORDER BY start_epoch ASC",
                new String[]{String.valueOf(level)}
        );
    }

    public static void updateState(
            SQLiteDatabase db,
            String file,
            String state) {

        db.execSQL(
                "UPDATE " + TABLE + " SET state=? WHERE file=?",
                new Object[]{state, file}
        );
    }

    public static void delete(SQLiteDatabase db, String file) {

        db.execSQL(
                "DELETE FROM " + TABLE + " WHERE file=?",
                new Object[]{file}
        );
    }

    public static String getState(SQLiteDatabase db, String file) {

        Cursor c = db.rawQuery(
                "SELECT state FROM " + TABLE + " WHERE file=?",
                new String[]{file}
        );

        try {
            if (c.moveToFirst()) return c.getString(0);
            return null;
        } finally {
            c.close();
        }
    }
}