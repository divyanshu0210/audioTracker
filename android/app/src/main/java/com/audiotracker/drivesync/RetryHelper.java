package com.audiotracker.drivesync;

import android.util.Log;

/**
 * Mirrors the JS retry() helper:
 *   - up to {@code maxAttempts} tries
 *   - exponential back-off: 2^i * 1000 ms + random jitter up to 300 ms
 *   - non-retriable if HTTP 4xx (except 429)
 */
public class RetryHelper {

    private static final String TAG = "BackupDebug";

    public interface Task<T> {
        T run() throws Exception;
    }

    public static <T> T retry(Task<T> task, int maxAttempts) throws Exception {
        Exception lastError = null;

        for (int i = 0; i < maxAttempts; i++) {
            try {
                return task.run();
            } catch (DriveApiHelper.DriveException de) {
                lastError = de;

                int status = de.httpStatus;

                // Non-retriable: client errors except rate-limit
                if (status >= 400 && status < 500 && status != 429) {
                    Log.e(TAG, "[RETRY] Non-retriable HTTP " + status + ", aborting");
                    throw de;
                }

                long delay = (long) (Math.pow(2, i) * 1000) + (long) (Math.random() * 300);
                Log.w(TAG, "[RETRY] Attempt " + (i + 1) + " failed (HTTP " + status
                        + "). Retrying in " + delay + "ms");
                Thread.sleep(delay);

            } catch (Exception e) {
                lastError = e;

                long delay = (long) (Math.pow(2, i) * 1000) + (long) (Math.random() * 300);
                Log.w(TAG, "[RETRY] Attempt " + (i + 1) + " failed. Retrying in " + delay + "ms");
                Thread.sleep(delay);
            }
        }

        Log.e(TAG, "[RETRY] All " + maxAttempts + " attempts failed");
        throw lastError;
    }

    /** Convenience overload — defaults to 3 attempts (same as JS). */
    public static <T> T retry(Task<T> task) throws Exception {
        return retry(task, 3);
    }
}