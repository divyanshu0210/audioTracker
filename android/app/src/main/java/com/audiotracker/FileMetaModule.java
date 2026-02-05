package com.audiotracker;

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
}
