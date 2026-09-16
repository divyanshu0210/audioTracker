package com.audiotracker.menteenotes;

import android.content.Context;
import android.util.Log;

import com.audiotracker.backup.BackupUtils;

import io.requery.android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

/**
 * Pulls every mentee's notes out of the backup they keep on their own Drive.
 *
 * Notes never pass through our server — that is the whole reason for reading
 * them from here. What does pass through is the id of the folder, published
 * by the mentee's device once it granted access, which is what lets this stop
 * guessing whether there is anything to read.
 *
 * Runs natively so it can happen on a phone nobody has opened: WorkManager
 * holds it until there is a network, retries it, and survives both process
 * death and reboot.
 */
public final class MenteeNotesSync {

    private static final String TAG = "MenteeNotes";

    private MenteeNotesSync() {}

    /** Every mentee. For the periodic backstop and for app startup. */
    public static void syncAll(Context context) {
        syncAll(context, null);
    }

    /**
     * `onlyMenteeId` limits the pass to one mentee. Never throws — see runOne.
     *
     * This is what makes a mentor with a hundred mentees possible. Every pass
     * costs a Drive listing per mentee whether or not anything changed, and
     * every push is about exactly one of them — so answering "Priya uploaded"
     * by listing all hundred folders turns one person's note into two hundred
     * API calls, several times an hour. The pushes have always carried the id;
     * this uses it.
     *
     * Null still means everyone, which is right for the six-hourly backstop:
     * that one is looking for whatever the pushes missed.
     *
     * No throttle. There was one, guarding against triggers that repeated
     * for their own reasons — a screen ticking, a focus effect firing. Every
     * trigger left is news: a device saying it has just uploaded, or a mentor
     * saying which mentee they want. Declining to act on news because it
     * arrived soon after the last news is how an upload goes unnoticed for
     * an hour, which is exactly what it did.
     *
     * What stops a burst doing the same work twice is the enqueue policy,
     * one level up, where it belongs.
     */
    public static void syncAll(Context context, String onlyMenteeId) {
        String userId = BackupUtils.getUserId(context);
        if (userId == null) {
            Log.d(TAG, "No user — nothing to sync");
            return;
        }

        JSONArray mentees;
        try {
            mentees = MenteeNotesNet.fetchMentees(context, userId);
        } catch (Exception e) {
            Log.w(TAG, "Could not fetch mentees: " + e.getMessage());
            return;
        }
        if (mentees == null || mentees.length() == 0) return;

        SQLiteDatabase db = null;
        try {
            db = BackupUtils.openDatabase(context, userId);
            // Here and not at login: a user with no mentees never reaches
            // this line, and so never carries the tables.
            MenteeNotesDb.ensureTables(db);

            for (int i = 0; i < mentees.length(); i++) {
                JSONObject mentee = mentees.optJSONObject(i);
                if (mentee == null) continue;

                String menteeId = mentee.optString("id", null);
                String folderId = mentee.optString("notes_folder_id", "");

                if (menteeId == null || menteeId.isEmpty()) continue;
                if (onlyMenteeId != null && !onlyMenteeId.equals(menteeId)) continue;
                // Their device has not granted access yet. Nothing to read,
                // and nothing to ask Drive about — it will say so when it has.
                if (folderId == null || folderId.isEmpty()) continue;

                // Images only when the text changed. Pictures live in files
                // that are only ever added to, so if no note arrived there is
                // nothing for them to belong to — and listing that folder
                // anyway was doubling the cost of every idle pass.
                boolean changed = runOne(context, db, menteeId, folderId);
                if (changed) syncImagesFor(context, db, menteeId);
            }
        } catch (Exception e) {
            Log.e(TAG, "syncAll failed", e);
        } finally {
            if (db != null) db.close();
        }
    }

