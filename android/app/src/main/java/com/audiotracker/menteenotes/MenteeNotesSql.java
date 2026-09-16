package com.audiotracker.menteenotes;

/**
 * Every statement the mentee-notes sync writes, as constants.
 *
 * Apart from being the whole of the schema contract in one place, this is what
 * makes the SQL testable off-device: the requery wrapper needs Android, but
 * these strings can be run against any SQLite and checked.
 *
 * Including the schema itself. These tables have exactly one writer — this
 * package — so the CREATEs belong beside the INSERTs rather than in JS, where
 * they were three thousand miles from anything that used them and had to be
 * kept in step by hand.
 *
 * It also means a user who never mentors anybody never gets them. The reader
 * in database/menteeNotesDB.js copes with their absence, which is the normal
 * state for most accounts.
 */
public final class MenteeNotesSql {

    private MenteeNotesSql() {}

    public static final String[] OWNED_TABLES = {
            "mentee_notes",
            "mentee_items",
            "mentee_item_meta",
            "mentee_note_images",
            "mentee_sync_files",
            "mentee_note_sync",
    };

    /**
     * The schema, created on the first sync rather than at login.
     *
     * Six tables and an index cost about 60KB, which is nothing for a mentor
     * and pure waste for everybody else — and most accounts are everybody
     * else. Run here, they appear when the first mentee's notes do.
     *
     * Kept apart from this user's own rows in every way: someone else's
     * writing, arriving read-only, dropped wholesale when a mentorship ends.
     */
    public static final String[] CREATE_SCHEMA = {
            // A plain table, emphatically not fts5. `notes` IS this user's
            // search index — a mentee's notes landing in it would answer
            // their searches.
            "CREATE TABLE IF NOT EXISTS mentee_notes ("
                    + "  mentee_id    TEXT NOT NULL,"
                    + "  note_rowid   INTEGER NOT NULL,"
                    + "  source_id    TEXT,"
                    + "  source_type  TEXT,"
                    + "  title        TEXT,"
                    + "  content      TEXT,"
                    + "  text_content TEXT,"
                    + "  created_at   TEXT,"
                    + "  updated_at   TEXT,"
                    + "  deleted_at   TEXT,"
                    + "  PRIMARY KEY (mentee_id, note_rowid)"
                    + ");",

            "CREATE INDEX IF NOT EXISTS idx_mentee_notes_live "
                    + "ON mentee_notes(mentee_id, deleted_at);",

            // `covered` is the JSON interval list from Coverage — the
            // stretches of that mentee's history whose notes are already in
            // the table above. folder_id rides along so a mentee who
            // reinstalls, and so backs up to a different Drive folder,
            // invalidates coverage that describes a history which no longer
            // exists.
            "CREATE TABLE IF NOT EXISTS mentee_note_sync ("
                    + "  mentee_id        TEXT PRIMARY KEY,"
                    + "  folder_id        TEXT,"
                    + "  images_folder_id TEXT,"
                    + "  covered          TEXT NOT NULL DEFAULT '[]',"
                    + "  last_sync_at     INTEGER"
                    + ");",

            // Names, for the image stream only. It is never compacted, so
            // every file in it is new data and there is nothing a coverage
            // rule could skip.
            "CREATE TABLE IF NOT EXISTS mentee_sync_files ("
                    + "  mentee_id TEXT NOT NULL,"
                    + "  name      TEXT NOT NULL,"
                    + "  PRIMARY KEY (mentee_id, name)"
                    + ");",

            // The media a mentee's notes were taken against. A note carries
            // only source_id and source_type, and "the argument at 14:00 does
            // not hold" says nothing without the name of the lecture — and
            // reads much better with a way to go and hear 14:00.
            //
            // Enough columns to rebuild a note-media descriptor (see
            // notes/share/noteMedia), which is the shape this app already uses
            // to make someone else's note reach the same recording.
            //
            // Every item is kept rather than only the ones some note points
            // at: a note written today can be about a file added a year ago,
            // whose row lives in a window that was read and finished with long
            // before that note existed.
            "CREATE TABLE IF NOT EXISTS mentee_items ("
                    + "  mentee_id  TEXT NOT NULL,"
                    + "  source_id  TEXT NOT NULL,"
                    + "  type       TEXT NOT NULL,"
                    + "  remote_id  INTEGER,"
                    + "  title      TEXT,"
                    + "  mimeType   TEXT,"
                    + "  duration   INTEGER,"
                    + "  file_path  TEXT,"
                    + "  updated_at TEXT,"
                    + "  PRIMARY KEY (mentee_id, source_id, type)"
                    + ");",

            // youtube_meta and shared_drive_copies from the same backup, keyed
            // the way they are keyed there — by the mentee's own items.id,
            // which is why mentee_items carries remote_id. Their own table
            // because they arrive in whatever window they were last touched
            // in, which need not be the one that carried the item.
            "CREATE TABLE IF NOT EXISTS mentee_item_meta ("
                    + "  mentee_id     TEXT NOT NULL,"
                    + "  remote_id     INTEGER NOT NULL,"
                    + "  channel_title TEXT,"
                    + "  thumbnail     TEXT,"
                    + "  drive_file_id TEXT,"
                    + "  PRIMARY KEY (mentee_id, remote_id)"
                    + ");",

            "CREATE TABLE IF NOT EXISTS mentee_note_images ("
                    + "  mentee_id  TEXT NOT NULL,"
                    + "  image_id   INTEGER NOT NULL,"
                    + "  note_rowid INTEGER,"
                    + "  image_data TEXT,"
                    + "  updated_at TEXT,"
                    + "  deleted_at TEXT,"
                    + "  PRIMARY KEY (mentee_id, image_id)"
                    + ");",
    };

