package com.audiotracker;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.view.OrientationEventListener;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/** Controls the Activity orientation for the media player's two size modes. */
public class OrientationModule extends ReactContextBaseJavaModule {
    private OrientationEventListener portraitListener;

    public OrientationModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "OrientationModule";
    }

    @ReactMethod
    public void lockPortrait() {
        runOnActivity(activity -> {
            activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

            // Keep the forced portrait only until the device is physically in
            // portrait. Once released, a later landscape rotation can reach
            // BacePlayer's window-size effect and maximize the player again.
            if (portraitListener != null) {
                portraitListener.disable();
            }
            portraitListener = new OrientationEventListener(activity) {
                @Override
                public void onOrientationChanged(int orientation) {
                    if (orientation == ORIENTATION_UNKNOWN) {
                        return;
                    }
                    boolean isPortrait = orientation < 45
                            || orientation >= 315
                            || (orientation >= 135 && orientation < 225);
                    if (isPortrait) {
                        disable();
                        portraitListener = null;
                        activity.setRequestedOrientation(
                                ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                    }
                }
            };
            if (portraitListener.canDetectOrientation()) {
                portraitListener.enable();
            }
        });
    }

    @ReactMethod
    public void unlock() {
        runOnActivity(activity -> {
            if (portraitListener != null) {
                portraitListener.disable();
                portraitListener = null;
            }
            activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        });
    }

    private void runOnActivity(ActivityAction action) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            return;
        }
        activity.runOnUiThread(() -> action.run(activity));
    }

    private interface ActivityAction {
        void run(Activity activity);
    }
}
