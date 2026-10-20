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
    activePlayer = nextPlayer
    mediaSession = MediaSession.Builder(this, nextPlayer).build()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
    return mediaSession
  }

  override fun onDestroy() {
    if (activePlayer === player) activePlayer = null
    mediaSession?.release()
    mediaSession = null
    player?.stopEkoPlayback()
    player = null
    super.onDestroy()
  }

  companion object {
    private var activePlayer: EkoSessionPlayer? = null

    fun setPaused(paused: Boolean): Boolean {
      val current = activePlayer ?: return false
      if (paused) current.pause() else current.play()
      return true
    }

    fun start(context: Context) {
      context.startForegroundService(Intent(context, EkoMediaService::class.java))
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, EkoMediaService::class.java))
    }
  }
}
