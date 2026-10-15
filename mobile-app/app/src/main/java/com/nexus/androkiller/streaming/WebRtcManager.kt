package com.nexus.androkiller.streaming

import android.content.Context
import android.content.Intent
import android.util.Log
import kotlinx.coroutines.suspendCancellableCoroutine
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import org.webrtc.ScreenCapturerAndroid
import java.util.UUID
import kotlin.coroutines.resume

/**
 * Encapsulates all WebRTC lifecycle concerns for the screen-streaming feature:
 * PeerConnectionFactory, the MediaProjection-backed ScreenCapturerAndroid,
 * the captured VideoTrack and PeerConnection negotiation helpers.
 */
class WebRtcManager(private val context: Context) {

    private val tag = "WebRtcManager"

    private val eglBase: EglBase by lazy { EglBase.create() }

    private var factory: PeerConnectionFactory? = null

    // Capture state
    private var screenCapturer: VideoCapturer? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var videoSource: VideoSource? = null

    /** The captured screen video track. Assigned once [createScreenVideoTrack] succeeds. */
    var videoTrack: VideoTrack? = null
        private set

    /** Default capture parameters: 720p @ 30fps. */
    var captureWidth: Int = 1280
        private set
    var captureHeight: Int = 720
        private set
    var captureFps: Int = 30
        private set

    /** Maximum video bitrate (bps). */
    var maxVideoBitrateBps: Int = 2_500_000
        set(value) {
            field = value
            applyBitrateToAll()
        }

    private val peerConnections = linkedSetOf<PeerConnection>()

