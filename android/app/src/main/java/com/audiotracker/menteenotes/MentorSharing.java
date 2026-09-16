package com.audiotracker.menteenotes;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.audiotracker.backup.BackupUtils;
import com.audiotracker.drivestream.DriveTokenProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.HashSet;
import java.util.Set;

/**
 * The mentee half: letting a mentor read the backup folder this user's notes
 * already live in.
 *
 * Native so it can happen on a phone nobody opens. That is the case that
 * matters — a mentorship is approved, the mentee never launches the app, and
 * until their device grants access nothing downstream can happen at all. Here
 * it runs under WorkManager, which waits for a network and retries.
 *
 * Only ever `reader`, and only ever to a named account — never a link anyone
 * could hold.
 *
 * Two questions this has to answer, and both are asked of whoever actually
 * knows rather than of local bookkeeping:
 *
 *   "does this mentor already have access?"  — Drive's own permission list
 *   "has the folder id been published?"      — the server, on the mentor row
 *
 * Which is why there is nothing to migrate from the JS implementation that
 * did keep its own records. The one thing kept locally is which permissions
 * *we* created, because Drive cannot tell us that, and revoking one the user
 * set up themselves would be worse than never revoking at all.
 */
public final class MentorSharing {

    private static final String TAG = "BackupShare";
    private static final String FILES_URL = "https://www.googleapis.com/drive/v3/files";
    private static final String FOLDER_MIME = "application/vnd.google-apps.folder";
    private static final String BACKUP_FOLDER = "AppBackups";

    private static final String PREF_NAME = "backup";
    private static final String KEY_GRANTED_PREFIX = "sharedWith_";

    private MentorSharing() {}

    public static void reconcile(Context context) {
        String userId = BackupUtils.getUserId(context);
        if (userId == null) return;

        JSONArray mentors;
        try {
            mentors = MenteeNotesNet.fetchMentors(context, userId);
        } catch (Exception e) {
            Log.w(TAG, "Could not fetch mentors: " + e.getMessage());
            return;
        }
        if (mentors == null) return;

        Set<String> ourGrants = loadGranted(context, userId);

        // The steady state is "nothing to do", and it is reachable without
        // touching Drive at all: a mentor we have already granted and whose
        // row already carries a folder id needs neither. Without this the two
        // Drive calls below ran on every push and every refresh, for years,
        // to discover each time that the answer was still no.
        if (nothingToDo(mentors, ourGrants)) return;

        try {
            String folderId = findBackupFolder(context);
            if (folderId == null) {
                // Backup runs on every backgrounding, and the restore check at
                // sign-in creates this folder — so its absence means a brand
                // new account whose first sync has not finished. Nothing is
                // saved, so the next pass tries again.
                Log.d(TAG, "No backup folder yet — will retry");
                return;
            }

            Set<String> alreadyShared = readerEmails(context, folderId);
            Set<String> wanted = new HashSet<>();

            for (int i = 0; i < mentors.length(); i++) {
                JSONObject mentor = mentors.optJSONObject(i);
                if (mentor == null) continue;

                String mentorId = mentor.optString("id", null);
                String email = mentor.optString("email", null);
                if (mentorId == null || email == null || email.isEmpty()) continue;

                String lower = email.toLowerCase();
                wanted.add(lower);

                if (!alreadyShared.contains(lower)) {
                    grantReader(context, folderId, email);
                    ourGrants.add(lower);
                    Log.d(TAG, "Shared with " + email);
                }

                // Published if and only if the server already holds this exact
                // folder for this mentorship.
                if (!folderId.equals(mentor.optString("notes_folder_id", ""))) {
                    MenteeNotesNet.publishNotesFolder(context, userId, mentorId, folderId);
                    Log.d(TAG, "Published folder to " + email);
                }
            }

            // Only permissions we created, and only for people who are no
            // longer mentors.
            for (String email : new HashSet<>(ourGrants)) {
                if (wanted.contains(email)) continue;
                try {
                    revokeReader(context, folderId, email);
                    ourGrants.remove(email);
                    Log.d(TAG, "Revoked " + email);
                } catch (Exception e) {
                    Log.w(TAG, "Revoke failed for " + email + ": " + e.getMessage());
                }
            }

            saveGranted(context, userId, ourGrants);
        } catch (Exception e) {
            Log.e(TAG, "reconcile failed", e);
        }
    }

