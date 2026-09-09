package com.audiotracker.drivestream;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * JS bridge for DriveStreamServer - see src/music/driveStream.js.
 */
public class DriveStreamModule extends ReactContextBaseJavaModule {

    public DriveStreamModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "DriveStream";
    }

    /** Resolves the base url stream paths hang off, starting the server if needed. */
    @ReactMethod
    public void start(Promise promise) {
        try {
            promise.resolve(DriveStreamServer.getInstance(getReactApplicationContext()).start());
        } catch (Exception e) {
            promise.reject("drive_stream_start_failed", e);
        }
    }

    @ReactMethod
    public void stop(Promise promise) {
        try {
            DriveStreamServer.getInstance(getReactApplicationContext()).stop();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("drive_stream_stop_failed", e);
        }
    }

    @ReactMethod
    public void isRunning(Promise promise) {
        promise.resolve(DriveStreamServer.getInstance(getReactApplicationContext()).isRunning());
    }
}
