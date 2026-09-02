package com.audiotracker;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.text.TextUtils;
import android.util.Log;

import androidx.annotation.NonNull;

import com.audiotracker.bridge.ReactEmitter;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.util.ArrayList;
import java.util.List;

/**
 * The file picker for importing device media.
 *
 * react-native-document-picker was doing this job and fails on OEM builds
 * (OnePlus/Oppo are the reported ones) in two ways this module exists to avoid:
 *
 *  1. It fires ACTION_GET_CONTENT with setType(mimeTypes.join("|")), i.e. the
 *     type "audio/*|video/*", which is not a MIME type. AOSP's DocumentsUI
 *     ignores the type when EXTRA_MIME_TYPES is set; an OEM picker registered
 *     for GET_CONTENT that resolves on the type instead may not match at all,
 *     or may hand the intent to an activity in its own task -- and a result
 *     from another task comes straight back as RESULT_CANCELED, before the user
 *     has picked anything. ACTION_OPEN_DOCUMENT goes to the system document
 *     picker and honours EXTRA_MIME_TYPES properly.
 *
 *  2. Its result listener drops the selection when no JS promise is waiting
 *     ("promise was null in onActivityResult"), which is exactly what happens
 *     when the OS kills the app while the picker is in front -- routine on
 *     aggressively memory-managed ROMs. The result still arrives at the
 *     recreated MainActivity, so it is stashed here (with a persistable read
 *     grant, which GET_CONTENT cannot give) and handed to JS on the next
 *     launch instead of vanishing.
 *
 * No runtime permission is involved anywhere in this: the picker is the system
 * granting access to one file at a time.
 */
public class MediaPickerModule extends ReactContextBaseJavaModule {
  public static final String NAME = "MediaPicker";
  private static final String TAG = NAME;

  /** Ours alone; react-native-document-picker uses 41/42. */
  public static final int REQUEST_CODE = 4713;

  private static final String PREFS = "media_picker";
  private static final String KEY_PENDING = "pending_uris";
  private static final String SEPARATOR = "\n";

  private static final String EVENT_PENDING = "mediaPickerPendingFiles";

  private static final String E_NO_ACTIVITY = "ACTIVITY_DOES_NOT_EXIST";
  private static final String E_IN_PROGRESS = "ASYNC_OP_IN_PROGRESS";
  private static final String E_CANCELED = "PICKER_CANCELED";
  private static final String E_FAILED_TO_SHOW = "FAILED_TO_SHOW_PICKER";

  // Static because the result can outlive the module: a JS reload replaces the
  // module while the picker is still up, and the delivery path below runs from
  // the activity either way.
  private static Promise pendingPromise;

  public MediaPickerModule(ReactApplicationContext reactContext) {
    super(reactContext);
    // Logged unconditionally: "is the new binary actually on the phone" is the
    // first question every report about this picker runs into.
    Log.i(TAG, "ready");
  }

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  // -- Picking ---------------------------------------------------------------

  @ReactMethod
  public void pick(Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.reject(E_NO_ACTIVITY, "Current activity does not exist");
      return;
    }
    if (pendingPromise != null) {
      // A second tap while the first picker is still opening.
      promise.reject(E_IN_PROGRESS, "A file picker is already open");
      return;
    }

