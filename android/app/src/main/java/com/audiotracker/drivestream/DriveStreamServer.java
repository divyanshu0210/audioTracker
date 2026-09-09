package com.audiotracker.drivestream;

import android.content.Context;
import android.util.Base64;
import android.util.Log;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * A loopback HTTP proxy that lets the player stream Google Drive files.
 *
 * Drive's media endpoint needs an `Authorization: Bearer` header, and
 * react-native-vlc-media-player has no way to send one - its JS layer forwards
 * only the uri plus libVLC options, and libVLC's HTTP module has no
 * arbitrary-header setting. So the player is handed a plain
 * http://127.0.0.1:<port>/<secret>/drive/<fileId> url instead, and this server
 * attaches the header on the way out.
 *
 * It is a pass-through, not a downloader: the client's Range header goes
 * upstream verbatim and the upstream Content-Range/Content-Length come back
 * unchanged, which is what keeps seeking working. Nothing is cached - a file
 * still has to be downloaded to be available offline.
 *
 * Bound to 127.0.0.1, so it is unreachable from the network. It is still
 * reachable by other apps on the same device, hence the random per-start
 * secret in the path: without it any installed app could read the user's Drive
 * through this port.
 */
public final class DriveStreamServer {

    private static final String TAG = "DriveStream";
    private static final String DRIVE_MEDIA = "https://www.googleapis.com/drive/v3/files/";
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int UPSTREAM_READ_TIMEOUT_MS = 30000;
    private static final int CLIENT_READ_TIMEOUT_MS = 30000;
    private static final int MAX_REDIRECTS = 5;
    private static final int COPY_BUFFER = 64 * 1024;
    private static final int MAX_HEADER_LINE = 8192;

    // Drive file ids are url-safe base64-ish. Anything else is not an id we
    // handed out, and refusing it early keeps junk out of an outgoing request.
    private static final Pattern FILE_ID = Pattern.compile("[A-Za-z0-9_-]{5,128}");

    private static DriveStreamServer instance;

    private final Context appContext;
    private final ExecutorService workers = Executors.newCachedThreadPool();

    private ServerSocket serverSocket;
    private Thread acceptThread;
    private volatile String secret;
    private String baseUrl;

    private DriveStreamServer(Context context) {
        this.appContext = context.getApplicationContext();
    }

    public static synchronized DriveStreamServer getInstance(Context context) {
        if (instance == null) instance = new DriveStreamServer(context);
        return instance;
    }

    /**
     * Starts the server if it isn't already up and returns the base url the
     * stream paths hang off. Idempotent - repeated calls return the same url.
     */
    public synchronized String start() throws IOException {
        if (serverSocket != null && !serverSocket.isClosed()) return baseUrl;

        byte[] raw = new byte[24];
        new SecureRandom().nextBytes(raw);
        secret = Base64.encodeToString(
                raw, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);

        // Port 0 = let the OS pick a free one. A fixed port would collide with
        // whatever else is listening, and would stay the same across launches,
        // which is half of what the per-start secret is there to avoid.
        serverSocket = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
        baseUrl = "http://127.0.0.1:" + serverSocket.getLocalPort() + "/" + secret;

        acceptThread = new Thread(this::acceptLoop, "DriveStreamAccept");
        acceptThread.setDaemon(true);
        acceptThread.start();

        Log.d(TAG, "listening on port " + serverSocket.getLocalPort());
        return baseUrl;
    }

    public synchronized void stop() {
        ServerSocket socket = serverSocket;
        serverSocket = null;
        baseUrl = null;
        secret = null;
        acceptThread = null;
        if (socket != null) {
            try {
                socket.close();
            } catch (IOException ignored) {
            }
        }
    }

    public synchronized boolean isRunning() {
        return serverSocket != null && !serverSocket.isClosed();
    }

    private void acceptLoop() {
        ServerSocket socket = serverSocket;
        while (socket != null && !socket.isClosed()) {
            try {
                Socket client = socket.accept();
                workers.execute(() -> handle(client));
            } catch (IOException e) {
                // stop() closes the socket out from under accept(); anything
                // else is a transient failure and the loop re-checks.
                if (socket.isClosed()) break;
                Log.w(TAG, "accept failed", e);
            }
        }
    }

    private void handle(Socket client) {
        try {
            client.setSoTimeout(CLIENT_READ_TIMEOUT_MS);
            client.setTcpNoDelay(true);
            InputStream in = new BufferedInputStream(client.getInputStream(), 8192);
            OutputStream out = new BufferedOutputStream(client.getOutputStream(), COPY_BUFFER);

            String requestLine = readLine(in);
            if (requestLine == null) return;

            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                writeStatus(out, 400, "Bad Request");
                return;
            }
            String method = parts[0];
            String target = parts[1];

            String range = null;
            String line;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                int colon = line.indexOf(':');
                if (colon <= 0) continue;
                if ("range".equalsIgnoreCase(line.substring(0, colon).trim())) {
                    range = line.substring(colon + 1).trim();
                }
            }

            boolean headOnly = "HEAD".equals(method);
            if (!headOnly && !"GET".equals(method)) {
                writeStatus(out, 405, "Method Not Allowed");
                return;
            }

            String fileId = parseFileId(target);
            if (fileId == null) {
                writeStatus(out, 404, "Not Found");
                return;
            }

