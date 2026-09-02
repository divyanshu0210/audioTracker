package com.audiotracker

import android.app.PictureInPictureParams
import android.content.Intent
import android.content.res.Configuration
import android.os.Build
import android.util.Log
import android.util.Rational
import androidx.annotation.RequiresApi
import com.audiotracker.bridge.ReactEmitter
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.Arguments
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "audioTracker"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  // The media picker's result is taken here rather than through a React
  // ActivityEventListener. When Android kills the app while the picker is in
  // front - routine on aggressively memory-managed ROMs, and the reason a
  // selection could come back to nothing at all - this result arrives at the
  // recreated activity before the React context exists, so a listener owned by
  // a module that has not been created yet would never see it. MediaPickerModule
  // stashes the selection in that case and hands it over once JS is up.
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == MediaPickerModule.REQUEST_CODE) {
      MediaPickerModule.handleActivityResult(this, resultCode, data)
    }
  }

  // ── Picture-in-Picture ──────────────────────────────────────────────────────
  //
  // Armed from JS (PipModule) only while a video is actually playing. Without
  // that gate, leaving *any* screen would shrink the whole app into a PiP
  // window, which is not what anyone wants when they press Home on the notes
  // list.

  private var pipArmed = false
  private var pipAspectWidth = 16
  private var pipAspectHeight = 9

  /** Called from PipModule on the UI thread. */
  fun armPip(enabled: Boolean, width: Int, height: Int) {
    pipArmed = enabled
    if (width > 0 && height > 0) {
      pipAspectWidth = width
      pipAspectHeight = height
    }
    // API 31+ can enter PiP on its own, including for the swipe-up gesture that
    // never delivers onUserLeaveHint. Push the params so the system knows.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        setPictureInPictureParams(buildPipParams())
      } catch (e: Exception) {
        Log.w(TAG, "setPictureInPictureParams failed", e)
      }
    }
  }

  /**
   * Home button / app-switcher. On API 31+ this is redundant with
   * setAutoEnterEnabled, but it is the only hook available on 26–30.
   */
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (pipArmed &&
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        !isInPictureInPictureMode) {
      enterPip()
    }
  }

  @RequiresApi(Build.VERSION_CODES.O)
  fun enterPip(): Boolean =
      try {
        enterPictureInPictureMode(buildPipParams())
      } catch (e: Exception) {
        // Thrown when the activity isn't in a state that permits PiP (e.g.
        // already stopped). Not fatal — the app just backgrounds normally.
        Log.w(TAG, "enterPictureInPictureMode failed", e)
        false
      }

  @RequiresApi(Build.VERSION_CODES.O)
  private fun buildPipParams(): PictureInPictureParams {
    val builder = PictureInPictureParams.Builder()

    // Android rejects any ratio outside 1:2.39 … 2.39:1 with an
    // IllegalArgumentException, so clamp rather than trust the caller.
    val raw = pipAspectWidth.toFloat() / pipAspectHeight.toFloat()
    val clamped = raw.coerceIn(0.42f, 2.39f)
    builder.setAspectRatio(Rational((clamped * 1000).toInt(), 1000))

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setAutoEnterEnabled(pipArmed)
    }
    return builder.build()
  }

  @RequiresApi(Build.VERSION_CODES.O)
  override fun onPictureInPictureModeChanged(
      isInPictureInPictureMode: Boolean,
      newConfig: Configuration
  ) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    val payload = Arguments.createMap()
    payload.putBoolean("isInPipMode", isInPictureInPictureMode)
    ReactEmitter.emit(this, "pipModeChanged", payload)
  }

  private companion object {
    const val TAG = "PipModule"
  }
}
