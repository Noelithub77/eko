package com.codialo.eko.media

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@TauriPlugin
class EkoMediaPlugin(private val activity: Activity) : Plugin(activity) {
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
