package com.audiotracker.drivestream;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.os.StatFs;
import android.util.Base64;
import android.util.Log;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.File;
import java.io.FileOutputStream;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
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
    private static final int METADATA_CACHE_BYTES = 2 * 1024 * 1024;
    private static final long CACHE_MIN_BYTES = 16L * 1024 * 1024;
    private static final long CACHE_MAX_BYTES = 256L * 1024 * 1024;
    private static final long CACHE_RESERVED_BYTES = 100L * 1024 * 1024;
    // VLC's startup probes for these files have been observed around 0, 1.5
    // and 5.3 MB. Keep this startup band ahead of later seek/playback ranges.
    private static final long CACHE_METADATA_RANGE_BYTES = 8L * 1024 * 1024;
    private static final int MAX_HEADER_LINE = 8192;

    // Drive file ids are url-safe base64-ish. Anything else is not an id we
    // handed out, and refusing it early keeps junk out of an outgoing request.
    private static final Pattern FILE_ID = Pattern.compile("[A-Za-z0-9_-]{5,128}");

    private static DriveStreamServer instance;

    private final Context appContext;
    private final File diskCacheDir;
    private final ExecutorService workers = Executors.newCachedThreadPool();
    private final ConcurrentHashMap<String, AtomicInteger> rangeRequestCounts =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CachedWindow> metadataWindows =
            new ConcurrentHashMap<>();

    private static final class CachedWindow {
        final long start;
        final long total;
        final String contentType;
        final byte[] bytes;
        final File file;

        CachedWindow(long start, long total, String contentType, byte[] bytes) {
            this(start, total, contentType, bytes, null);
        }

        CachedWindow(long start, long total, String contentType, byte[] bytes, File file) {
            this.start = start;
            this.total = total;
            this.contentType = contentType;
            this.bytes = bytes;
            this.file = file;
        }
    }

    private ServerSocket serverSocket;
    private Thread acceptThread;
    private volatile String secret;
    private String baseUrl;

    private DriveStreamServer(Context context) {
        this.appContext = context.getApplicationContext();
        this.diskCacheDir = new File(this.appContext.getCacheDir(), "drive-ranges");
        this.diskCacheDir.mkdirs();
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
        if (serverSocket != null && !serverSocket.isClosed()) {
            Log.d(TAG, "cache-startup " + cacheUsageSummary());
            return baseUrl;
        }

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
        Log.d(TAG, "cache-startup " + cacheUsageSummary());
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

    private static Long parseRangeStart(String range) {
        if (range == null || !range.regionMatches(true, 0, "bytes=", 0, 6)) {
            return 0L;
        }
        int dash = range.indexOf('-', 6);
        if (dash <= 6) return null;
        try {
            return Long.parseLong(range.substring(6, dash).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * VLC commonly asks for an open-ended range such as `bytes=0-`. A cached
     * prefix cannot safely satisfy that request: closing the socket after the
     * prefix can look like EOF to VLC and trigger playlist auto-advance. Keep
     * open-ended requests on the upstream path; cache hits are safe only for
     * ranges with an explicit end.
     */
    private static boolean isBoundedRange(String range) {
        if (range == null) return false;
        int dash = range.indexOf('-');
        return dash >= 0 && dash + 1 < range.length()
                && range.substring(dash + 1).trim().length() > 0;
    }

    private static String cacheKey(String fileId, long rangeStart) {
        return fileId + "|" + rangeStart;
    }

    private long diskCacheLimitBytes() {
        try {
            StatFs stats = new StatFs(diskCacheDir.getAbsolutePath());
            long available = stats.getAvailableBytes();
            if (available <= CACHE_RESERVED_BYTES) return 0;
            long usable = Math.max(0, available - CACHE_RESERVED_BYTES);
            long calculated = usable / 50; // 2% of space that remains usable.
            return Math.max(CACHE_MIN_BYTES, Math.min(CACHE_MAX_BYTES, calculated));
        } catch (RuntimeException e) {
            return CACHE_MIN_BYTES;
        }
    }

    /** Current on-disk cache usage and the dynamic limit selected for this device. */
    private synchronized String cacheUsageSummary() {
        long used = 0;
        File[] files = diskCacheDir.listFiles();
        if (files != null) {
            for (File file : files) {
                if (file.isFile() && file.getName().endsWith(".bin")) {
                    used += fileSize(file);
                }
            }
        }
        long limit = diskCacheLimitBytes();
        long available = -1;
        try {
            available = new StatFs(diskCacheDir.getAbsolutePath()).getAvailableBytes();
        } catch (RuntimeException ignored) {
            // The cache limit is still available even if free-space reporting fails.
        }
        return String.format(Locale.US,
                "usedBytes=%d usedMB=%.2f limitBytes=%d limitMB=%.2f availableBytes=%d availableMB=%.2f",
                used, used / (1024d * 1024d), limit, limit / (1024d * 1024d),
                available, available < 0 ? 0 : available / (1024d * 1024d));
    }

    private static long fileSize(File file) {
        return file != null && file.isFile() ? file.length() : 0;
    }

    private static boolean isMetadataRangeFile(File file) {
        if (file == null) return false;
        String[] parts = file.getName().split("__");
        if (parts.length < 3) return false;
        try {
            long start = Long.parseLong(parts[1]);
            return start < CACHE_METADATA_RANGE_BYTES;
        } catch (NumberFormatException ignored) {
            return false;
        }
    }

    private synchronized CachedWindow findDiskWindowContaining(String fileId, long start) {
        String prefix = fileId + "__";
        File[] files = diskCacheDir.listFiles();
        if (files == null) return null;
        CachedWindow best = null;
        long bestStart = Long.MIN_VALUE;
        for (File file : files) {
            String name = file.getName();
            if (!file.isFile() || !name.startsWith(prefix) || !name.endsWith(".bin")) {
                continue;
            }
            String[] parts = name.substring(prefix.length(), name.length() - 4).split("__");
            if (parts.length != 2) continue;
            try {
                long windowStart = Long.parseLong(parts[0]);
                long total = Long.parseLong(parts[1]);
                if (start >= windowStart && start < windowStart + file.length()
                        && windowStart >= bestStart) {
                    bestStart = windowStart;
                    best = new CachedWindow(windowStart, total, "video/mp4", null, file);
                }
            } catch (NumberFormatException ignored) {
                // Ignore malformed cache entries.
            }
        }
        return best;
    }

    private synchronized CachedWindow getCachedWindowContaining(String fileId, long start) {
        CachedWindow cached = metadataWindows.get(cacheKey(fileId, start));
        if (cached != null && (cached.bytes != null || fileSize(cached.file) > 0)) {
            CachedWindow diskBest = findDiskWindowContaining(fileId, start);
            if (diskBest == null || cached.start >= diskBest.start) {
                if (cached.file != null) cached.file.setLastModified(System.currentTimeMillis());
                return cached;
            }
            cached = diskBest;
        }
        if (cached == null) cached = findDiskWindowContaining(fileId, start);
        if (cached == null) {
            long bestStart = Long.MIN_VALUE;
            for (CachedWindow candidate : metadataWindows.values()) {
                if (candidate.file != null && candidate.file.getName().startsWith(fileId + "__")
                        && start >= candidate.start
                        && start < candidate.start + fileSize(candidate.file)
                        && candidate.start >= bestStart) {
                    cached = candidate;
                    bestStart = candidate.start;
                }
            }
        }
        if (cached != null) metadataWindows.put(cacheKey(fileId, start), cached);
        return cached;
    }

    /** Find a disk/RAM window that contains this byte position or starts there. */
    private synchronized CachedWindow getCachedWindowCovering(String fileId, long position) {
        CachedWindow cached = getCachedWindowContaining(fileId, position);
        if (cached != null) return cached;

        File[] files = diskCacheDir.listFiles();
        if (files == null) return null;
        String prefix = fileId + "__";
        for (File file : files) {
            String name = file.getName();
            if (!file.isFile() || !name.startsWith(prefix) || !name.endsWith(".bin")) continue;
            String[] parts = name.substring(prefix.length(), name.length() - 4).split("__");
            if (parts.length != 2) continue;
            try {
                long windowStart = Long.parseLong(parts[0]);
                long total = Long.parseLong(parts[1]);
                if (position >= windowStart && position < windowStart + file.length()) {
                    CachedWindow result = new CachedWindow(windowStart, total,
                            "video/mp4", null, file);
                    metadataWindows.put(cacheKey(fileId, position), result);
                    return result;
                }
            } catch (NumberFormatException ignored) {
                // Ignore malformed cache entries.
            }
        }
        return null;
    }

    /** Return the nearest cached window strictly after a byte position. */
    private synchronized CachedWindow findNextCachedWindow(String fileId, long position,
            long total) {
        CachedWindow best = null;
        long bestStart = Long.MAX_VALUE;
        File[] files = diskCacheDir.listFiles();
        if (files != null) {
            String prefix = fileId + "__";
            for (File file : files) {
                String name = file.getName();
                if (!file.isFile() || !name.startsWith(prefix) || !name.endsWith(".bin")) continue;
                String[] parts = name.substring(prefix.length(), name.length() - 4).split("__");
                if (parts.length != 2) continue;
                try {
                    long start = Long.parseLong(parts[0]);
                    long cachedTotal = Long.parseLong(parts[1]);
                    if (cachedTotal == total && start > position && start < bestStart) {
                        bestStart = start;
                        best = new CachedWindow(start, cachedTotal, "video/mp4", null, file);
                    }
                } catch (NumberFormatException ignored) {
                    // Ignore malformed cache entries.
                }
            }
        }
        for (CachedWindow candidate : metadataWindows.values()) {
            if (candidate.file == null || !candidate.file.isFile()
                    || !candidate.file.getName().startsWith(fileId + "__")) continue;
            if (candidate.total == total && candidate.start > position
                    && candidate.start < bestStart) {
                best = candidate;
                bestStart = candidate.start;
            }
        }
        return best;
    }

    /** Find the nearest cached window after a position, even before Drive tells us the total. */
    private synchronized CachedWindow findNextCachedWindowAnyTotal(String fileId, long position) {
        CachedWindow best = null;
        long bestStart = Long.MAX_VALUE;
        File[] files = diskCacheDir.listFiles();
        String prefix = fileId + "__";
        if (files != null) {
            for (File file : files) {
                String name = file.getName();
                if (!file.isFile() || !name.startsWith(prefix) || !name.endsWith(".bin")) continue;
                String[] parts = name.substring(prefix.length(), name.length() - 4).split("__");
                if (parts.length != 2) continue;
                try {
                    long start = Long.parseLong(parts[0]);
                    long total = Long.parseLong(parts[1]);
                    if (start > position && start < bestStart && file.length() > 0) {
                        bestStart = start;
                        best = new CachedWindow(start, total, "video/mp4", null, file);
                    }
                } catch (NumberFormatException ignored) {
                    // Ignore malformed cache entries.
                }
            }
        }
        for (CachedWindow candidate : metadataWindows.values()) {
            if (candidate.file == null || !candidate.file.isFile()
                    || !candidate.file.getName().startsWith(prefix)) continue;
            if (candidate.start > position && candidate.start < bestStart) {
                best = candidate;
                bestStart = candidate.start;
            }
        }
        return best;
    }

    private byte[] readCachedBytes(CachedWindow cached) throws IOException {
        if (cached.bytes != null) return cached.bytes;
        if (cached.file == null || !cached.file.isFile()) return null;
        int size = (int) Math.min(METADATA_CACHE_BYTES, cached.file.length());
        byte[] bytes;
        try {
            bytes = new byte[size];
        } catch (OutOfMemoryError e) {
            Log.w(TAG, "cache read skipped: insufficient memory");
            return null;
        }
        try (InputStream in = new BufferedInputStream(new FileInputStream(cached.file))) {
            int offset = 0;
            while (offset < size) {
                int read = in.read(bytes, offset, size - offset);
                if (read < 0) break;
                offset += read;
            }
            if (offset != size) return null;
        }
        cached.file.setLastModified(System.currentTimeMillis());
        return bytes;
    }

    private synchronized void evictDiskCache(long incomingBytes) {
        File[] files = diskCacheDir.listFiles();
        if (files == null) return;
        long total = 0;
        for (File file : files) total += fileSize(file);
        long limit = diskCacheLimitBytes();
        while (total + incomingBytes > limit) {
            File oldest = null;
            // Evict later seek/playback ranges before the startup metadata
            // band. If only metadata remains, the second pass below still
            // evicts the oldest protected entry to honor the size limit.
            for (File file : files) {
                if (!file.isFile() || isMetadataRangeFile(file)) continue;
                if (oldest == null || file.lastModified() < oldest.lastModified()) oldest = file;
            }
            if (oldest == null) {
                for (File file : files) {
                    if (!file.isFile()) continue;
                    if (oldest == null || file.lastModified() < oldest.lastModified()) {
                        oldest = file;
                    }
                }
            }
            if (oldest == null) break;
            long evictedBytes = fileSize(oldest);
            if (!oldest.delete()) break;
            total -= evictedBytes;
            final File evicted = oldest;
            metadataWindows.entrySet().removeIf(entry ->
                    entry.getValue().file != null && entry.getValue().file.equals(evicted));
            files = diskCacheDir.listFiles();
            if (files == null) break;
        }
    }

    private synchronized CachedWindow persistWindow(String fileId, long start, long total,
            String contentType, byte[] bytes) throws IOException {
        if (diskCacheLimitBytes() < bytes.length) return null;
        String filePrefix = fileId + "__";
        File[] existing = diskCacheDir.listFiles();
        if (existing != null) {
            for (File file : existing) {
                String name = file.getName();
                if (!file.isFile() || !name.startsWith(filePrefix) || !name.endsWith(".bin")) {
                    continue;
                }
                String[] parts = name.substring(filePrefix.length(), name.length() - 4)
                        .split("__");
                if (parts.length == 2 && !String.valueOf(total).equals(parts[1])) {
                    long oldSize = fileSize(file);
                    file.delete();
                    metadataWindows.entrySet().removeIf(entry ->
                            entry.getValue().file != null && entry.getValue().file.equals(file));
                    Log.d(TAG, "cache-invalidate file=" + fileId
                            + " oldTotal=" + parts[1] + " bytes=" + oldSize);
                }
            }
        }
        File target = new File(diskCacheDir, fileId + "__" + start + "__" + total + ".bin");
        evictDiskCache(bytes.length);
        File temp = new File(diskCacheDir, target.getName() + ".tmp");
        try (OutputStream out = new BufferedOutputStream(new FileOutputStream(temp))) {
            out.write(bytes);
        }
        if (!temp.renameTo(target)) {
            temp.delete();
            return null;
        }
        CachedWindow cached = new CachedWindow(start, total, contentType, null, target);
        metadataWindows.put(cacheKey(fileId, start), cached);
        return cached;
    }

    /** Persist one bounded cache window and log the outcome in a single event. */
    private long storeCacheChunk(String fileId, long start, long total, String contentType,
            ByteArrayOutputStream capture, String source) {
        int bytes = capture.size();
        try {
            CachedWindow stored = persistWindow(fileId, start, total, contentType,
                    capture.toByteArray());
            String result = stored == null ? "failed" : "success";
            Log.d(TAG, "timing proxy:cache-store file=" + fileId
                    + " from=" + start
                    + " to=" + (start + bytes - 1)
                    + " bytes=" + bytes
                    + " result=" + result
                    + " intervals=" + cacheIntervals(fileId)
                    + " " + cacheUsageSummary()
                    + (stored == null ? " reason=capacity-or-write-rejected" : "")
                    + " source=" + source);
            return stored == null ? 0 : bytes;
        } catch (IOException | RuntimeException e) {
            Log.w(TAG, "timing proxy:cache-store file=" + fileId
                    + " from=" + start
                    + " bytes=" + bytes
                    + " result=failed reason=" + e.getClass().getSimpleName()
                    + " intervals=" + cacheIntervals(fileId)
                    + " " + cacheUsageSummary()
                    + " source=" + source);
            return 0;
        } catch (OutOfMemoryError e) {
            Log.w(TAG, "timing proxy:cache-store file=" + fileId
                    + " from=" + start
                    + " bytes=" + bytes
                    + " result=failed reason=insufficient-memory"
                    + " intervals=" + cacheIntervals(fileId)
                    + " " + cacheUsageSummary()
                    + " source=" + source);
            return 0;
        }
    }

    /** Return persisted cache windows as compact inclusive byte intervals. */
    private synchronized String cacheIntervals(String fileId) {
        List<long[]> ranges = new ArrayList<>();
        File[] files = diskCacheDir.listFiles();
        String prefix = fileId + "__";
        if (files != null) {
            for (File file : files) {
                String name = file.getName();
                if (!file.isFile() || !name.startsWith(prefix) || !name.endsWith(".bin")) continue;
                String[] parts = name.substring(prefix.length(), name.length() - 4).split("__");
                if (parts.length != 2) continue;
                try {
                    long start = Long.parseLong(parts[0]);
                    long end = start + file.length() - 1;
                    if (file.length() > 0) ranges.add(new long[] {start, end});
                } catch (NumberFormatException ignored) {
                    // Ignore malformed cache entries.
                }
            }
        }
        Collections.sort(ranges, Comparator.comparingLong(range -> range[0]));
        StringBuilder result = new StringBuilder("[");
        for (int i = 0; i < ranges.size(); i++) {
            if (i > 0) result.append(',');
            result.append(ranges.get(i)[0]).append('-').append(ranges.get(i)[1]);
        }
        return result.append(']').toString();
    }

    private static long parseContentTotal(String contentRange, String contentLength,
            long rangeStart) {
        if (contentRange != null) {
            int slash = contentRange.lastIndexOf('/');
            if (slash >= 0) {
                try {
                    return Long.parseLong(contentRange.substring(slash + 1).trim());
                } catch (NumberFormatException ignored) {
                    // Fall through to the Content-Length estimate.
                }
            }
        }
        if (contentLength != null) {
            try {
                return rangeStart + Long.parseLong(contentLength);
            } catch (NumberFormatException ignored) {
                // Unknown length; the cache will not be used for this response.
            }
        }
        return -1;
    }

    /**
     * Serve the cached metadata prefix and continue the same HTTP response
     * from Drive. Closing after the prefix is unsafe because VLC can interpret
     * that close as EOF and advance the playlist.
     */
    private boolean serveCachedPrefixWithUpstream(String fileId, long requestedStart,
            CachedWindow cached, OutputStream out) throws IOException {
        byte[] firstBytes = cached == null ? null : readCachedBytes(cached);
        if (cached == null || firstBytes == null || firstBytes.length == 0
                || requestedStart < cached.start
                || requestedStart >= cached.start + firstBytes.length) {
            return false;
        }

        // Stitch adjacent cached windows before going to Drive. VLC still gets
        // one normal HTTP response, but every contiguous byte already on disk
        // is read locally and is never downloaded again.
        List<byte[]> cachedParts = new ArrayList<>();
        int firstOffset = (int) (requestedStart - cached.start);
        cachedParts.add(java.util.Arrays.copyOfRange(firstBytes, firstOffset,
                firstBytes.length));
        long continuationStart = cached.start + firstBytes.length;
        Log.d(TAG, "timing proxy:cache-resume file=" + fileId
                + " from=" + requestedStart
                + " to=" + (cached.start + firstBytes.length - 1)
                + " bytes=" + (firstBytes.length - firstOffset)
                + " source=request-start");
        while (continuationStart < cached.total) {
            CachedWindow adjacent = getCachedWindowCovering(fileId, continuationStart);
            if (adjacent == null || adjacent.start != continuationStart
                    || adjacent.total != cached.total) {
                break;
            }
            byte[] adjacentBytes = readCachedBytes(adjacent);
            if (adjacentBytes == null || adjacentBytes.length == 0) break;
            cachedParts.add(adjacentBytes);
            Log.d(TAG, "timing proxy:cache-stitch file=" + fileId
                    + " from=" + adjacent.start
                    + " to=" + (adjacent.start + adjacentBytes.length - 1)
                    + " bytes=" + adjacentBytes.length);
            continuationStart += adjacentBytes.length;
        }

        long totalLength = cached.total - requestedStart;
        StringBuilder head = new StringBuilder(256);
        head.append("HTTP/1.1 206 Partial Content\r\n")
                .append("Content-Type: ")
                .append(cached.contentType == null ? "application/octet-stream" : cached.contentType)
                .append("\r\n")
                .append("Content-Length: ").append(totalLength).append("\r\n")
                .append("Content-Range: bytes ").append(requestedStart).append('-')
                .append(cached.total - 1)
                .append('/').append(cached.total).append("\r\n")
                .append("Accept-Ranges: bytes\r\n")
                .append("Connection: close\r\n\r\n");
        out.write(head.toString().getBytes(StandardCharsets.US_ASCII));
        for (byte[] part : cachedParts) out.write(part);
        out.flush();
        if (continuationStart >= cached.total) return true;

        long streamStart = continuationStart;
        while (streamStart < cached.total) {
            CachedWindow nextCached = findNextCachedWindow(fileId, streamStart, cached.total);
            long boundedEnd = nextCached == null ? -1 : nextCached.start - 1;
            String upstreamRange = boundedEnd >= streamStart
                    ? "bytes=" + streamStart + "-" + boundedEnd
                    : "bytes=" + streamStart + "-";
            Log.d(TAG, "timing proxy:cache-gap-drive-stream file=" + fileId
                    + " from=" + streamStart
                    + " to=" + boundedEnd
                    + " nextCachedStart="
                    + (nextCached == null ? "none" : nextCached.start));
            HttpURLConnection continuation = null;
            try {
                String token = DriveTokenProvider.get(appContext);
                continuation = openUpstream(fileId, upstreamRange, token);
                int code = continuation.getResponseCode();
                if (code == 401) {
                    continuation.disconnect();
                    DriveTokenProvider.invalidate(appContext, token);
                    token = DriveTokenProvider.get(appContext);
                    continuation = openUpstream(fileId, upstreamRange, token);
                    code = continuation.getResponseCode();
                }
                if (code >= 400) {
                    Log.w(TAG, "cached prefix continuation failed for " + fileId
                            + " status=" + code + " range=" + upstreamRange);
                    return true;
                }

                InputStream body = continuation.getInputStream();
                ByteArrayOutputStream capture = new ByteArrayOutputStream(64 * 1024);
                byte[] buffer = new byte[COPY_BUFFER];
                long segmentBytes = 0;
                long storedBytes = 0;
                boolean driveReadComplete = false;
                long cacheChunkStart = streamStart;
                int read;
                try {
                    while ((read = body.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        segmentBytes += read;
                        int captured = 0;
                        while (captured < read && capture != null) {
                            int chunk = Math.min(read - captured,
                                    METADATA_CACHE_BYTES - capture.size());
                            try {
                                capture.write(buffer, captured, chunk);
                            } catch (OutOfMemoryError e) {
                                capture = null;
                                Log.w(TAG, "cache capture skipped: insufficient memory");
                                break;
                            }
                            captured += chunk;
                            if (capture.size() == METADATA_CACHE_BYTES) {
                                storedBytes += storeCacheChunk(fileId, cacheChunkStart,
                                        cached.total, "video/mp4", capture, "drive");
                                cacheChunkStart += capture.size();
                                capture.reset();
                            }
                        }
                    }
                    driveReadComplete = true;
                } finally {
                    if (capture != null && capture.size() > 0) {
                        storedBytes += storeCacheChunk(fileId, cacheChunkStart, cached.total,
                                "video/mp4", capture, "drive");
                    }
                    if (boundedEnd < streamStart || !driveReadComplete) {
                        Log.d(TAG, "timing proxy:drive-end file=" + fileId
                                + " from=" + streamStart
                                + " bytes=" + segmentBytes
                                + " storedBytes=" + storedBytes
                                + " status=" + (driveReadComplete ? "complete" : "interrupted"));
                    }
                }
                continuation.disconnect();
                continuation = null;

                if (boundedEnd < streamStart) {
                    out.flush();
                    return true;
                }
                streamStart = boundedEnd + 1;

                // The bounded gap ended exactly where the next cached window
                // begins. Reuse that window and any following adjacent windows.
                boolean cacheStarted = false;
                while (streamStart < cached.total) {
                    CachedWindow local = getCachedWindowCovering(fileId, streamStart);
                    if (local == null || local.start != streamStart
                            || local.total != cached.total) break;
                    byte[] localBytes = readCachedBytes(local);
                    if (localBytes == null || localBytes.length == 0) break;
                    if (!cacheStarted) {
                        Log.d(TAG, "timing proxy:cache-resume file=" + fileId
                                + " from=" + local.start
                                + " to=" + (local.start + localBytes.length - 1)
                                + " bytes=" + localBytes.length
                                + " afterDriveBytes=" + segmentBytes);
                        cacheStarted = true;
                    } else {
                        Log.d(TAG, "timing proxy:cache-stitch file=" + fileId
                                + " from=" + local.start
                                + " to=" + (local.start + localBytes.length - 1)
                                + " bytes=" + localBytes.length);
                    }
                    out.write(localBytes);
                    streamStart += localBytes.length;
                    cachedParts.add(localBytes);
                }
                out.flush();
            } catch (IOException e) {
                // Cached bytes have already been sent. End this response and
                // let VLC retry normally; never write a second HTTP header.
                Log.w(TAG, "cache continuation skipped: " + e.getMessage());
                return true;
            } finally {
                if (continuation != null) continuation.disconnect();
            }
        }
        out.flush();
        return true;
    }

    /** Stream an uncached request gap only until the next cached window. */
    private boolean serveGapUntilCache(String fileId, long requestedStart,
            CachedWindow nextCached, OutputStream out) throws IOException {
        if (nextCached == null || nextCached.start <= requestedStart) return false;
        long gapEnd = nextCached.start - 1;
        String range = "bytes=" + requestedStart + "-" + gapEnd;
        Log.d(TAG, "timing proxy:cache-gap-drive-stream file=" + fileId
                + " from=" + requestedStart + " to=" + gapEnd
                + " nextCachedStart=" + nextCached.start + " reason=cache-miss");

        String token = DriveTokenProvider.get(appContext);
        HttpURLConnection conn = openUpstream(fileId, range, token);
        int code = conn.getResponseCode();
        if (code == 401) {
            conn.disconnect();
            DriveTokenProvider.invalidate(appContext, token);
            token = DriveTokenProvider.get(appContext);
            conn = openUpstream(fileId, range, token);
            code = conn.getResponseCode();
        }
        if (code >= 400) {
            conn.disconnect();
            return false;
        }

        String type = conn.getHeaderField("Content-Type");
        String totalHeader = conn.getHeaderField("Content-Range");
        String length = conn.getHeaderField("Content-Length");
        long total = parseContentTotal(totalHeader, length, requestedStart);
        if (total <= 0) total = nextCached.total;
        String head = "HTTP/1.1 206 Partial Content\r\n"
                + "Content-Type: " + (type == null ? "video/mp4" : type) + "\r\n"
                + "Content-Length: " + (total - requestedStart) + "\r\n"
                + "Content-Range: bytes " + requestedStart + "-" + (total - 1)
                + "/" + total + "\r\n"
                + "Accept-Ranges: bytes\r\nConnection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.US_ASCII));
        out.flush();

        InputStream body = conn.getInputStream();
        byte[] buffer = new byte[COPY_BUFFER];
        ByteArrayOutputStream capture = new ByteArrayOutputStream(64 * 1024);
        long bytesServed = 0;
        long storedBytes = 0;
        long chunkStart = requestedStart;
        boolean complete = false;
        try {
            int read;
            while ((read = body.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                bytesServed += read;
                int offset = 0;
                while (offset < read) {
                    int chunk = Math.min(read - offset,
                            METADATA_CACHE_BYTES - capture.size());
                    capture.write(buffer, offset, chunk);
                    offset += chunk;
                    if (capture.size() == METADATA_CACHE_BYTES) {
                        storedBytes += storeCacheChunk(fileId, chunkStart, total, type,
                                capture, "drive");
                        chunkStart += capture.size();
                        capture.reset();
                    }
                }
            }
            complete = true;
        } finally {
            if (capture.size() > 0) {
                storedBytes += storeCacheChunk(fileId, chunkStart, total, type,
                        capture, "drive");
            }
            Log.d(TAG, "timing proxy:drive-end file=" + fileId
                    + " from=" + requestedStart
                    + " bytes=" + bytesServed
                    + " storedBytes=" + storedBytes
                    + " status=" + (complete ? "complete" : "interrupted"));
            conn.disconnect();
        }
        if (!complete) return true;

        boolean resumed = false;
        long position = requestedStart + bytesServed;
        while (position < total) {
            CachedWindow local = getCachedWindowCovering(fileId, position);
            if (local == null || local.start != position || local.total != total) break;
            byte[] bytes = readCachedBytes(local);
            if (bytes == null || bytes.length == 0) break;
            if (!resumed) {
                Log.d(TAG, "timing proxy:cache-resume file=" + fileId
                        + " from=" + local.start
                        + " to=" + (local.start + bytes.length - 1)
                        + " bytes=" + bytes.length + " afterDriveBytes=" + bytesServed);
                resumed = true;
            } else {
                Log.d(TAG, "timing proxy:cache-stitch file=" + fileId
                        + " from=" + local.start
                        + " to=" + (local.start + bytes.length - 1)
                        + " bytes=" + bytes.length);
            }
            out.write(bytes);
            out.flush();
            position += bytes.length;
        }
        return true;
    }

    private void proxy(String fileId, String range, boolean headOnly, OutputStream out)
            throws IOException {
        HttpURLConnection conn = null;
        String requestKey = fileId + "|" + (range == null ? "none" : range);
        int requestNumber = rangeRequestCounts
                .computeIfAbsent(requestKey, ignored -> new AtomicInteger())
                .incrementAndGet();
        Log.d(TAG, "timing proxy:start file=" + fileId
                + " request#=" + requestNumber
                + (range == null ? " range=none" : " range=" + range));
        try {
            Long requestedStart = parseRangeStart(range);
            boolean cacheEligible = !headOnly && requestedStart != null
                    && range != null && !isBoundedRange(range);
            CachedWindow cached = null;
            if (cacheEligible) {
                try {
                    cached = getCachedWindowContaining(fileId, requestedStart);
                } catch (RuntimeException e) {
                    Log.w(TAG, "cache lookup skipped: " + e.getMessage());
                }
            }

            if (cacheEligible && cached != null) {
                try {
                    if (serveCachedPrefixWithUpstream(fileId, requestedStart, cached,
                            out)) {
                        return;
                    }
                } catch (IOException | RuntimeException e) {
                    Log.w(TAG, "cache read skipped: " + e.getMessage());
                } catch (OutOfMemoryError e) {
                    Log.w(TAG, "cache read skipped: insufficient memory");
                }
            }

            // A miss can still have a cached window later in the file. Bound
            // the Drive request at that window so the response can switch back
            // to disk instead of downloading through already cached bytes.
            if (cacheEligible && cached == null) {
                CachedWindow nextCached = findNextCachedWindowAnyTotal(fileId, requestedStart);
                if (nextCached != null) {
                    try {
                        if (serveGapUntilCache(fileId, requestedStart, nextCached, out)) {
                            return;
                        }
                    } catch (IOException | RuntimeException e) {
                        Log.w(TAG, "bounded cache gap skipped: " + e.getMessage());
                    } catch (OutOfMemoryError e) {
                        Log.w(TAG, "bounded cache gap skipped: insufficient memory");
                    }
                }
            }

            if (!headOnly) {
                String reason = cacheEligible
                        ? (cached == null ? "cache-miss" : "cache-unavailable")
                        : (isBoundedRange(range) ? "bounded-range" : "no-cacheable-range");
                Log.d(TAG, "timing proxy:cache-gap-drive-stream file=" + fileId
                        + " from=" + (requestedStart == null ? 0 : requestedStart)
                        + " to=unknown reason=" + reason);
            }

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
            long bytesServed = 0;
            long cacheTotal = requestedStart == null ? -1
                    : parseContentTotal(contentRange, length, requestedStart);
            long cacheChunkStart = requestedStart == null ? 0 : requestedStart;
            long storedBytes = 0;
            boolean driveReadComplete = false;
            ByteArrayOutputStream capture = requestedStart != null && cacheTotal > 0
                    ? new ByteArrayOutputStream(64 * 1024)
                    : null;
            try {
                int read;
                while ((read = body.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    bytesServed += read;
                    if (capture != null) {
                        int captured = 0;
                        while (captured < read && capture != null) {
                            int chunk = Math.min(read - captured,
                                    METADATA_CACHE_BYTES - capture.size());
                            try {
                                capture.write(buffer, captured, chunk);
                            } catch (OutOfMemoryError e) {
                                capture = null;
                                Log.w(TAG, "cache capture skipped: insufficient memory");
                                break;
                            }
                            captured += chunk;
                            if (capture.size() == METADATA_CACHE_BYTES) {
                                storedBytes += storeCacheChunk(fileId, cacheChunkStart, cacheTotal,
                                        type, capture, "drive");
                                cacheChunkStart += capture.size();
                                capture.reset();
                            }
                        }
                    }
                }
                driveReadComplete = true;
            } finally {
                if (capture != null && capture.size() > 0) {
                    storedBytes += storeCacheChunk(fileId, cacheChunkStart, cacheTotal,
                            type, capture, "drive");
                }
                Log.d(TAG, "timing proxy:drive-end file=" + fileId
                        + " from=" + (requestedStart == null ? 0 : requestedStart)
                        + " bytes=" + bytesServed
                        + " storedBytes=" + storedBytes
                        + " status=" + (driveReadComplete ? "complete" : "interrupted"));
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
