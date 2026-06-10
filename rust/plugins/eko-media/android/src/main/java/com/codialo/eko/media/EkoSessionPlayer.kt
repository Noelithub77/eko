package com.codialo.eko.media

import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

class EkoSessionPlayer : SimpleBasePlayer(Looper.getMainLooper()) {
  private var playWhenReadyValue = true
  private var mediaState = EkoMediaState.Playing

  override fun getState(): State {
    val metadata = MediaMetadata.Builder()
      .setTitle("Eko")
      .setArtist("Live desktop audio")
      .build()
    val item = MediaItem.Builder()
      .setMediaId("eko-live-audio")
      .setMediaMetadata(metadata)
      .build()

    return State.Builder()
      .setAvailableCommands(
        Player.Commands.Builder()
          .add(Player.COMMAND_PLAY_PAUSE)
          .build(),
      )
      .setPlaylist(
        listOf(
          MediaItemData.Builder("eko-live-audio")
            .setMediaItem(item)
            .setMediaMetadata(metadata)
            .build(),
        ),
      )
      .setCurrentMediaItemIndex(0)
      .setPlaybackState(Player.STATE_READY)
      .setPlayWhenReady(playWhenReadyValue, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
      .build()
  }

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    playWhenReadyValue = playWhenReady
    mediaState = if (playWhenReady) EkoMediaState.Playing else EkoMediaState.Paused
    EkoMediaBridge.setNativePlaybackPaused(!playWhenReady)
    invalidateState()
    return Futures.immediateVoidFuture()
  }

  fun stopEkoPlayback() {
    mediaState = EkoMediaState.Stopped
    EkoMediaBridge.setNativePlaybackPaused(true)
    release()
  }
}
