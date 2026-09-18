package com.audiotracker;

import android.os.SystemClock;

/**
 * Keeps the cold-start splash on screen until JS has drawn something.
 *
 * The system splash lifts as soon as the activity's first frame is ready,
 * which for React Native is the empty root view — so without this the branded
 * splash would give way to a white rectangle for as long as the bundle takes
 * to load, which is the gap it exists to cover. Holding it until the login
 * screen has painted turns launch into one dark frame that never blinks.
 *
 * Released by {@link SplashModule#hide()}; see src/utils/splashScreen.js.
 */
public final class SplashGate {

    /**
     * How long the splash may be held with nothing heard from JS. The bundle
     * has never taken this long, so in practice it only matters when JS is
     * broken enough not to reach the call at all — and then a splash that
     * lifts onto a red box is far better than one that never lifts.
     */
    private static final long MAX_HOLD_MS = 4000L;

    /**
     * Fixed when the class first loads, which is the first draw pass of the
     * first activity in the process — exactly the moment the splash becomes
     * ours to hold.
     */
    private static final long DEADLINE_UPTIME_MS = SystemClock.uptimeMillis() + MAX_HOLD_MS;

    /**
     * Volatile because it is written from the JS thread and read from the UI
     * thread on every draw.
     */
    private static volatile boolean dismissed = false;

    private SplashGate() {}

    /** Idempotent: JS may call it again after an activity is recreated. */
    public static void dismiss() {
        dismissed = true;
    }

    /**
     * Once dismissed, stays dismissed for the life of the process. That is
     * what makes a warm start — activity recreated while the React instance
     * lives on — skip the hold: JS has already painted and is not going to
     * mount the login screen a second time to say so.
     */
    public static boolean shouldKeepOnScreen() {
        return !dismissed && SystemClock.uptimeMillis() < DEADLINE_UPTIME_MS;
    }
}
