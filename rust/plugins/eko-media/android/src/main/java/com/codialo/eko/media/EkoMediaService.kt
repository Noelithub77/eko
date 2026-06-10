package com.codialo.eko.media

import android.content.Context
import android.content.Intent
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class EkoMediaService : MediaSessionService() {
  private var player: EkoSessionPlayer? = null
  private var mediaSession: MediaSession? = null

  override fun onCreate() {
    super.onCreate()
    val nextPlayer = EkoSessionPlayer()
    player = nextPlayer
    mediaSession = MediaSession.Builder(this, nextPlayer).build()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
    return mediaSession
  }

  override fun onDestroy() {
    mediaSession?.release()
    mediaSession = null
    player?.stopEkoPlayback()
    player = null
    super.onDestroy()
  }

  companion object {
    fun start(context: Context) {
      context.startForegroundService(Intent(context, EkoMediaService::class.java))
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, EkoMediaService::class.java))
    }
  }
}
