package com.audiotracker.drivesync;

import android.content.Context;
import android.util.Log;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Scanner;

/**
 * Low-level Google Drive REST v3 helper.
 * All methods are synchronous and meant to be called from a background thread.
 */
public class DriveApiHelper {

    private static final String TAG = "BackupDebug";
    private static final String DRIVE_BASE = "https://www.googleapis.com/drive/v3";
    private static final String UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

    // -----------------------------------------------------------------------
    // Auth
    // -----------------------------------------------------------------------

    public static String getAccessToken(Context context) throws Exception {
        GoogleSignInAccount account = GoogleSignIn.getLastSignedInAccount(context);
        if (account == null) throw new Exception("No signed-in Google account found");

        // The account's server auth code isn't a bearer token – we need the OAuth token.
        // GoogleAuthUtil gives us the actual access token for the Drive scope.
        String token = com.google.android.gms.auth.GoogleAuthUtil.getToken(
                context,
                account.getAccount(),
                "oauth2:https://www.googleapis.com/auth/drive.file"
        );

        if (token == null) throw new Exception("Failed to obtain Google access token");
        return token;
    }

    // -----------------------------------------------------------------------
    // Folder helpers
    // -----------------------------------------------------------------------

    /**
     * Returns the Drive folder ID for {@code folderName} under {@code parentId},
     * creating it if it doesn't exist.
     */
    public static String getOrCreateFolder(
            Context context,
            String folderName,
            String parentId) throws Exception {

        String token = getAccessToken(context);

        // --- search ---
        String q = "name='" + folderName + "'"
                + " and mimeType='application/vnd.google-apps.folder'"
                + " and trashed=false"
                + " and '" + parentId + "' in parents";

        String searchUrl = DRIVE_BASE + "/files?q=" + java.net.URLEncoder.encode(q, "UTF-8")
                + "&fields=files(id,name)";

        String searchResp = get(searchUrl, token);
        JSONArray files = new JSONObject(searchResp).optJSONArray("files");

        if (files != null && files.length() > 0) {
            String id = files.getJSONObject(0).getString("id");
            Log.d(TAG, "[DRIVE] Folder found: " + folderName + " (" + id + ")");
            return id;
        }

        // --- create ---
        Log.d(TAG, "[DRIVE] Creating folder: " + folderName);

        JSONObject body = new JSONObject();
        body.put("name", folderName);
        body.put("mimeType", "application/vnd.google-apps.folder");
        body.put("parents", new JSONArray().put(parentId));

        String createResp = post(DRIVE_BASE + "/files", token, body.toString(), "application/json");
        String newId = new JSONObject(createResp).getString("id");

        Log.d(TAG, "[DRIVE] Folder created: " + folderName + " (" + newId + ")");
        return newId;
    }

    // -----------------------------------------------------------------------
    // File helpers
    // -----------------------------------------------------------------------

    /**
     * Returns the Drive file metadata (id, name) for {@code fileName} inside
     * {@code folderId}, or {@code null} if not found.
     */
    public static JSONObject findFileByName(
            Context context,
            String fileName,
            String folderId) throws Exception {

        String token = getAccessToken(context);

        String q = "name='" + fileName + "'"
                + " and trashed=false"
                + " and '" + folderId + "' in parents";

        String url = DRIVE_BASE + "/files?q=" + java.net.URLEncoder.encode(q, "UTF-8")
                + "&fields=files(id,name)";

        String resp = get(url, token);
        JSONArray files = new JSONObject(resp).optJSONArray("files");

        if (files != null && files.length() > 0) {
            return files.getJSONObject(0);
        }
        return null;
    }

    /**
     * Multipart upload of a local file to Drive.
     * Returns the full file resource JSON from Drive.
     */
    public static JSONObject uploadFile(
            Context context,
            File localFile,
            String fileName,
            String folderId) throws Exception {

        String token = getAccessToken(context);

        String boundary = "backup_boundary_" + System.currentTimeMillis();

        JSONObject metadata = new JSONObject();
        metadata.put("name", fileName);
        metadata.put("parents", new JSONArray().put(folderId));

        byte[] metaPart = ("--" + boundary + "\r\n"
                + "Content-Type: application/json; charset=UTF-8\r\n\r\n"
                + metadata.toString() + "\r\n").getBytes(StandardCharsets.UTF_8);

        byte[] fileBytes = Files.readAllBytes(localFile.toPath());

        byte[] filePart = ("--" + boundary + "\r\n"
                + "Content-Type: application/json\r\n\r\n")
                .getBytes(StandardCharsets.UTF_8);

        byte[] closing = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);

        URL url = new URL(UPLOAD_BASE + "/files?uploadType=multipart");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setRequestProperty("Content-Type", "multipart/related; boundary=" + boundary);
        conn.setDoOutput(true);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(metaPart);
            os.write(filePart);
            os.write(fileBytes);
            os.write(closing);
        }

        int status = conn.getResponseCode();
        String resp = readResponse(conn);

        if (status >= 400) {
            Exception e = new Exception("Upload failed (" + fileName + "): HTTP " + status + " → " + resp);
            ((Exception) e).initCause(null);
            // Attach status for retry logic
            DriveException de = new DriveException("Upload failed", status);
            throw de;
        }

        Log.d(TAG, "[UPLOAD] Success: " + fileName);
        return new JSONObject(resp);
    }

    /**
     * Deletes a Drive file by its Drive ID.
     */
    public static void deleteFile(
            Context context,
            String driveId) throws Exception {

        String token = getAccessToken(context);

        URL url = new URL(DRIVE_BASE + "/files/" + driveId);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("DELETE");
        conn.setRequestProperty("Authorization", "Bearer " + token);

        int status = conn.getResponseCode();

        if (status == 404) {
            Log.d(TAG, "[DELETE] Already removed from Drive: " + driveId);
            return;
        }

        if (status >= 400) {
            throw new DriveException("Delete failed for driveId=" + driveId, status);
        }

        Log.d(TAG, "[DELETE] Drive file deleted: " + driveId);
    }

    // -----------------------------------------------------------------------
    // HTTP primitives
    // -----------------------------------------------------------------------

    private static String get(String urlStr, String token) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Authorization", "Bearer " + token);

        int status = conn.getResponseCode();
        String resp = readResponse(conn);

        if (status >= 400) throw new DriveException("GET failed: " + urlStr, status);
        return resp;
    }

    private static String post(
            String urlStr,
            String token,
            String body,
            String contentType) throws Exception {

        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setRequestProperty("Content-Type", contentType);
        conn.setDoOutput(true);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.getBytes(StandardCharsets.UTF_8));
        }

        int status = conn.getResponseCode();
        String resp = readResponse(conn);

        if (status >= 400) throw new DriveException("POST failed: " + urlStr, status);
        return resp;
    }

    private static String readResponse(HttpURLConnection conn) throws Exception {
        try (java.io.InputStream is =
                     conn.getResponseCode() >= 400
                             ? conn.getErrorStream()
                             : conn.getInputStream()) {

            if (is == null) return "";
            Scanner sc = new Scanner(is, "UTF-8");
            StringBuilder sb = new StringBuilder();
            while (sc.hasNextLine()) sb.append(sc.nextLine()).append('\n');
            return sb.toString().trim();
        }
    }

    // -----------------------------------------------------------------------
    // Typed exception (carries HTTP status for retry decisions)
    // -----------------------------------------------------------------------

    public static class DriveException extends Exception {
        public final int httpStatus;

        public DriveException(String message, int httpStatus) {
            super(message + " [HTTP " + httpStatus + "]");
            this.httpStatus = httpStatus;
        }
    }
}