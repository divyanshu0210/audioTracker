package com.audiotracker.bridge;

import android.content.Context;
import android.util.Log;

import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class ReactEmitter {

    private static final String TAG = "BackupDebug";

    public static void emit( Context context, String eventName, WritableMap data) {

        try {
            ReactApplication reactApplication = (ReactApplication)  context.getApplicationContext();

            ReactInstanceManager manager =
                    reactApplication
                            .getReactNativeHost()
                            .getReactInstanceManager();

            ReactContext reactContext = manager.getCurrentReactContext();

            if (reactContext != null) {

                reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit(eventName, data);

                Log.d(TAG, "Event emitted: " + eventName);

            } else {

                Log.w(TAG, "React context NOT active → event dropped: " + eventName);
            }

        } catch (Exception e) {
            Log.e(TAG, "Emit failed: " + eventName, e);
        }
    }
}