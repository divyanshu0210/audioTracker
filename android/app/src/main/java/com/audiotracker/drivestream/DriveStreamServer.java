package com.audiotracker.drivestream;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.util.Base64;
import android.util.Log;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
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
 * A loopback HTTP proxy that feeds the player what it cannot open itself.
 *
 * Two routes, one reason. libVLC takes an MRL and nothing else - no request
 * headers, no content resolver - so anything that needs either has to arrive
 * as a plain http url instead:
 *
 *   /<secret>/drive/<fileId>       a Drive file, which needs a bearer header
 *   /<secret>/content/<uri>        a device file, which lives behind a
 *                                  content:// uri the player cannot resolve
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
 * - and now any file the user has ever picked - through this port.
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

            Route route = parseRoute(target);
            if (route == null) {
                writeStatus(out, 404, "Not Found");
                return;
            }

            if (route.kind == Route.CONTENT) {
                serveContent(route.value, range, headOnly, out);
            } else {
                proxy(route.value, range, headOnly, out);
            }
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

    /** A parsed request path: which half of the server it is for, and its argument. */
    private static final class Route {
        static final int DRIVE = 0;
        static final int CONTENT = 1;

        final int kind;
        final String value;

        Route(int kind, String value) {
            this.kind = kind;
            this.value = value;
        }
    }

    /**
     * Pulls the target out of /&lt;secret&gt;/drive/&lt;id&gt; or
     * /&lt;secret&gt;/content/&lt;encoded uri&gt;, or null if it isn't ours.
     */
    private Route parseRoute(String target) {
        String currentSecret = secret;
        if (currentSecret == null) return null;

        int query = target.indexOf('?');
        if (query >= 0) target = target.substring(0, query);

        String prefix = "/" + currentSecret + "/";
        if (!target.startsWith(prefix)) return null;

        String rest = target.substring(prefix.length());
        int slash = rest.indexOf('/');
        if (slash <= 0) return null;

        String kind = rest.substring(0, slash);
        String value;
        try {
            value = URLDecoder.decode(rest.substring(slash + 1), "UTF-8");
        } catch (Exception e) {
            return null;
        }

        if ("drive".equals(kind)) {
            return FILE_ID.matcher(value).matches() ? new Route(Route.DRIVE, value) : null;
        }
        if ("content".equals(kind)) {
            // content: and nothing else. The secret already keeps other apps
            // off this port, but no part of this route needs to reach a
            // file:// path, and refusing one means a leaked secret cannot turn
            // the server into a reader for the app's own private storage.
            return value.startsWith("content://") ? new Route(Route.CONTENT, value) : null;
        }
        return null;
    }

    // Returned by parseRange for a range that asks past the end of the file,
    // which is a 416 and not something to answer with bytes. A null return
    // means "no usable range here", and that is a whole-file 200.
    private static final long[] UNSATISFIABLE = new long[0];

    /**
     * Serves a device file straight from its content:// uri.
     *
     * The player cannot do this itself. Its JS wrapper flags a content: scheme
     * as a network source and hands the string to
     * `new Media(libvlc, Uri.parse(...))`, and this libvlc build has no
     * ContentResolver behind that path - it prefixes file:// and looks for a
     * literal file, so the MRL comes out as `file:////content%3A//...` and the
     * open fails with "No such file or directory" while the player sits at
     * 00:00.
     *
     * Resolving the uri here is what lets an imported file stay where the user
     * keeps it rather than being copied into the app's own storage, which used
     * to double what every import cost on disk.
     *
     * Ranges are served by seeking the descriptor, not by reading and throwing
     * bytes away, so scrubbing a long video costs nothing. A provider that
     * answers with a pipe rather than a real file has no size and no seek;
     * that one streams start to finish, which plays but cannot scrub.
     */
    private void serveContent(String uriString, String range, boolean headOnly, OutputStream out)
            throws IOException {
        Uri uri;
        try {
            uri = Uri.parse(uriString);
        } catch (Exception e) {
            writeStatus(out, 400, "Bad Request");
            return;
        }

        ContentResolver resolver = appContext.getContentResolver();
        ParcelFileDescriptor pfd;
        try {
            pfd = resolver.openFileDescriptor(uri, "r");
        } catch (SecurityException e) {
            // The grant is gone - revoked by the user, or never persistable in
            // the first place. Kept distinct from 404 because the two need
            // different answers on screen: re-pick the file, versus it is gone.
            Log.w(TAG, "no permission for " + uri);
            writeStatus(out, 403, "Permission Revoked");
            return;
        } catch (FileNotFoundException e) {
            Log.w(TAG, "content uri resolves to nothing: " + uri);
            writeStatus(out, 404, "Not Found");
            return;
        }

        if (pfd == null) {
            writeStatus(out, 404, "Not Found");
            return;
        }

        try {
            String type = resolver.getType(uri);
            if (type == null) type = "application/octet-stream";
            long total = pfd.getStatSize();

            long start = 0;
            long end = total - 1;
            boolean partial = false;

            if (total > 0 && range != null) {
                long[] parsed = parseRange(range, total);
                if (parsed == UNSATISFIABLE) {
                    writeStatus(out, 416, "Range Not Satisfiable");
                    return;
                }
                if (parsed != null) {
                    start = parsed[0];
                    end = parsed[1];
                    partial = true;
                }
            }

            StringBuilder head = new StringBuilder(256);
            head.append("HTTP/1.1 ").append(partial ? "206 Partial Content" : "200 OK")
                    .append("\r\n");
            head.append("Content-Type: ").append(type).append("\r\n");

            if (total < 0) {
                // No size to report, so no Content-Length and no seeking - the
                // same shape the Drive half takes when the upstream answers
                // chunked, and the body is delimited by the close instead.
                head.append("Connection: close\r\n\r\n");
            } else {
                head.append("Content-Length: ").append(end - start + 1).append("\r\n");
                if (partial) {
                    head.append("Content-Range: bytes ").append(start).append('-').append(end)
                            .append('/').append(total).append("\r\n");
                }
                head.append("Accept-Ranges: bytes\r\n");
                head.append("Connection: close\r\n\r\n");
            }

            out.write(head.toString().getBytes(StandardCharsets.US_ASCII));
            out.flush();
            if (headOnly) return;

            // Wrapping the descriptor rather than duplicating it. Closing this
            // stream closes that descriptor too, which is why nothing else
            // reads from the pfd after this point.
            FileInputStream body = new FileInputStream(pfd.getFileDescriptor());
            try {
                byte[] buffer = new byte[COPY_BUFFER];

                if (total < 0) {
                    int read;
                    while ((read = body.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                    }
                } else {
                    if (start > 0) body.getChannel().position(start);
                    long remaining = end - start + 1;
                    while (remaining > 0) {
                        int read = body.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                        if (read == -1) break;
                        out.write(buffer, 0, read);
                        remaining -= read;
                    }
                }
                out.flush();
            } finally {
                try {
                    body.close();
                } catch (IOException ignored) {
                }
            }
        } finally {
            try {
                pfd.close();
            } catch (IOException ignored) {
            }
        }
    }

    /**
     * The inclusive byte range a Range header asks for, null if there is no
     * usable one in it, or UNSATISFIABLE if it starts past the end of the file.
     */
    private static long[] parseRange(String header, long total) {
        if (!header.regionMatches(true, 0, "bytes=", 0, 6)) return null;

        String spec = header.substring(6).trim();
        // Multi-range is legal HTTP and would need a multipart body. No player
        // here asks for one, and the whole file is a correct answer to it.
        if (spec.isEmpty() || spec.indexOf(',') >= 0) return null;

        int dash = spec.indexOf('-');
        if (dash < 0) return null;

        String from = spec.substring(0, dash).trim();
        String to = spec.substring(dash + 1).trim();

        try {
            long start;
            long end;
            if (from.isEmpty()) {
                // bytes=-N, the last N bytes: how a player reads a trailing
                // index (an mp4 with its moov atom at the end) without
                // fetching everything in front of it first.
                if (to.isEmpty()) return null;
                long suffix = Long.parseLong(to);
                if (suffix <= 0) return UNSATISFIABLE;
                start = Math.max(0, total - suffix);
                end = total - 1;
            } else {
                start = Long.parseLong(from);
                end = to.isEmpty() ? total - 1 : Long.parseLong(to);
            }

            if (start < 0 || start >= total) return UNSATISFIABLE;
            if (end >= total) end = total - 1;
            if (end < start) return UNSATISFIABLE;
            return new long[] {start, end};
        } catch (NumberFormatException e) {
            return null;
        }
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
