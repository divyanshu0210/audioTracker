package com.audiotracker.menteenotes;

import android.database.Cursor;
import android.util.Log;

import io.requery.android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Writes a mentee's synced rows into this device's database.
 *
 * It also creates them — see ensureTables. menteeNotesDB.js reads through the
 * same tables but never writes one, so the schema lives with the only thing
 * that does. Rows are someone else's writing: read-only to the user, never
 * part of their own search (mentee_notes is a plain table, not the fts5 one),
 * and dropped whole when a mentorship ends.
 *
 * Every value in a backup row arrives as a string, because the writer reads
 * them with Cursor.getString. The two numeric columns are coerced here rather
 * than left to surface as "1234" somewhere that wants a number.
 */
public final class MenteeNotesDb {

    private static final String TAG = "MenteeNotes";

    private MenteeNotesDb() {}

    /**
     * Creates the mentee tables if this device has never synced one.
     *
     * Called at the top of a sync rather than at login, so an account that
     * never mentors anybody never carries them — which is most accounts, and
     * about 60KB each. Every statement is IF NOT EXISTS, so the usual case is
     * seven no-ops on an open database.
     *
     * The reader tolerates their absence, because between a mentorship being
     * approved and the first sync finishing that is the true state.
     */
    public static void ensureTables(SQLiteDatabase db) {
        for (String sql : MenteeNotesSql.CREATE_SCHEMA) {
            db.execSQL(sql);
        }
    }

    /* ---------------------------------- */
    /* Sync state                          */
    /* ---------------------------------- */

    public static final class SyncState {
        public String folderId;
        public String imagesFolderId;
        public List<Coverage.Range> covered = new ArrayList<>();
        public long lastSyncAt;
    }

    public static SyncState loadSyncState(SQLiteDatabase db, String menteeId) {
        SyncState state = new SyncState();
        Cursor c = null;
        try {
            c = db.rawQuery(MenteeNotesSql.SELECT_SYNC_STATE, new String[]{menteeId});
            if (c.moveToFirst()) {
                state.folderId = c.getString(0);
                state.imagesFolderId = c.getString(1);
                state.covered = Coverage.parse(c.getString(2));
                state.lastSyncAt = c.getLong(3);
            }
        } catch (Exception e) {
            Log.e(TAG, "loadSyncState failed", e);
        } finally {
            if (c != null) c.close();
        }
        return state;
    }

    public static void saveSyncState(SQLiteDatabase db, String menteeId, SyncState state) {
        db.execSQL(MenteeNotesSql.UPSERT_SYNC_STATE, new Object[]{
                menteeId,
                state.folderId,
                state.imagesFolderId,
                Coverage.serialize(state.covered),
                state.lastSyncAt,
        });
    }

    /**
     * Forgets everything read for this mentee.
     *
     * For a folder id that has changed — a reinstall backs up somewhere new,
     * and coverage recorded against the old one describes a history that no
     * longer exists — and for a mentorship that has ended.
     */
    public static void clearMentee(SQLiteDatabase db, String menteeId) {
        for (String table : MenteeNotesSql.OWNED_TABLES) {
            try {
                db.execSQL(MenteeNotesSql.deleteFor(table), new Object[]{menteeId});
            } catch (Exception e) {
                Log.e(TAG, "Could not clear " + table, e);
            }
        }
    }

    /* ---------------------------------- */
    /* Applying a downloaded level file    */
    /* ---------------------------------- */

    /**
     * Everything one level file contributes, in one transaction.
     *
     * Items before notes: a note is stored whether or not its media is known,
     * but the title is what makes it mean anything, and when both are in the
     * same file there is no reason for the note to land first and be untitled
     * for a moment.
     *
     * Returns how many notes were written.
     */
    public static int applyLevelFile(SQLiteDatabase db, String menteeId, JSONObject data) {
        int notes = 0;
        db.beginTransaction();
        try {
            applyItems(db, menteeId, data.optJSONArray("items"));
            applyYoutubeMeta(db, menteeId, data.optJSONArray("youtube_meta"));
            applyDriveCopies(db, menteeId, data.optJSONArray("shared_drive_copies"));
            notes = applyNotes(db, menteeId, data.optJSONArray("notes"));
            db.setTransactionSuccessful();
        } catch (Exception e) {
            Log.e(TAG, "applyLevelFile failed", e);
        } finally {
            db.endTransaction();
        }
        return notes;
    }

    private static int applyNotes(SQLiteDatabase db, String menteeId, JSONArray rows) {
        if (rows == null) return 0;
        int applied = 0;

        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null || row.isNull("rowid")) continue;

