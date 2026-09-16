package com.audiotracker.menteenotes;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.audiotracker.drivestream.DriveTokenProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * The network half: a mentee's backup folder on Drive, and our own server.
 *
 * Tokens come from DriveTokenProvider, not DriveApiHelper. The difference
 * matters: DriveApiHelper asks for drive.file, which only ever sees files this
 * app created, and everything read here was created by somebody else's phone.
 */
public final class MenteeNotesNet {

    private static final String TAG = "MenteeNotes";
    private static final String FILES_URL = "https://www.googleapis.com/drive/v3/files";

    // Written by the JS side at startup. The base url lives in JS config and
    // changes between local, staging and production, so hardcoding a second
    // copy here would be one more thing to remember on every switch.
    private static final String PREF_NAME = "backup";
    private static final String KEY_BASE_URL = "BACKEND_BASE_URL";

    private MenteeNotesNet() {}

    private static String baseUrl(Context context) {
        SharedPreferences prefs =
                context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_BASE_URL, null);
    }

    /* ---------------------------------- */
    /* Drive                               */
    /* ---------------------------------- */

    public static final class DriveFile {
        public final String id;
        public final String name;
        public final long size;

        DriveFile(String id, String name, long size) {
            this.id = id;
            this.name = name;
            this.size = size;
        }
    }

    /** Everything in a folder, following pagination. */
    public static List<DriveFile> listFolder(Context context, String folderId)
            throws Exception {

        List<DriveFile> out = new ArrayList<>();
        String token = DriveTokenProvider.get(context);
        String pageToken = null;

        do {
            String query = "'" + folderId + "' in parents and trashed=false";
            String url = FILES_URL
                    + "?q=" + URLEncoder.encode(query, "UTF-8")
                    + "&fields=nextPageToken,files(id,name,size,mimeType)"
                    + "&pageSize=1000"
                    + (pageToken == null
                            ? ""
                            : "&pageToken=" + URLEncoder.encode(pageToken, "UTF-8"));

            JSONObject page = new JSONObject(driveGet(context, url, token));
            JSONArray files = page.optJSONArray("files");
            for (int i = 0; files != null && i < files.length(); i++) {
                JSONObject f = files.optJSONObject(i);
                if (f == null) continue;
                out.add(new DriveFile(
                        f.optString("id", null),
                        f.optString("name", null),
                        parseLong(f.optString("size", "0"))));
            }
            pageToken = page.isNull("nextPageToken")
                    ? null
                    : page.optString("nextPageToken", null);
        } while (pageToken != null);

        return out;
    }

    public static JSONObject downloadJson(Context context, String fileId)
            throws Exception {
        String token = DriveTokenProvider.get(context);
        String body = driveGet(context, FILES_URL + "/" + fileId + "?alt=media", token);
        return new JSONObject(body);
    }

    /**
     * One GET, retried once against a fresh token.
     *
     * Play Services caches tokens and will keep handing back a dead one for
     * the rest of its lifetime, so a 401 has to be answered by throwing that
     * token away rather than by trying again with it.
     */
    private static String driveGet(Context context, String url, String token)
            throws Exception {
        try {
            return httpGet(url, token);
        } catch (HttpException e) {
            if (e.status != 401) throw e;
            DriveTokenProvider.invalidate(context, token);
            return httpGet(url, DriveTokenProvider.get(context));
        }
    }

    /* ---------------------------------- */
    /* Our server                          */
    /* ---------------------------------- */

    /**
     * The user's mentees, each carrying the folder their notes can be read
     * from — published by their own device once it granted access. Absent or
     * empty means they have not granted yet, which is a state to respect
     * rather than a folder to go looking for.
     */
    public static JSONArray fetchMentees(Context context, String userId)
            throws Exception {
        String base = baseUrl(context);
        if (base == null) throw new Exception("No backend url recorded yet");

        String body = httpGet(base + "/mentorships/" + userId + "/", null);
        return new JSONObject(body).optJSONArray("mentees");
    }

    public static JSONArray fetchMentors(Context context, String userId)
            throws Exception {
        String base = baseUrl(context);
        if (base == null) throw new Exception("No backend url recorded yet");

        String body = httpGet(base + "/mentorships/" + userId + "/", null);
        return new JSONObject(body).optJSONArray("mentors");
    }

    /** Tells the server this mentor can now read this user's backup folder. */
    public static void publishNotesFolder(
            Context context, String menteeId, String mentorId, String folderId)
            throws Exception {

        String base = baseUrl(context);
        if (base == null) throw new Exception("No backend url recorded yet");

        JSONObject body = new JSONObject();
        body.put("mentor_id", mentorId);
        body.put("mentee_id", menteeId);
        body.put("folder_id", folderId == null ? "" : folderId);

        httpPost(base + "/mentorships/notes-folder/", null, body.toString());
    }

    /**
     * Tells the server this user has just put new backup files on Drive, so
     * their mentors can be woken to come and read them.
     *
     * Swallows its own failures. The upload has already happened and is not
     * undone by this; a mentor who is not told simply finds it on their next
     * ordinary pass, which is exactly the behaviour there was before this
     * existed.
     */
    public static void notifyNotesUpdated(Context context, String userId) {
        try {
            String base = baseUrl(context);
            if (base == null || userId == null) return;

            JSONObject body = new JSONObject();
            body.put("user_id", userId);
            httpPost(base + "/mentorships/notes-updated/", null, body.toString());
            Log.d(TAG, "Told the server there are new notes to read");
        } catch (Exception e) {
            Log.w(TAG, "Could not announce new notes: " + e.getMessage());
        }
    }

    /* ---------------------------------- */
    /* Plumbing                            */
    /* ---------------------------------- */

    public static final class HttpException extends Exception {
        public final int status;

        public HttpException(String message, int status) {
            super(message + " (HTTP " + status + ")");
            this.status = status;
        }
    }

    static String httpGet(String urlStr, String token) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("GET");
        if (token != null) conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);
        return finish(conn, urlStr);
    }

    static String httpPost(String urlStr, String token, String body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("POST");
        if (token != null) conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setDoOutput(true);
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.getBytes(StandardCharsets.UTF_8));
        }
        return finish(conn, urlStr);
    }

    static String httpDelete(String urlStr, String token) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("DELETE");
        if (token != null) conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);
        return finish(conn, urlStr);
    }

    private static String finish(HttpURLConnection conn, String urlStr) throws Exception {
        int status = conn.getResponseCode();
        String body = read(conn, status);
        if (status >= 400) {
            Log.w(TAG, "HTTP " + status + " from " + urlStr + ": " + body);
            throw new HttpException("Request failed", status);
        }
        return body;
    }

    // Buffered rather than line-by-line: a level file runs to megabytes, and
    // Scanner.nextLine over that is both slow and a needless rebuild of text
    // that is about to be parsed as one blob anyway.
    private static String read(HttpURLConnection conn, int status) throws Exception {
        InputStream is = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
        if (is == null) return "";
        StringBuilder sb = new StringBuilder();
        char[] buf = new char[8192];
        try (BufferedReader r =
                     new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            int n;
            while ((n = r.read(buf)) != -1) sb.append(buf, 0, n);
        }
        return sb.toString();
    }

    private static long parseLong(String s) {
        try {
            return Long.parseLong(s);
        } catch (Exception e) {
            return 0L;
        }
    }
}
