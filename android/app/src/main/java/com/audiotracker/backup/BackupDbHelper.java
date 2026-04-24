package com.audiotracker.backup;

import android.database.Cursor;
import io.requery.android.database.sqlite.SQLiteDatabase;

import java.util.ArrayList;
import java.util.List;

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
    // Row types (mirrors JS BackupDbService row shapes)
    // =========================

    public static class FileRow {
        public String file;
        public int    level;

        public FileRow(String file, int level) {
            this.file  = file;
            this.level = level;
        }
    }

    public static class GhostRow {
        public String file;
        public String driveId; // may be null

        public GhostRow(String file, String driveId) {
            this.file    = file;
            this.driveId = driveId;
        }
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

    /**
     * Returns all files in 'local' state, ordered by start_epoch ASC.
     * Mirrors JS getLocalFiles().
     */
    public static List<FileRow> getLocalFiles(SQLiteDatabase db) {

        List<FileRow> list = new ArrayList<>();

        Cursor c = db.rawQuery(
                "SELECT file, level FROM " + TABLE +
                        " WHERE state='local'" +
                        " ORDER BY start_epoch ASC",
                null
        );

        try {
            while (c.moveToNext()) {
                list.add(new FileRow(c.getString(0), c.getInt(1)));
            }
        } finally {
            c.close();
        }

        return list;
    }

    /**
     * Returns all files in 'ghost' state.
     * Mirrors JS getGhostFiles().
     */
    public static List<GhostRow> getGhostFiles(SQLiteDatabase db) {

        List<GhostRow> list = new ArrayList<>();

        Cursor c = db.rawQuery(
                "SELECT file, drive_id FROM " + TABLE +
                        " WHERE state='ghost'",
                null
        );

        try {
            while (c.moveToNext()) {
                list.add(new GhostRow(
                        c.getString(0),
                        c.isNull(1) ? null : c.getString(1)
                ));
            }
        } finally {
            c.close();
        }

        return list;
    }

    /**
     * Update state only (existing behaviour — used by compaction).
     */
    public static void updateState(
            SQLiteDatabase db,
            String file,
            String state) {

        db.execSQL(
                "UPDATE " + TABLE + " SET state=? WHERE file=?",
                new Object[]{state, file}
        );
    }

    /**
     * Update state and optionally set drive_id.
     * Mirrors JS: SET state=?, drive_id=COALESCE(?, drive_id)
     */
    public static void updateState(
            SQLiteDatabase db,
            String file,
            String state,
            String driveId) {

        db.execSQL(
                "UPDATE " + TABLE +
                        " SET state=?, drive_id=COALESCE(?, drive_id)" +
                        " WHERE file=?",
                new Object[]{state, driveId, file}
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