    pendingPromise = promise;
    try {
      Log.i(TAG, "opening ACTION_OPEN_DOCUMENT");
      activity.startActivityForResult(buildIntent(Intent.ACTION_OPEN_DOCUMENT), REQUEST_CODE);
    } catch (ActivityNotFoundException e) {
      // Stripped ROMs without DocumentsUI. GET_CONTENT is the older, wider
      // contract -- any gallery or file manager can serve it.
      Log.w(TAG, "No ACTION_OPEN_DOCUMENT handler, falling back to ACTION_GET_CONTENT", e);
      try {
        activity.startActivityForResult(buildIntent(Intent.ACTION_GET_CONTENT), REQUEST_CODE);
      } catch (Exception fallbackError) {
        pendingPromise = null;
        promise.reject(E_FAILED_TO_SHOW, describeError(fallbackError), fallbackError);
      }
    } catch (Exception e) {
      pendingPromise = null;
      promise.reject(E_FAILED_TO_SHOW, describeError(e), e);
    }
  }

  private Intent buildIntent(String action) {
    Intent intent = new Intent(action);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    // "*/*" plus EXTRA_MIME_TYPES is the combination every picker understands:
    // the type is what the intent resolves on, the extra is what it filters on.
    intent.setType("*/*");
    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {"audio/*", "video/*"});
    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    // Only ever taken in the stash path below, but it has to be asked for here.
    intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
    return intent;
  }

  /**
   * Called from MainActivity rather than through an ActivityEventListener: when
   * the app was killed while the picker was in front, the result arrives before
   * the React context exists, and a listener registered by a module that hasn't
   * been created yet would never see it.
   */
  public static void handleActivityResult(Context context, int resultCode, Intent data) {
    Promise promise = pendingPromise;
    pendingPromise = null;

    Log.i(
        TAG,
        "activity result: resultCode=" + resultCode + ", waiting=" + (promise != null));

    if (resultCode != Activity.RESULT_OK) {
      if (promise != null) {
        promise.reject(E_CANCELED, "Picker closed with result code " + resultCode);
      }
      return;
    }

    List<Uri> uris = extractUris(data);
    Log.i(TAG, "picked " + uris.size() + " file(s)");
    if (uris.isEmpty()) {
      if (promise != null) {
        promise.resolve(Arguments.createArray());
      }
      return;
    }

    // Reading the display name and size of each selection is a content-provider
    // query apiece, and this runs on the UI thread the moment the picker closes.
    // A large multi-select would be felt there.
    final Context appContext = context.getApplicationContext();
    final Promise resultPromise = promise;
    new Thread(() -> deliver(appContext, uris, resultPromise), "MediaPickerResult").start();
  }

  private static void deliver(Context context, List<Uri> uris, Promise promise) {
    if (promise != null) {
      try {
        promise.resolve(describe(context, uris));
        Log.i(TAG, "handed " + uris.size() + " file(s) to JS");
        return;
      } catch (RuntimeException e) {
        // The JS side went away between the launch and the result (a reload, or
        // a context torn down under us). Fall through and keep the selection.
        Log.w(TAG, "Could not resolve the pick promise, stashing instead", e);
      }
    }

    Log.w(
        TAG,
        "Picked " + uris.size() + " file(s) with no JS waiting -- the app was"
            + " restarted while the picker was open. Stashing for the next launch.");
    for (Uri uri : uris) {
      takePersistablePermission(context, uri);
    }
    stashPending(context, uris);
    // If JS is already back up, it can take them right now.
    ReactEmitter.emit(context, EVENT_PENDING, Arguments.createMap());
  }

  private static List<Uri> extractUris(Intent data) {
    List<Uri> uris = new ArrayList<>();
    if (data == null) {
      return uris;
    }
    ClipData clipData = data.getClipData();
    // ClipData first: a multi-select carries the whole selection there, and
    // getData() is then either null or only the first of them.
    if (clipData != null && clipData.getItemCount() > 0) {
      for (int i = 0; i < clipData.getItemCount(); i++) {
        Uri uri = clipData.getItemAt(i).getUri();
        if (uri != null) {
          uris.add(uri);
        }
      }
    } else if (data.getData() != null) {
      uris.add(data.getData());
    }
    return uris;
  }

  // -- Results ---------------------------------------------------------------

  private static WritableArray describe(Context context, List<Uri> uris) {
    WritableArray results = Arguments.createArray();
    for (Uri uri : uris) {
      results.pushMap(describeOne(context, uri));
    }
    return results;
  }

  private static WritableMap describeOne(Context context, Uri uri) {
    WritableMap map = Arguments.createMap();
    map.putString("uri", uri.toString());

    ContentResolver resolver = context.getContentResolver();
    String type = null;
    try {
      type = resolver.getType(uri);
    } catch (Exception e) {
      Log.w(TAG, "No type for " + uri, e);
    }
    map.putString("type", type);

    String name = null;
    Double size = null;
    try (Cursor cursor = resolver.query(uri, null, null, null, null)) {
      if (cursor != null && cursor.moveToFirst()) {
        int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        if (nameIndex != -1 && !cursor.isNull(nameIndex)) {
          name = cursor.getString(nameIndex);
        }
        int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
        if (sizeIndex != -1 && !cursor.isNull(sizeIndex)) {
          size = (double) cursor.getLong(sizeIndex);
        }
      }
    } catch (Exception e) {
      Log.w(TAG, "Could not read metadata for " + uri, e);
    }

    if (name == null) {
      name = uri.getLastPathSegment();
    }
    map.putString("name", name);
    if (size == null) {
      map.putNull("size");
    } else {
      map.putDouble("size", size);
    }
    return map;
  }

  // -- Selections that outlived the process ----------------------------------

  @ReactMethod
  public void consumePendingPick(Promise promise) {
    Context context = getReactApplicationContext();
    try {
      List<Uri> uris = readPending(context);
      Log.i(TAG, "consumePendingPick: " + uris.size() + " stashed file(s)");
      clearPending(context);
      promise.resolve(describe(context, uris));
    } catch (Exception e) {
      promise.reject("PENDING_PICK_FAILED", describeError(e), e);
    }
  }

  /**
   * Called once JS has copied the bytes out. The persisted grants are a small
   * per-app table (Android caps it), so they are not left lying around.
   */
  @ReactMethod
  public void releaseUris(ReadableArray uris, Promise promise) {
    ContentResolver resolver = getReactApplicationContext().getContentResolver();
    for (int i = 0; i < uris.size(); i++) {
      String uri = uris.getString(i);
      if (uri == null) {
        continue;
      }
      try {
        resolver.releasePersistableUriPermission(
            Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION);
      } catch (Exception e) {
        // Never taken in the first place (the ordinary path takes none), or
        // already gone. Either way there is nothing to release.
        Log.d(TAG, "Nothing to release for " + uri);
      }
    }
    promise.resolve(null);
  }

  private static void takePersistablePermission(Context context, Uri uri) {
    try {
      context
          .getContentResolver()
          .takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
    } catch (Exception e) {
      // GET_CONTENT grants are never persistable, and some providers refuse.
      // The stash is still worth keeping: the grant often outlives the pick
      // anyway, and a failed read is reported to the user as such.
      Log.w(TAG, "Could not persist read access to " + uri, e);
    }
  }

  private static SharedPreferences prefs(Context context) {
    return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  private static void stashPending(Context context, List<Uri> uris) {
    List<String> all = new ArrayList<>();
    for (Uri uri : readPending(context)) {
      all.add(uri.toString());
    }
    for (Uri uri : uris) {
      String value = uri.toString();
      if (!all.contains(value)) {
        all.add(value);
      }
    }
    prefs(context).edit().putString(KEY_PENDING, TextUtils.join(SEPARATOR, all)).apply();
  }

  private static List<Uri> readPending(Context context) {
    List<Uri> uris = new ArrayList<>();
    String stored = prefs(context).getString(KEY_PENDING, null);
    if (stored == null || stored.isEmpty()) {
      return uris;
    }
    for (String value : stored.split(SEPARATOR)) {
      if (!value.isEmpty()) {
        uris.add(Uri.parse(value));
      }
    }
    return uris;
  }

  private static void clearPending(Context context) {
    prefs(context).edit().remove(KEY_PENDING).apply();
  }

  private static String describeError(Exception e) {
    String message = e.getLocalizedMessage();
    return message != null ? message : e.getClass().getSimpleName();
  }
}