    fun initialize() {
        if (factory != null) return
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .setEnableInternalTracer(false)
                .createInitializationOptions()
        )
        val encoderFactory = DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true)
        val decoderFactory = DefaultVideoDecoderFactory(eglBase.eglBaseContext)
        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()
        Log.i(tag, "PeerConnectionFactory initialized")
    }

    /**
     * Builds a screen video track from the MediaProjection permission result intent.
     * The intent is the original data returned by MediaProjection permission flow.
     */
    fun createScreenVideoTrack(
        mediaProjectionPermissionResult: Intent,
        width: Int = 1280,
        height: Int = 720,
        fps: Int = 30
    ): VideoTrack? {
        val pcFactory = factory ?: run {
            Log.e(tag, "Factory not initialized")
            return null
        }
        captureWidth = width
        captureHeight = height
        captureFps = fps

        return try {
            surfaceTextureHelper?.dispose()
            screenCapturer?.dispose()

            surfaceTextureHelper = SurfaceTextureHelper.create(
                "ScreenCaptureThread",
                eglBase.eglBaseContext
            )

            val capturer = ScreenCapturerAndroid(
                mediaProjectionPermissionResult,
                object : android.media.projection.MediaProjection.Callback() {
                    override fun onStop() {
                        Log.w(tag, "MediaProjection stopped")
                    }
                }
            )
            screenCapturer = capturer

            val source = pcFactory.createVideoSource(true) // isScreencast = true
            videoSource = source

            capturer.initialize(surfaceTextureHelper, context, source.capturerObserver)
            capturer.startCapture(width, height, fps)

            val track = pcFactory.createVideoTrack("screen_track_${UUID.randomUUID()}", source)
            track.setEnabled(true)
            videoTrack = track
            Log.i(tag, "Screen video track created (${width}x${height}@${fps})")
            track
        } catch (t: Throwable) {
            Log.e(tag, "Failed to create screen video track: ${t.message}", t)
            null
        }
    }

    /** Re-scales capture to a new width/height/fps (e.g. on rotation). */
    fun changeCaptureFormat(width: Int, height: Int, fps: Int) {
        screenCapturer?.let { capturer ->
            try {
                capturer.changeCaptureFormat(width, height, fps)
                captureWidth = width
                captureHeight = height
                captureFps = fps
            } catch (t: Throwable) {
                Log.w(tag, "changeCaptureFormat failed: ${t.message}")
            }
        }
    }

    /**
     * Creates a PeerConnection wired to the signaling callbacks. The captured video track
     * (if available) is added as a send-only (sendrecv) track.
     */
    fun createPeerConnection(
        onIceCandidate: (IceCandidate) -> Unit,
        onConnectionStateChange: (PeerConnection.PeerConnectionState) -> Unit = {},
        onIceConnectionStateChange: (PeerConnection.IceConnectionState) -> Unit = {}
    ): PeerConnection? {
        val pcFactory = factory ?: return null
        val iceServers = listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
        )
        val config = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
        }
        val observer = object : PeerConnection.Observer {
            override fun onSignalingChange(state: PeerConnection.SignalingState) {}
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                onIceConnectionStateChange(state)
            }
            override fun onIceConnectionReceivingChange(receiving: Boolean) {}
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}
            override fun onIceCandidate(candidate: IceCandidate) {
                onIceCandidate(candidate)
            }
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
            override fun onAddStream(stream: MediaStream) {}
            override fun onRemoveStream(stream: MediaStream) {}
            override fun onDataChannel(channel: org.webrtc.DataChannel) {}
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(receiver: org.webrtc.RtpReceiver, streams: Array<out MediaStream>) {}
            override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
                onConnectionStateChange(state)
            }
        }
        val pc = pcFactory.createPeerConnection(config, observer) ?: return null

        videoTrack?.let { track ->
            try {
                val sender = pc.addTrack(track, listOf("screen"))
                sender?.let { s ->
                    val params = s.parameters
                    if (params.encodings.isNotEmpty()) {
                        params.encodings.forEach { it.maxBitrateBps = maxVideoBitrateBps }
                        s.parameters = params
                    }
                }
            } catch (t: Throwable) {
                Log.w(tag, "addTrack failed: ${t.message}")
            }
        }

        peerConnections.add(pc)
        return pc
    }

    suspend fun setRemoteDescription(pc: PeerConnection, type: String, sdp: String): Boolean =
        suspendCancellableCoroutine { cont ->
            pc.setRemoteDescription(object : SdpObserver {
                override fun onCreateSuccess(desc: SessionDescription?) {}
                override fun onSetSuccess() { cont.resume(true) }
                override fun onCreateFailure(error: String?) { cont.resume(false) }
                override fun onSetFailure(error: String?) { cont.resume(false) }
            }, SessionDescription(SessionDescription.Type.fromCanonicalForm(type), sdp))
        }

    suspend fun createAnswer(pc: PeerConnection): SessionDescription? =
        suspendCancellableCoroutine { cont ->
            pc.createAnswer(object : SdpObserver {
                override fun onCreateSuccess(sdp: SessionDescription?) {
                    if (sdp != null) cont.resume(sdp) else cont.resume(null)
                }
                override fun onSetSuccess() {}
                override fun onCreateFailure(error: String?) { cont.resume(null) }
                override fun onSetFailure(error: String?) { cont.resume(null) }
            }, MediaConstraints())
        }

    suspend fun setLocalDescription(pc: PeerConnection, sdp: SessionDescription): Boolean =
        suspendCancellableCoroutine { cont ->
            pc.setLocalDescription(object : SdpObserver {
                override fun onCreateSuccess(desc: SessionDescription?) {}
                override fun onSetSuccess() { cont.resume(true) }
                override fun onCreateFailure(error: String?) { cont.resume(false) }
                override fun onSetFailure(error: String?) { cont.resume(false) }
            }, sdp)
        }

    /** Convenience: apply setRemoteDescription + createAnswer + setLocalDescription. */
    suspend fun answerOffer(pc: PeerConnection, remoteType: String, remoteSdp: String): SessionDescription? {
        if (!setRemoteDescription(pc, remoteType, remoteSdp)) return null
        val answer = createAnswer(pc) ?: return null
        if (!setLocalDescription(pc, answer)) return null
        return answer
    }

    fun addIceCandidate(pc: PeerConnection?, candidate: String?, sdpMid: String?, sdpMLineIndex: Int?): Boolean {
        if (pc == null || candidate.isNullOrBlank()) return false
        return try {
            pc.addIceCandidate(IceCandidate(sdpMid, sdpMLineIndex ?: 0, candidate))
        } catch (t: Throwable) {
            Log.w(tag, "addIceCandidate failed: ${t.message}")
            false
        }
    }

    private fun applyBitrateToAll() {
        peerConnections.forEach { pc ->
            pc.senders.forEach { sender ->
                val params = sender.parameters
                if (params.encodings.isNotEmpty()) {
                    params.encodings.forEach { it.maxBitrateBps = maxVideoBitrateBps }
                    sender.parameters = params
                }
            }
        }
    }

    fun closePeerConnection(pc: PeerConnection?) {
        if (pc == null) return
        try { pc.close() } catch (_: Throwable) {}
        peerConnections.remove(pc)
    }

    fun dispose() {
        peerConnections.toList().forEach { closePeerConnection(it) }
        try { screenCapturer?.stopCapture() } catch (_: Throwable) {}
        try { screenCapturer?.dispose() } catch (_: Throwable) {}
        screenCapturer = null
        try { surfaceTextureHelper?.dispose() } catch (_: Throwable) {}
        surfaceTextureHelper = null
        try { videoSource?.dispose() } catch (_: Throwable) {}
        videoSource = null
        videoTrack?.dispose()
        videoTrack = null
        try { eglBase.release() } catch (_: Throwable) {}
        factory = null
        Log.i(tag, "Disposed")
    }
}
