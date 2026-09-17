package com.audiotracker;

import android.content.ContentUris;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.content.ContentResolver;
import android.webkit.MimeTypeMap;

import com.facebook.react.bridge.*;

import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class FileMetaModule extends ReactContextBaseJavaModule {

    // Hashing a file reads all of it. On the native modules thread that would
    // block every other bridge call behind a multi-gigabyte video, so the work
    // that touches whole files gets its own pool.
    private final ExecutorService workers = Executors.newSingleThreadExecutor();

    private static final int HASH_BUFFER = 64 * 1024;

    // How much of a file is actually read to identify it, and from where.
    //
    // Interior windows, never the ends. An mp3 keeps ID3v2 at the front and
    // ID3v1 in the last 128 bytes, so a tag editor fixing a title — or a player
    // writing a play count — rewrites exactly the bytes a head-and-tail
    // fingerprint would look at, while the audio stays identical. Sampling from
    // the middle means the fingerprint follows the recording rather than its
    // labelling, which is the thing worth recognising.
    //
    // 3 x 256KB is under a megabyte for a file of any size. Reading a 2GB
    // lecture to the end to learn something these windows already settle is
    // battery spent for nothing.
    private static final int SAMPLE_BYTES = 256 * 1024;
    private static final double[] SAMPLE_POINTS = {0.25, 0.5, 0.75};

    // Small enough that sampling saves nothing: read all of it and be exact.
    private static final long FULL_HASH_LIMIT = 4L * SAMPLE_BYTES;

    // Stamped on every hash so the scheme can change later without the new
    // hashes silently failing to match the old ones. A stored hash that does
    // not start with this was taken a different way and is not comparable.
    private static final String HASH_SCHEME = "s1:";

    // A file has to be this kind of thing before MediaStore has an answer for
    // it, and before hashing is worth the read.
    private static final int MAX_HASH_CANDIDATES = 8;

    public FileMetaModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "FileMeta";
    }

    @ReactMethod
    public void getMeta(String uriString, Promise promise) {
        try {
            Uri uri = Uri.parse(uriString);
            ContentResolver resolver = getReactApplicationContext().getContentResolver();

            String name = null;
            String mime = resolver.getType(uri);

            Cursor returnCursor = resolver.query(uri, null, null, null, null);
            if (returnCursor != null) {
                int nameIndex = returnCursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIndex != -1 && returnCursor.moveToFirst()) {
                    name = returnCursor.getString(nameIndex);
                }
                returnCursor.close();
            }

            if (name == null) {
                name = "file_" + System.currentTimeMillis();
            }

            WritableMap result = Arguments.createMap();
            result.putString("name", name);
            result.putString("mime", mime != null ? mime : "application/octet-stream");
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("META_ERROR", "Failed to get file metadata", e);
        }
    }

    /**
     * Tries to keep read access to a uri for good, and says whether it worked.
     *
     * A uri arriving on an intent — "open with", or a share from another app —
     * comes with permission that dies when the task does. Android will make
     * that permanent only if the sender attached
     * FLAG_GRANT_PERSISTABLE_URI_PERMISSION, which a document picker's result
     * always carries and an ordinary share usually does not.
     *
     * There is no way to ask in advance: takePersistableUriPermission either
     * succeeds or throws SecurityException, so trying it *is* the question.
     * Answering false rather than rejecting, because every caller is choosing
     * between referencing the file and copying it, and "no" is a perfectly
     * good answer to that.
     *
     * Worth asking at all because the alternative is copying the whole file.
     * Android caps how many of these an app may hold, so this is only called
     * where the row is one the user is actually keeping.
     */
    @ReactMethod
    public void takePersistableAccess(String uriString, Promise promise) {
        try {
            Uri uri = Uri.parse(uriString);
            getReactApplicationContext()
                    .getContentResolver()
                    .takePersistableUriPermission(
                            uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            promise.resolve(true);
        } catch (SecurityException e) {
            // The sender never offered a lasting grant. Expected, not a fault.
            promise.resolve(false);
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    /**
     * Everything cheap that is known about a file, for recognising it later.
     *
     * Deliberately no hash: this runs on every import, and reading a 2GB video
     * to the end before the user can play it would be a poor trade for
     * something only needed once the file goes missing. Size and duration come
     * from the provider's own index, so this costs a query.
     *
     * The size is the part that matters most. It is what makes finding the file
     * again cheap — MediaStore can be asked for rows of exactly this length,
     * and only those few candidates ever need hashing.
     */
    @ReactMethod
    public void readIdentity(String uriString, Promise promise) {
        Cursor cursor = null;
        try {
            Uri uri = Uri.parse(uriString);
            ContentResolver resolver = getReactApplicationContext().getContentResolver();

            WritableMap out = Arguments.createMap();
            out.putString("mimeType", resolver.getType(uri));

            cursor = resolver.query(uri, null, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIndex != -1) {
                    out.putString("displayName", cursor.getString(nameIndex));
                }
                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (sizeIndex != -1 && !cursor.isNull(sizeIndex)) {
                    out.putDouble("size", cursor.getLong(sizeIndex));
                }
                // Present only on a MediaStore uri. Worth keeping when it is:
                // a rename through MediaStore leaves the id alone, so it finds
                // the file again without reading a byte.
                int idIndex = cursor.getColumnIndex(MediaStore.MediaColumns._ID);
                if (idIndex != -1 && !cursor.isNull(idIndex)) {
                    out.putDouble("mediaStoreId", cursor.getLong(idIndex));
                }
                // Only a MediaStore uri carries this; a document provider's
                // cursor has no such column and the index comes back -1.
                int durationIndex = cursor.getColumnIndex(MediaStore.MediaColumns.DURATION);
                if (durationIndex != -1 && !cursor.isNull(durationIndex)) {
                    out.putDouble("durationMs", cursor.getLong(durationIndex));
                }
                int modifiedIndex = cursor.getColumnIndex(MediaStore.MediaColumns.DATE_MODIFIED);
                if (modifiedIndex != -1 && !cursor.isNull(modifiedIndex)) {
                    out.putDouble("modifiedAt", cursor.getLong(modifiedIndex));
                }
            }

            promise.resolve(out);
        } catch (Exception e) {
            promise.reject("IDENTITY_ERROR", "Could not read file identity", e);
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
    }

    /**
     * The SHA-256 of a file's bytes, as lowercase hex.
     *
     * The whole file, not a sample of its ends. For an mp3 those ends are the
     * least stable part of it — ID3v2 sits at the front and ID3v1 in the last
     * 128 bytes — so a player writing a play count or a tag editor fixing a
     * title would change a head-and-tail fingerprint while the audio stayed
     * byte for byte identical. That is a false negative: the app would decide
     * its own file was a different one and stop recognising it.
     *
     * Costs a full read, so nothing calls this on the import path. It is for
     * filling in identities in the background and for confirming a candidate
     * that already matched on size.
     */
    @ReactMethod
    public void hashFile(String uriString, Promise promise) {
        workers.execute(() -> {
            try {
                promise.resolve(fingerprint(Uri.parse(uriString)));
            } catch (Exception e) {
                // Unreadable, revoked, gone. The caller treats a null as "no
                // identity yet" and tries again another time.
                promise.resolve(null);
            }
        });
    }

    /**
     * Finds a file again by what it contains rather than by where it was.
     *
     * The repair at the heart of this: a uri stops working when the file is
     * moved, renamed, or re-created by a file manager that copies and deletes
     * rather than renaming. The bytes are still on the phone, under a new
     * address, and MediaStore knows where.
     *
     * Size does the filtering and the hash does the deciding. Asking MediaStore
     * for rows of exactly this many bytes usually returns nothing or one thing,
     * so the expensive part runs on a handful of candidates at most — and never
     * on a whole library. Anything past MAX_HASH_CANDIDATES is left alone
     * rather than read: a size that common is not evidence, and the user's
     * battery is not worth a guess.
     *
     * Only an exact hash match is accepted. Binding the wrong file to someone's
     * notes and watch history is the one outcome worth any amount of caution.
     */
    @ReactMethod
    public void findByContentHash(
            String expectedHash,
            double size,
            double durationMs,
            String mimeType,
            Promise promise) {
        workers.execute(() -> {
            Cursor cursor = null;
            try {
                if (expectedHash == null || size <= 0) {
                    promise.resolve(null);
                    return;
                }

                Uri collection = collectionFor(mimeType);
                if (collection == null) {
                    promise.resolve(null);
                    return;
                }

                // Size and duration both, when duration is known. They fail
                // independently — a re-encode keeps the running time and
                // changes the length, a truncation does the reverse — so
                // together they throw out candidates that either alone would
                // have kept, before a single byte is read.
                //
                // A second of tolerance because the number depends on who
                // parsed the file: the media scanner and the player do not
                // always agree to the millisecond on a VBR mp3.
                String selection = MediaStore.MediaColumns.SIZE + " = ?";
                String[] args = new String[] {String.valueOf((long) size)};

                if (durationMs > 0) {
                    selection += " AND " + MediaStore.MediaColumns.DURATION + " BETWEEN ? AND ?";
                    args = new String[] {
                            String.valueOf((long) size),
                            String.valueOf((long) durationMs - 1000),
                            String.valueOf((long) durationMs + 1000),
                    };
                }

                ContentResolver resolver = getReactApplicationContext().getContentResolver();
                cursor = resolver.query(
                        collection,
                        new String[] {MediaStore.MediaColumns._ID},
                        selection,
                        args,
                        null);

                if (cursor == null || cursor.getCount() > MAX_HASH_CANDIDATES) {
                    promise.resolve(null);
                    return;
                }

                while (cursor.moveToNext()) {
                    Uri candidate = ContentUris.withAppendedId(collection, cursor.getLong(0));
                    try {
                        if (expectedHash.equals(fingerprint(candidate))) {
                            promise.resolve(candidate.toString());
                            return;
                        }
                    } catch (Exception ignored) {
                        // One unreadable candidate says nothing about the rest.
                    }
                }

                promise.resolve(null);
            } catch (Exception e) {
                promise.resolve(null);
            } finally {
                if (cursor != null) {
                    cursor.close();
                }
            }
        });
    }

    /** The MediaStore collection a mime type lives in, or null if neither. */
    private static Uri collectionFor(String mimeType) {
        if (mimeType == null) return null;
        if (mimeType.startsWith("audio/")) return MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        if (mimeType.startsWith("video/")) return MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
        return null;
    }

    /**
     * What a file is, as a short string: its length plus three windows of its
     * middle, digested together.
     *
     * The length goes into the digest rather than beside it so that two files
     * cannot agree just by having similar interiors — a shorter file that
     * happens to contain the same audio somewhere has a different fingerprint,
     * because it has a different size.
     *
     * Null when the file cannot be read, or cannot be measured. Both mean the
     * same thing to the caller: no identity was taken, try again later.
     */
    private String fingerprint(Uri uri) throws Exception {
        ContentResolver resolver = getReactApplicationContext().getContentResolver();

        ParcelFileDescriptor pfd = resolver.openFileDescriptor(uri, "r");
        if (pfd == null) return null;

        FileInputStream in = null;
        try {
            long total = pfd.getStatSize();
            if (total <= 0) return null;

            in = new FileInputStream(pfd.getFileDescriptor());
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(Long.toString(total).getBytes(StandardCharsets.UTF_8));

            byte[] buffer = new byte[HASH_BUFFER];

            if (total <= FULL_HASH_LIMIT) {
                int read;
                while ((read = in.read(buffer)) != -1) {
                    digest.update(buffer, 0, read);
                }
            } else {
                for (double point : SAMPLE_POINTS) {
                    long offset = (long) (total * point);
                    // Seeking the descriptor, so the windows cost what they
                    // contain rather than what precedes them.
                    in.getChannel().position(offset);

                    long remaining = Math.min(SAMPLE_BYTES, total - offset);
                    while (remaining > 0) {
                        int want = (int) Math.min(buffer.length, remaining);
                        int read = in.read(buffer, 0, want);
                        if (read == -1) break;
                        digest.update(buffer, 0, read);
                        remaining -= read;
                    }
                }
            }

            StringBuilder hex = new StringBuilder(70);
            hex.append(HASH_SCHEME);
            for (byte b : digest.digest()) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } finally {
            closeQuietly(in);
            try {
                pfd.close();
            } catch (Exception ignored) {
            }
        }
    }

    private static void closeQuietly(InputStream in) {
        if (in == null) return;
        try {
            in.close();
        } catch (Exception ignored) {
        }
    }

    /**
     * Finds the same file in MediaStore and returns its uri, or null.
     *
     * The way to keep a file without copying it when a persistable grant is not
     * on offer, which is most of the time outside the document picker. A
     * MediaStore uri is not read through a per-file grant at all — it is read
     * on the strength of READ_MEDIA_AUDIO / READ_MEDIA_VIDEO, so it survives a
     * restart, and it survives the app that shared it being uninstalled.
     *
     * Matched on display name and exact byte count together, and refused when
     * more than one row matches: picking between two indistinguishable files
     * would mean silently binding the wrong bytes to the user's notes.
     *
     * The match is proven by opening it rather than assumed, because the
     * permission may not have been granted and finding that out here costs one
     * descriptor where finding out later costs a file that will not play.
     */
    @ReactMethod
    public void resolveMediaStoreUri(String uriString, Promise promise) {
        Cursor source = null;
        Cursor match = null;
        try {
            Uri uri = Uri.parse(uriString);
            ContentResolver resolver = getReactApplicationContext().getContentResolver();

            String name = null;
            long size = -1;

            source = resolver.query(uri, null, null, null, null);
            if (source != null && source.moveToFirst()) {
                int nameIndex = source.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIndex != -1) {
                    name = source.getString(nameIndex);
                }
                int sizeIndex = source.getColumnIndex(OpenableColumns.SIZE);
                if (sizeIndex != -1 && !source.isNull(sizeIndex)) {
                    size = source.getLong(sizeIndex);
                }
            }

            if (name == null || size < 0) {
                promise.resolve(null);
                return;
            }

            Uri collection = collectionFor(resolver.getType(uri));
            if (collection == null) {
                promise.resolve(null);
                return;
            }

            match = resolver.query(
                    collection,
                    new String[] {MediaStore.MediaColumns._ID},
                    MediaStore.MediaColumns.DISPLAY_NAME + " = ? AND "
                            + MediaStore.MediaColumns.SIZE + " = ?",
                    new String[] {name, String.valueOf(size)},
                    null);

            if (match == null || match.getCount() != 1 || !match.moveToFirst()) {
                promise.resolve(null);
                return;
            }

            Uri resolved = ContentUris.withAppendedId(collection, match.getLong(0));

            ParcelFileDescriptor pfd = resolver.openFileDescriptor(resolved, "r");
            if (pfd == null) {
                promise.resolve(null);
                return;
            }
            pfd.close();

            promise.resolve(resolved.toString());
        } catch (Exception e) {
            // No match, no permission, nothing openable: all the same answer,
            // which is that this file cannot be kept by reference.
            promise.resolve(null);
        } finally {
            if (source != null) {
                source.close();
            }
            if (match != null) {
                match.close();
            }
        }
    }

    /**
     * Whether a content:// uri can still be read: the grant is alive, and the
     * document behind it is still there.
     *
     * An imported file is normally left where the user keeps it now, with the
     * row holding its uri rather than a path to a copy (see resolveImportPath
     * in src/Linking/utils/handleLinkSubmit.js). RNFS cannot stat a uri, so
     * every place that asked "are the bytes there?" with RNFS.exists would
     * answer no for all of them - emptying the Device list and putting the
     * unavailable screen in front of files that play perfectly well.
     *
     * Queried rather than opened. openFileDescriptor is the more honest test,
     * but a provider backed by the network would fetch to answer it, and this
     * runs over every device file each time the list is rebuilt. The query is
     * answered from the provider's own index instead.
     */
    @ReactMethod
    public void isReadable(String uriString, Promise promise) {
        Cursor cursor = null;
        try {
            Uri uri = Uri.parse(uriString);
            ContentResolver resolver = getReactApplicationContext().getContentResolver();
            cursor = resolver.query(uri, null, null, null, null);
            promise.resolve(cursor != null && cursor.moveToFirst());
        } catch (SecurityException e) {
            // The grant is gone - the user cleared the app's access, or the
            // file was picked back when the app only took a one-session one.
            // Unreadable, but not a failure worth rejecting over: the caller
            // wants a yes or no, and every caller treats a rejection as a
            // crash rather than as "missing".
            promise.resolve(false);
        } catch (Exception e) {
            promise.resolve(false);
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
    }
}
