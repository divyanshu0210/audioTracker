package com.audiotracker;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.content.ContentResolver;
import android.webkit.MimeTypeMap;

import com.facebook.react.bridge.*;

public class FileMetaModule extends ReactContextBaseJavaModule {

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
