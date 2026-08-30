package com.audiotracker;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;

import com.facebook.react.bridge.*;

/**
 * JS bridge for Picture-in-Picture — see src/music/usePipMode.js.
 *
 * PiP keeps the activity *visible* in a small window rather than backgrounding
 * it. That matters for the YouTube path especially: the embed pauses itself
 * when its page becomes hidden, and in PiP it never does.
 */
public class PipModule extends ReactContextBaseJavaModule {

    public PipModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "PipModule";
    }

    @ReactMethod
    public void isSupported(Promise promise) {
        boolean supported =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        && getReactApplicationContext()
                                .getPackageManager()
                                .hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
        promise.resolve(supported);
    }

    /**
     * Arm/disarm automatic PiP entry. Called as playback starts and stops, so
     * that pressing Home only shrinks the app when a video is actually running.
     */
    @ReactMethod
    public void armPip(boolean enabled, int width, int height, Promise promise) {
        MainActivity activity = currentMainActivity();
        if (activity == null) {
            promise.resolve(false);
            return;
        }
        UiThreadUtil.runOnUiThread(() -> activity.armPip(enabled, width, height));
        promise.resolve(true);
    }

    /** Enter PiP right now — for an explicit in-app PiP button. */
    @ReactMethod
    public void enterPipMode(int width, int height, Promise promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            promise.resolve(false);
            return;
        }
        MainActivity activity = currentMainActivity();
        if (activity == null) {
            promise.resolve(false);
            return;
        }
        UiThreadUtil.runOnUiThread(() -> {
            activity.armPip(true, width, height);
            activity.enterPip();
        });
        promise.resolve(true);
    }

    private MainActivity currentMainActivity() {
        Activity activity = getCurrentActivity();
        return activity instanceof MainActivity ? (MainActivity) activity : null;
    }
}