    /**
     * Whether every mentor is already granted and already told.
     *
     * Decided from the mentor list we had to fetch anyway plus what this
     * device remembers granting — no Drive calls. A stale local record is
     * safe: an unknown mentor means toGrant is non-empty, so the full path
     * runs and Drive's own permission list settles it.
     */
    private static boolean nothingToDo(JSONArray mentors, Set<String> ourGrants) {
        Set<String> wanted = new HashSet<>();

        for (int i = 0; i < mentors.length(); i++) {
            JSONObject mentor = mentors.optJSONObject(i);
            if (mentor == null) continue;
            String email = mentor.optString("email", null);
            if (email == null || email.isEmpty()) continue;

            String lower = email.toLowerCase();
            wanted.add(lower);

            if (!ourGrants.contains(lower)) return false;
            // Published is the server's answer, not ours — an empty folder id
            // means it never arrived, whatever this device thinks it sent.
            if (mentor.optString("notes_folder_id", "").isEmpty()) return false;
        }

        // Anything we granted to somebody who is no longer a mentor has to be
        // taken back, which needs the full path.
        for (String email : ourGrants) {
            if (!wanted.contains(email)) return false;
        }

        return true;
    }

    /* ---------------------------------- */
    /* Drive                               */
    /* ---------------------------------- */

    private static String findBackupFolder(Context context) throws Exception {
        String token = DriveTokenProvider.get(context);
        String query = "name='" + BACKUP_FOLDER + "' and mimeType='" + FOLDER_MIME
                + "' and trashed=false and 'root' in parents";
        String url = FILES_URL + "?q=" + URLEncoder.encode(query, "UTF-8")
                + "&fields=files(id)";

        JSONArray files = new JSONObject(MenteeNotesNet.httpGet(url, token))
                .optJSONArray("files");
        if (files == null || files.length() == 0) return null;
        return files.optJSONObject(0).optString("id", null);
    }

    /** Who can already read the folder, lower-cased. */
    private static Set<String> readerEmails(Context context, String folderId)
            throws Exception {
        Set<String> out = new HashSet<>();
        String token = DriveTokenProvider.get(context);
        String url = FILES_URL + "/" + folderId
                + "/permissions?fields=permissions(id,type,role,emailAddress)";

        JSONArray perms = new JSONObject(MenteeNotesNet.httpGet(url, token))
                .optJSONArray("permissions");
        for (int i = 0; perms != null && i < perms.length(); i++) {
            JSONObject p = perms.optJSONObject(i);
            if (p == null) continue;
            String email = p.optString("emailAddress", null);
            if (email != null && !email.isEmpty()) out.add(email.toLowerCase());
        }
        return out;
    }

    private static void grantReader(Context context, String folderId, String email)
            throws Exception {
        String token = DriveTokenProvider.get(context);
        JSONObject body = new JSONObject();
        body.put("role", "reader");
        body.put("type", "user");
        body.put("emailAddress", email);

        // sendNotificationEmail=false: the user did not ask Google to email
        // anybody, and the mentor learns about it inside the app.
        MenteeNotesNet.httpPost(
                FILES_URL + "/" + folderId
                        + "/permissions?sendNotificationEmail=false&fields=id",
                token,
                body.toString());
    }

    private static void revokeReader(Context context, String folderId, String email)
            throws Exception {
        String token = DriveTokenProvider.get(context);
        String url = FILES_URL + "/" + folderId
                + "/permissions?fields=permissions(id,emailAddress)";

        JSONArray perms = new JSONObject(MenteeNotesNet.httpGet(url, token))
                .optJSONArray("permissions");
        for (int i = 0; perms != null && i < perms.length(); i++) {
            JSONObject p = perms.optJSONObject(i);
            if (p == null) continue;
            if (!email.equalsIgnoreCase(p.optString("emailAddress", ""))) continue;

            MenteeNotesNet.httpDelete(
                    FILES_URL + "/" + folderId + "/permissions/" + p.optString("id"),
                    token);
            return;
        }
    }

    /* ---------------------------------- */
    /* What we granted                     */
    /* ---------------------------------- */

    private static Set<String> loadGranted(Context context, String userId) {
        SharedPreferences prefs =
                context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        Set<String> stored = prefs.getStringSet(KEY_GRANTED_PREFIX + userId, null);
        // Copied: the set returned by getStringSet must not be modified.
        return stored == null ? new HashSet<>() : new HashSet<>(stored);
    }

    private static void saveGranted(Context context, String userId, Set<String> granted) {
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                .edit()
                .putStringSet(KEY_GRANTED_PREFIX + userId, granted)
                .apply();
    }
}
