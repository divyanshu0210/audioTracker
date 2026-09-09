package com.audiotracker.drivestream;

import android.accounts.Account;
import android.content.Context;
import android.util.Log;

import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.UserRecoverableAuthException;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;

import java.io.IOException;

/**
 * OAuth tokens for the streaming proxy.
 *
 * The proxy cannot ask the JS side for a token: it serves range requests while
 * the app is backgrounded and mid-seek, when the bridge may be idle or the
 * player screen gone. GoogleAuthUtil reads the same signed-in account the JS
 * GoogleSignin uses, caches the token itself, and can be told to drop a stale
 * one — which is the whole refresh story, see invalidate().
 */
final class DriveTokenProvider {

    private static final String TAG = "DriveStream";

    // Streaming reads files the user added by link, which the app did not
    // create — drive.file cannot see those. Both scopes are requested at
    // sign-in (see GoogleLoginScreen), but an account that granted only the
    // narrower one should still play its own uploads rather than fail outright.
    private static final String SCOPE_READONLY =
            "oauth2:https://www.googleapis.com/auth/drive.readonly";
    private static final String SCOPE_FILE =
            "oauth2:https://www.googleapis.com/auth/drive.file";

    private DriveTokenProvider() {}

    /** Blocking — callers must already be off the main thread. */
    static String get(Context context) throws IOException {
        GoogleSignInAccount signedIn = GoogleSignIn.getLastSignedInAccount(context);
        Account account = signedIn == null ? null : signedIn.getAccount();
        if (account == null) throw new IOException("No signed-in Google account");

        try {
            return GoogleAuthUtil.getToken(context, account, SCOPE_READONLY);
        } catch (UserRecoverableAuthException e) {
            Log.w(TAG, "drive.readonly not granted, falling back to drive.file");
            try {
                return GoogleAuthUtil.getToken(context, account, SCOPE_FILE);
            } catch (Exception inner) {
                throw new IOException("Could not get a Drive token", inner);
            }
        } catch (Exception e) {
            throw new IOException("Could not get a Drive token", e);
        }
    }

    /**
     * Drop a token Drive has rejected. The next get() then mints a fresh one —
     * without this, Play Services would keep handing back the same dead token
     * for the rest of its cache lifetime and every seek would 401.
     */
    static void invalidate(Context context, String token) {
        if (token == null) return;
        try {
            GoogleAuthUtil.clearToken(context, token);
        } catch (Exception e) {
            Log.w(TAG, "clearToken failed", e);
        }
    }
}
