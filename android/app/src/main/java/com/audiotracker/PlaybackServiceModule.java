package com.audiotracker;

import android.util.Log;

import com.facebook.react.bridge.*;

/**
 * JS bridge for PlaybackService — see src/backgroundService/playbackKeepAlive.js.
 */
public class PlaybackServiceModule extends ReactContextBaseJavaModule {

    private static final String TAG = "PlaybackService";

    public PlaybackServiceModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "PlaybackKeepAlive";
    }

    @ReactMethod
    public void start(String title, Promise promise) {
        try {
            PlaybackService.start(getReactApplicationContext(), title);
            promise.resolve(true);
        } catch (Exception e) {
            // Most likely ForegroundServiceStartNotAllowedException: the start
            // came from an already-backgrounded process. Not fatal — playback
            // continues, it just isn't protected from being reclaimed.
            Log.w(TAG, "start failed", e);
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void stop(Promise promise) {
        try {
            PlaybackService.stop(getReactApplicationContext());
            promise.resolve(true);
        } catch (Exception e) {
            Log.w(TAG, "stop failed", e);
            promise.resolve(false);
        }
    }
}