    public static final String SELECT_SYNC_STATE =
            "SELECT folder_id, images_folder_id, covered, last_sync_at "
                    + "FROM mentee_note_sync WHERE mentee_id = ?;";

    public static final String UPSERT_SYNC_STATE =
            "INSERT INTO mentee_note_sync "
                    + "(mentee_id, folder_id, images_folder_id, covered, last_sync_at) "
                    + "VALUES (?, ?, ?, ?, ?) "
                    + "ON CONFLICT(mentee_id) DO UPDATE SET "
                    + "  folder_id        = excluded.folder_id, "
                    + "  images_folder_id = excluded.images_folder_id, "
                    + "  covered          = excluded.covered, "
                    + "  last_sync_at     = excluded.last_sync_at;";

    // Last-writer-wins on updated_at, which is what makes an out-of-order
    // arrival harmless: a mentee who was offline uploads a backlog three files
    // at a time and a failed upload is left for the next run, so an older
    // window can land after a newer one has already been applied.
    //
    // The IS NULL arm matters because a row written with no updated_at would
    // otherwise compare NULL on every later pass and never be updated again.
    public static final String UPSERT_NOTE =
            "INSERT INTO mentee_notes "
                    + "(mentee_id, note_rowid, source_id, source_type, title, "
                    + " content, text_content, created_at, updated_at, deleted_at) "
                    + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                    + "ON CONFLICT(mentee_id, note_rowid) DO UPDATE SET "
                    + "  source_id    = excluded.source_id, "
                    + "  source_type  = excluded.source_type, "
                    + "  title        = excluded.title, "
                    + "  content      = excluded.content, "
                    + "  text_content = excluded.text_content, "
                    + "  created_at   = excluded.created_at, "
                    + "  updated_at   = excluded.updated_at, "
                    + "  deleted_at   = excluded.deleted_at "
                    + "WHERE mentee_notes.updated_at IS NULL "
                    + "   OR excluded.updated_at > mentee_notes.updated_at;";

    public static final String UPSERT_ITEM =
            "INSERT INTO mentee_items "
                    + "(mentee_id, source_id, type, remote_id, title, "
                    + " mimeType, duration, file_path, updated_at) "
                    + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                    + "ON CONFLICT(mentee_id, source_id, type) DO UPDATE SET "
                    + "  remote_id  = excluded.remote_id, "
                    + "  title      = excluded.title, "
                    + "  mimeType   = excluded.mimeType, "
                    + "  duration   = excluded.duration, "
                    + "  file_path  = excluded.file_path, "
                    + "  updated_at = excluded.updated_at "
                    + "WHERE mentee_items.updated_at IS NULL "
                    + "   OR excluded.updated_at > mentee_items.updated_at;";

    public static final String UPSERT_YOUTUBE_META =
            "INSERT INTO mentee_item_meta "
                    + "(mentee_id, remote_id, channel_title, thumbnail) "
                    + "VALUES (?, ?, ?, ?) "
                    + "ON CONFLICT(mentee_id, remote_id) DO UPDATE SET "
                    + "  channel_title = excluded.channel_title, "
                    + "  thumbnail     = excluded.thumbnail;";

    public static final String UPSERT_DRIVE_COPY =
            "INSERT INTO mentee_item_meta (mentee_id, remote_id, drive_file_id) "
                    + "VALUES (?, ?, ?) "
                    + "ON CONFLICT(mentee_id, remote_id) DO UPDATE SET "
                    + "  drive_file_id = excluded.drive_file_id;";

    public static final String UPSERT_IMAGE =
            "INSERT INTO mentee_note_images "
                    + "(mentee_id, image_id, note_rowid, image_data, updated_at, deleted_at) "
                    + "VALUES (?, ?, ?, ?, ?, ?) "
                    + "ON CONFLICT(mentee_id, image_id) DO UPDATE SET "
                    + "  note_rowid = excluded.note_rowid, "
                    + "  image_data = excluded.image_data, "
                    + "  updated_at = excluded.updated_at, "
                    + "  deleted_at = excluded.deleted_at "
                    + "WHERE mentee_note_images.updated_at IS NULL "
                    + "   OR excluded.updated_at > mentee_note_images.updated_at;";

    public static final String SELECT_SEEN_FILES =
            "SELECT name FROM mentee_sync_files WHERE mentee_id = ?;";

    public static final String INSERT_SEEN_FILE =
            "INSERT INTO mentee_sync_files (mentee_id, name) VALUES (?, ?) "
                    + "ON CONFLICT(mentee_id, name) DO NOTHING;";

    public static String deleteFor(String table) {
        return "DELETE FROM " + table + " WHERE mentee_id = ?;";
    }
}