            try {
                db.execSQL(MenteeNotesSql.UPSERT_NOTE, new Object[]{
                        menteeId,
                        row.optLong("rowid"),
                        str(row, "source_id"),
                        str(row, "source_type"),
                        str(row, "title"),
                        str(row, "content"),
                        // Backups written before entity decoding carry raw
                        // "&nbsp;" here. Left as found: the JS reader decodes
                        // this user's own notes the same way on the way in,
                        // and doing it in two places with two implementations
                        // is how they come to disagree.
                        str(row, "text_content"),
                        str(row, "created_at"),
                        str(row, "updated_at"),
                        str(row, "deleted_at"),
                });
                applied++;
            } catch (Exception e) {
                Log.e(TAG, "note upsert failed", e);
            }
        }
        return applied;
    }

    private static void applyItems(SQLiteDatabase db, String menteeId, JSONArray rows) {
        if (rows == null) return;

        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) continue;
            String sourceId = str(row, "source_id");
            String type = str(row, "type");
            if (sourceId == null || type == null) continue;

            try {
                db.execSQL(MenteeNotesSql.UPSERT_ITEM, new Object[]{
                        menteeId,
                        sourceId,
                        type,
                        num(row, "id"),
                        str(row, "title"),
                        str(row, "mimeType"),
                        num(row, "duration"),
                        // Their path, useless as a path here — kept because
                        // the reader rebuilds an iskcon url from it, and that
                        // url is what makes the file streamable on this
                        // device.
                        str(row, "file_path"),
                        str(row, "updated_at"),
                });
            } catch (Exception e) {
                Log.e(TAG, "item upsert failed", e);
            }
        }
    }

    // youtube_meta and shared_drive_copies are keyed by the mentee's own
    // items.id, which is why mentee_items carries remote_id. Two writers into
    // one row, each touching only its own columns, so neither clobbers the
    // other and the order they arrive in does not matter.
    private static void applyYoutubeMeta(SQLiteDatabase db, String menteeId, JSONArray rows) {
        if (rows == null) return;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            Long remoteId = row == null ? null : num(row, "item_id");
            if (remoteId == null) continue;
            try {
                db.execSQL(MenteeNotesSql.UPSERT_YOUTUBE_META, new Object[]{
                        menteeId, remoteId, str(row, "channel_title"), str(row, "thumbnail"),
                });
            } catch (Exception e) {
                Log.e(TAG, "youtube meta upsert failed", e);
            }
        }
    }

    private static void applyDriveCopies(SQLiteDatabase db, String menteeId, JSONArray rows) {
        if (rows == null) return;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            Long remoteId = row == null ? null : num(row, "item_id");
            if (remoteId == null) continue;
            try {
                db.execSQL(MenteeNotesSql.UPSERT_DRIVE_COPY, new Object[]{
                        menteeId, remoteId, str(row, "drive_file_id"),
                });
            } catch (Exception e) {
                Log.e(TAG, "drive copy upsert failed", e);
            }
        }
    }

    /* ---------------------------------- */
    /* Images                              */
    /* ---------------------------------- */

    public static void applyImages(SQLiteDatabase db, String menteeId, JSONArray rows) {
        if (rows == null) return;
        db.beginTransaction();
        try {
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                Long imageId = row == null ? null : num(row, "id");
                if (imageId == null) continue;
                db.execSQL(MenteeNotesSql.UPSERT_IMAGE, new Object[]{
                        menteeId,
                        imageId,
                        num(row, "note_rowid"),
                        str(row, "image_data"),
                        str(row, "updated_at"),
                        str(row, "deleted_at"),
                });
            }
            db.setTransactionSuccessful();
        } catch (Exception e) {
            Log.e(TAG, "applyImages failed", e);
        } finally {
            db.endTransaction();
        }
    }

    public static Set<String> loadSeenFiles(SQLiteDatabase db, String menteeId) {
        Set<String> seen = new HashSet<>();
        Cursor c = null;
        try {
            c = db.rawQuery(MenteeNotesSql.SELECT_SEEN_FILES, new String[]{menteeId});
            while (c.moveToNext()) seen.add(c.getString(0));
        } catch (Exception e) {
            Log.e(TAG, "loadSeenFiles failed", e);
        } finally {
            if (c != null) c.close();
        }
        return seen;
    }

    public static void markFileSeen(SQLiteDatabase db, String menteeId, String name) {
        try {
            db.execSQL(MenteeNotesSql.INSERT_SEEN_FILE, new Object[]{menteeId, name});
        } catch (Exception e) {
            Log.e(TAG, "markFileSeen failed", e);
        }
    }

    /* ---------------------------------- */
    /* Field readers                       */
    /* ---------------------------------- */

    // JSONObject.NULL is not null, and optString turns it into the four
    // characters "null" — which would be written into the column as if it were
    // a title.
    private static String str(JSONObject row, String key) {
        if (row.isNull(key)) return null;
        return row.optString(key, null);
    }

    private static Long num(JSONObject row, String key) {
        if (row.isNull(key)) return null;
        try {
            return Long.valueOf(row.getString(key));
        } catch (Exception e) {
            return null;
        }
    }
}
