package com.audiotracker;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * JS bridge for the cold-start splash — see src/utils/splashScreen.js.
 *
 * One method, and deliberately fire-and-forget: JS has nothing to do with the
 * answer, and making the call await a promise would put the release a round
 * trip later than the frame it is meant to coincide with.
 */
public class SplashModule extends ReactContextBaseJavaModule {

    public SplashModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "SplashModule";
    }

    /** Lets the splash lift on the next draw. */
    @ReactMethod
    public void hide() {
        SplashGate.dismiss();
    }
}