    /**
     * One mentee. Swallows its own failures: one unreachable mentee is no
     * reason to abandon the rest, and nothing is recorded as covered unless
     * its rows actually landed, so a failure simply retries next pass.
     */
    /** Returns whether anything was actually downloaded. */
    private static boolean runOne(
            Context context, SQLiteDatabase db, String menteeId, String folderId) {

        try {
            MenteeNotesDb.SyncState state = MenteeNotesDb.loadSyncState(db, menteeId);

            // A reinstall backs up to a new folder, and coverage recorded
            // against the old one describes a history this device can no
            // longer reach.
            if (state.folderId != null && !state.folderId.equals(folderId)) {
                Log.d(TAG, "Folder changed for " + menteeId + " — starting over");
                MenteeNotesDb.clearMentee(db, menteeId);
                state = new MenteeNotesDb.SyncState();
            }
            state.folderId = folderId;

            List<MenteeNotesNet.DriveFile> files =
                    MenteeNotesNet.listFolder(context, folderId);

            String imagesFolderId = findImagesFolder(files);
            if (imagesFolderId != null) state.imagesFolderId = imagesFolderId;

            List<Pending> todo = toFetch(files, state.covered);
            int notes = 0;

            for (Pending p : todo) {
                try {
                    JSONObject json = MenteeNotesNet.downloadJson(context, p.file.id);
                    notes += MenteeNotesDb.applyLevelFile(db, menteeId, json);

                    // Coverage is added only once the rows are in. A crash
                    // between the download and the write leaves the range
                    // uncovered, so the next pass fetches it again rather
                    // than skipping it forever.
                    state.covered = Coverage.addInterval(
                            state.covered, p.range.start, p.range.end);
                    state.lastSyncAt = System.currentTimeMillis();
                    // Persisted per file, not per run: a first sync can be
                    // tens of megabytes, and one killed halfway should resume
                    // rather than start over.
                    MenteeNotesDb.saveSyncState(db, menteeId, state);
                } catch (Exception e) {
                    // Deliberately not fatal. The range stays uncovered, so
                    // this file is retried — which is also how a mentee's
                    // half-finished upload backlog gets picked up.
                    Log.w(TAG, p.file.name + " failed: " + e.getMessage());
                }
            }

            state.lastSyncAt = System.currentTimeMillis();
            MenteeNotesDb.saveSyncState(db, menteeId, state);

            if (!todo.isEmpty()) {
                Log.d(TAG, menteeId + ": " + todo.size() + " files, " + notes + " notes");
            }
            return !todo.isEmpty();
        } catch (Exception e) {
            Log.e(TAG, "Sync failed for " + menteeId, e);
            return false;
        }
    }

    /* ---------------------------------- */
    /* Choosing what to download           */
    /* ---------------------------------- */

    private static final class Pending {
        final MenteeNotesNet.DriveFile file;
        final Coverage.Range range;

        Pending(MenteeNotesNet.DriveFile file, Coverage.Range range) {
            this.file = file;
            this.range = range;
        }
    }

    /**
     * The files worth downloading, oldest first.
     *
     * Oldest first so a pass interrupted halfway leaves one contiguous
     * interval rather than islands, which keeps the containment check — and
     * anything reading this state — simple.
     */
    private static List<Pending> toFetch(
            List<MenteeNotesNet.DriveFile> files, List<Coverage.Range> covered) {

        List<Pending> out = new ArrayList<>();
        for (MenteeNotesNet.DriveFile f : files) {
            Coverage.Range range = Coverage.parseLevelFileName(f.name);
            if (range == null) continue;
            if (Coverage.isCovered(covered, range.start, range.end)) continue;
            out.add(new Pending(f, range));
        }
        Collections.sort(out, (a, b) -> Long.compare(a.range.start, b.range.start));
        return out;
    }

    private static String findImagesFolder(List<MenteeNotesNet.DriveFile> files) {
        for (MenteeNotesNet.DriveFile f : files) {
            if ("images".equals(f.name)) return f.id;
        }
        return null;
    }

    /* ---------------------------------- */
    /* Images                              */
    /* ---------------------------------- */

    /**
     * The pictures inside those notes.
     *
     * Tracked by filename rather than by time: the image stream is never
     * compacted, so every file in it is new data and there is nothing a
     * coverage rule could skip. Separate from the text because base64 is most
     * of the weight and a mentor who never opens a note with a picture should
     * never pay for one.
     */
    /**
     * The pictures inside a mentee's notes, on a database syncAll already has
     * open.
     *
     * Only called when the text changed. Pictures live in files that are only
     * ever added to, so with no new note there is nothing for them to belong
     * to — and listing that folder anyway doubled the cost of every idle pass.
     */
    private static void syncImagesFor(
            Context context, SQLiteDatabase db, String menteeId) {

        try {
            MenteeNotesDb.SyncState state = MenteeNotesDb.loadSyncState(db, menteeId);
            if (state.imagesFolderId == null) return;

            Set<String> seen = MenteeNotesDb.loadSeenFiles(db, menteeId);
            List<MenteeNotesNet.DriveFile> files =
                    MenteeNotesNet.listFolder(context, state.imagesFolderId);

            for (MenteeNotesNet.DriveFile f : files) {
                // Tracked by name, not by time: this stream is never
                // compacted, so every file in it is new data and there is
                // nothing a coverage rule could skip.
                if (f.name == null || !f.name.startsWith("img_")) continue;
                if (seen.contains(f.name)) continue;
                try {
                    JSONObject json = MenteeNotesNet.downloadJson(context, f.id);
                    MenteeNotesDb.applyImages(db, menteeId, json.optJSONArray("images"));
                    MenteeNotesDb.markFileSeen(db, menteeId, f.name);
                } catch (Exception e) {
                    Log.w(TAG, f.name + " failed: " + e.getMessage());
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "syncImagesFor failed for " + menteeId, e);
        }
    }
}