            proxy(fileId, range, headOnly, out);
        } catch (IOException e) {
            // Seeking makes VLC drop the connection mid-response, and closing
            // the player does the same. Both land here, and neither is a fault.
            Log.d(TAG, "client connection ended: " + e.getMessage());
        } finally {
            try {
                client.close();
            } catch (IOException ignored) {
            }
        }
    }

    /** Pulls the file id out of /&lt;secret&gt;/drive/&lt;id&gt;, or null if it isn't ours. */
    private String parseFileId(String target) {
        String currentSecret = secret;
        if (currentSecret == null) return null;

        int query = target.indexOf('?');
        if (query >= 0) target = target.substring(0, query);

        String prefix = "/" + currentSecret + "/drive/";
        if (!target.startsWith(prefix)) return null;

        String id = target.substring(prefix.length());
        try {
            id = URLDecoder.decode(id, "UTF-8");
        } catch (Exception e) {
            return null;
        }
        return FILE_ID.matcher(id).matches() ? id : null;
    }

    private void proxy(String fileId, String range, boolean headOnly, OutputStream out)
            throws IOException {
        HttpURLConnection conn = null;
        try {
            String token;
            try {
                token = DriveTokenProvider.get(appContext);
            } catch (IOException e) {
                Log.w(TAG, "no Drive token", e);
                writeStatus(out, 502, "Drive Auth Unavailable");
                return;
            }

            conn = openUpstream(fileId, range, token);
            int code = conn.getResponseCode();

            // A token can go stale between range requests on a long file. One
            // retry with a freshly minted token turns that into a hiccup
            // rather than playback stopping.
            if (code == 401) {
                conn.disconnect();
                DriveTokenProvider.invalidate(appContext, token);
                try {
                    token = DriveTokenProvider.get(appContext);
                } catch (IOException e) {
                    writeStatus(out, 502, "Drive Auth Unavailable");
                    return;
                }
                conn = openUpstream(fileId, range, token);
                code = conn.getResponseCode();
            }

            if (code >= 400) {
                // The requested range is part of the story for a 416, and
                // without it the log cannot tell a player probing past the end
                // of the file from a range this server got wrong.
                Log.w(TAG, "upstream " + code + " for " + fileId
                        + (range == null ? " (no range)" : " range=" + range));
                writeStatus(out, code, code == 404 ? "Not Found" : "Upstream Error");
                return;
            }

            StringBuilder head = new StringBuilder(256);
            head.append("HTTP/1.1 ").append(code)
                    .append(code == 206 ? " Partial Content" : " OK").append("\r\n");

            String type = conn.getHeaderField("Content-Type");
            head.append("Content-Type: ")
                    .append(type == null ? "application/octet-stream" : type).append("\r\n");

            // No Content-Length means the upstream sent it chunked; the body is
            // then delimited by the close below. Playback still works, seeking
            // does not, because the player never learns the total size.
            String length = conn.getHeaderField("Content-Length");
            if (length != null) head.append("Content-Length: ").append(length).append("\r\n");

            String contentRange = conn.getHeaderField("Content-Range");
            if (contentRange != null) {
                head.append("Content-Range: ").append(contentRange).append("\r\n");
            }

            head.append("Accept-Ranges: bytes\r\n");
            // One request per connection. Keep-alive would mean tracking where
            // each response ends so the next request could be parsed off the
            // same socket - no gain here, since a seek closes it anyway.
            head.append("Connection: close\r\n\r\n");

            out.write(head.toString().getBytes(StandardCharsets.US_ASCII));
            out.flush();
            if (headOnly) return;

            InputStream body = conn.getInputStream();
            byte[] buffer = new byte[COPY_BUFFER];
            int read;
            while ((read = body.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            out.flush();
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private HttpURLConnection openUpstream(String fileId, String range, String token)
            throws IOException {
        String url = DRIVE_MEDIA + fileId + "?alt=media&supportsAllDrives=true";
        boolean sendAuth = true;

        for (int hop = 0; ; hop++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(UPSTREAM_READ_TIMEOUT_MS);
            // Ranges are byte offsets into the stored file - a gzipped response
            // would make them mean something else entirely.
            conn.setRequestProperty("Accept-Encoding", "identity");
            if (sendAuth) conn.setRequestProperty("Authorization", "Bearer " + token);
            if (range != null) conn.setRequestProperty("Range", range);

            int code = conn.getResponseCode();
            boolean redirect = code == 301 || code == 302 || code == 303
                    || code == 307 || code == 308;
            if (!redirect || hop >= MAX_REDIRECTS) return conn;

            String location = conn.getHeaderField("Location");
            if (location == null) return conn;
            conn.disconnect();

            URL previous = new URL(url);
            URL next = new URL(previous, location);
            // Drive redirects the media download to a signed googleusercontent
            // url that carries its own credentials. Following redirects with
            // the header still attached - which is what HttpURLConnection does
            // on its own - would hand the bearer token to whatever host the
            // redirect names.
            sendAuth = next.getHost().equalsIgnoreCase(previous.getHost());
            url = next.toString();
        }
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream(128);
        int b;
        while ((b = in.read()) != -1) {
            if (b == '\n') break;
            if (b != '\r') buffer.write(b);
            if (buffer.size() > MAX_HEADER_LINE) throw new IOException("header line too long");
        }
        if (b == -1 && buffer.size() == 0) return null;
        return buffer.toString("UTF-8");
    }

    private static void writeStatus(OutputStream out, int code, String reason) throws IOException {
        byte[] body = reason.getBytes(StandardCharsets.UTF_8);
        String head = String.format(Locale.US,
                "HTTP/1.1 %d %s\r\n"
                        + "Content-Type: text/plain; charset=utf-8\r\n"
                        + "Content-Length: %d\r\n"
                        + "Connection: close\r\n\r\n",
                code, reason, body.length);
        out.write(head.getBytes(StandardCharsets.US_ASCII));
        out.write(body);
        out.flush();
    }
}
