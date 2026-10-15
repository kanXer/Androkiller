package com.nexus.androkiller.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.nexus.androkiller.MainActivity
import com.nexus.androkiller.R
import com.nexus.androkiller.streaming.PeerJsSignalingClient
import com.nexus.androkiller.streaming.WebRtcManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.webrtc.PeerConnection
import org.webrtc.VideoTrack
import java.util.UUID

class ScreenCaptureService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private lateinit var webRtc: WebRtcManager
    private lateinit var signaling: PeerJsSignalingClient

    private var videoTrack: VideoTrack? = null
    private val peerConnections = linkedMapOf<String, PeerConnection>()

    private var androidPeerId: String = "android-screen"
    private var captureWidth = 1280
    private var captureHeight = 720
    private var captureFps = 30
    private var maxBitrate = 2_500_000

    override fun onCreate() {
        super.onCreate()
        webRtc = WebRtcManager(applicationContext)
        webRtc.initialize()
        webRtc.maxVideoBitrateBps = maxBitrate
        signaling = PeerJsSignalingClient(scope)
        signaling.listener = object : PeerJsSignalingClient.Listener {
            override fun onOpen(peerId: String) {
                Log.i(TAG, "Signaling open as $peerId")
                notifyStatus("Streaming active as $peerId")
            }
            override fun onOffer(
                sourcePeerId: String,
                connectionId: String?,
                remoteType: String,
                remoteSdp: String,
                mediaType: String?
            ) {
                Log.i(TAG, "Incoming WebRTC offer from $sourcePeerId (connectionId: $connectionId)")
                val cid = connectionId ?: UUID.randomUUID().toString()
                scope.launch {
                    val pc = webRtc.createPeerConnection(
                        onIceCandidate = { cand ->
                            Log.d(TAG, "Sending ICE candidate to $sourcePeerId")
                            signaling.sendCandidate(sourcePeerId, cid, cand)
                        },
                        onConnectionStateChange = { st ->
                            Log.i(TAG, "WebRTC connection state changed: $st for $sourcePeerId")
                            if (st == PeerConnection.PeerConnectionState.CLOSED ||
                                st == PeerConnection.PeerConnectionState.FAILED
                            ) {
                                peerConnections.remove(cid)
                            }
                        }
                    ) ?: run {
                        Log.e(TAG, "Failed creating PeerConnection for offer")
                        return@launch
                    }
                    peerConnections[cid] = pc
                    val remoteTy = if (remoteType.isBlank()) "offer" else remoteType
                    val answer = webRtc.answerOffer(pc, remoteTy, remoteSdp)
                    if (answer != null) {
                        Log.i(TAG, "Sending WebRTC answer to $sourcePeerId")
                        signaling.sendAnswer(sourcePeerId, cid, answer.type.canonicalForm(), answer.description)
                    } else {
                        Log.e(TAG, "Failed to generate answer for $sourcePeerId")
                    }
                }
            }
            override fun onAnswer(sourcePeerId: String, connectionId: String?, remoteType: String, remoteSdp: String) {
                // Android usually answers; ignore unexpected.
            }
            override fun onCandidate(sourcePeerId: String, connectionId: String?, candidate: String?, sdpMid: String?, sdpMLineIndex: Int?) {
                val pc = connectionId?.let { peerConnections[it] }
                webRtc.addIceCandidate(pc, candidate, sdpMid, sdpMLineIndex)
            }
            override fun onLeave(sourcePeerId: String, connectionId: String?) {
                val pc = connectionId?.let { peerConnections.remove(it) }
                webRtc.closePeerConnection(pc)
            }
            override fun onError(message: String) {
                Log.w(TAG, message)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, android.app.Activity.RESULT_CANCELED)
            ?: android.app.Activity.RESULT_CANCELED
        val resultData: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent?.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent?.getParcelableExtra(EXTRA_RESULT_DATA)
        }
        val targetPeerId = intent?.getStringExtra(EXTRA_PEER_ID)
        if (!targetPeerId.isNullOrBlank()) {
            androidPeerId = targetPeerId
        } else {
            androidPeerId = "screen_${com.nexus.androkiller.tracker.DeviceStatusProvider(applicationContext).getDeviceId()}"
        }
        captureWidth = intent?.getIntExtra(EXTRA_WIDTH, 1280) ?: captureWidth
        captureHeight = intent?.getIntExtra(EXTRA_HEIGHT, 720) ?: captureHeight
        captureFps = intent?.getIntExtra(EXTRA_FPS, 30) ?: captureFps
        maxBitrate = intent?.getIntExtra(EXTRA_BITRATE, 2_500_000) ?: maxBitrate
        webRtc.maxVideoBitrateBps = maxBitrate

        Log.i(TAG, "Starting ScreenCaptureService with resultCode=$resultCode, peerId=$androidPeerId")
        if (resultCode != android.app.Activity.RESULT_OK || resultData == null) {
            Log.e(TAG, "Invalid MediaProjection result: resultCode=$resultCode, resultData=$resultData")
            stopSelf()
            return START_NOT_STICKY
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIF_ID,
                buildNotification("Screen streaming active as $androidPeerId"),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIF_ID, buildNotification("Screen streaming active as $androidPeerId"))
        }
        isRunning = true

        scope.launch {
            try {
                val track = webRtc.createScreenVideoTrack(resultData, captureWidth, captureHeight, captureFps)
                videoTrack = track
                // Token random
                val token = UUID.randomUUID().toString()
                signaling.connect("0.peerjs.com", "peerjs", androidPeerId, token)
            } catch (t: Throwable) {
                Log.e(TAG, "Streaming start failed: ${t.message}", t)
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        scope.launch {
            peerConnections.values.toList().forEach { webRtc.closePeerConnection(it) }
            peerConnections.clear()
            signaling.close()
            videoTrack = null
            webRtc.dispose()
        }
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(text: String): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Screen Stream", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val pi = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Screen Streaming")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setContentIntent(pi)
            .setOngoing(true)
            .build()
    }

    private fun notifyStatus(text: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, buildNotification(text))
    }

    companion object {
        private const val TAG = "ScreenCaptureService"

        const val CHANNEL_ID = "screen_stream"
        const val NOTIF_ID = 4312

        const val EXTRA_RESULT_CODE = "extra_result_code"
        const val EXTRA_RESULT_DATA = "extra_result_data"
        const val EXTRA_PEER_ID = "extra_peer_id"
        const val EXTRA_WIDTH = "extra_width"
        const val EXTRA_HEIGHT = "extra_height"
        const val EXTRA_FPS = "extra_fps"
        const val EXTRA_BITRATE = "extra_bitrate"

        @Volatile
        var isRunning: Boolean = false

        fun start(context: Context, resultCode: Int, resultData: Intent, peerId: String? = null) {
            val intent = Intent(context, ScreenCaptureService::class.java).apply {
                putExtra(EXTRA_RESULT_CODE, resultCode)
                putExtra(EXTRA_RESULT_DATA, resultData)
                if (peerId != null) putExtra(EXTRA_PEER_ID, peerId)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else context.startService(intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, ScreenCaptureService::class.java)
            context.stopService(intent)
            isRunning = false
        }
    }
}
