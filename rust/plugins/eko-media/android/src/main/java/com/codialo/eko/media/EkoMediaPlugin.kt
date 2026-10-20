package com.codialo.eko.media

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.annotation.InvokeArg
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class PlaybackArgs {
  var paused: Boolean = false
}

@TauriPlugin
class EkoMediaPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun setPlaybackPaused(invoke: Invoke) {
    val args = invoke.parseArgs(PlaybackArgs::class.java)
    activity.runOnUiThread {
      if (EkoMediaService.setPaused(args.paused)) invoke.resolve()
      else invoke.reject("The audio session is not ready. Try again.")
    }
  }

  @Command
  fun startSession(invoke: Invoke) {
    EkoMediaBridge.setNativePlaybackPaused(false)
    EkoMediaService.start(activity)
    invoke.resolve()
  }

  @Command
  fun stopSession(invoke: Invoke) {
    EkoMediaService.stop(activity)
    EkoMediaBridge.setNativePlaybackPaused(true)
    invoke.resolve()
  }
}
