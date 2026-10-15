package com.nexus.androkiller.streaming

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.UUID

/**
 * Minimal PeerJS-protocol signaling client over OkHttp WebSocket.
 */
class PeerJsSignalingClient(
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
) {
    interface Listener {
        fun onOpen(peerId: String)
        fun onOffer(sourcePeerId: String, connectionId: String?, remoteType: String, remoteSdp: String, mediaType: String?)
        fun onAnswer(sourcePeerId: String, connectionId: String?, remoteType: String, remoteSdp: String)
        fun onCandidate(sourcePeerId: String, connectionId: String?, candidate: String?, sdpMid: String?, sdpMLineIndex: Int?)
        fun onLeave(sourcePeerId: String, connectionId: String?)
        fun onError(message: String)
    }

    var listener: Listener? = null

    private val client = OkHttpClient()
    private var socket: WebSocket? = null
    private var peerId: String? = null
    private var token: String? = null
    private var serverHost: String = "0.peerjs.com"
    private var serverKey: String = "peerjs"

    @Volatile
    private var connected = false

    fun connect(host: String = "0.peerjs.com", key: String = "peerjs", id: String, tok: String = UUID.randomUUID().toString()) {
        serverHost = host
        serverKey = key
        peerId = id
        token = tok
        val url = "wss://$host/peerjs?key=$key&id=$id&token=$tok&version=1.5.5"
        val request = Request.Builder().url(url).build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                connected = true
                Log.i(TAG, "WebSocket open")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    handleMessage(json)
                } catch (e: Exception) {
                    Log.w(TAG, "Bad message: $text", e)
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                connected = false
                listener?.onError("WebSocket closed: $reason")
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                connected = false
                listener?.onError("WebSocket failure: ${t.message}")
            }
        })

        // PeerJS heartbeat
        scope.launch {
            while (true) {
                delay(5000)
                if (connected) {
                    try { socket?.send("""{"type":"HEARTBEAT"}""") } catch (_: Throwable) {}
                }
            }
        }
    }

    private fun handleMessage(json: JSONObject) {
        val type = json.optString("type")
        val src = json.optString("src")
        val payload = json.optJSONObject("payload")
        when (type) {
            "OPEN" -> {
                listener?.onOpen(peerId ?: src)
            }
            "OFFER" -> {
                val connectionId = payload?.optString("connectionId")
                val mediaType = payload?.optString("type")
                val sdpObj = payload?.optJSONObject("sdp")
                val sdpType = sdpObj?.optString("type") ?: "offer"
                val sdp = sdpObj?.optString("sdp").orEmpty()
                listener?.onOffer(src, connectionId?.ifBlank { null }, sdpType, sdp, mediaType)
            }
            "ANSWER" -> {
                val connectionId = payload?.optString("connectionId")
                val sdpObj = payload?.optJSONObject("sdp")
                val sdpType = sdpObj?.optString("type") ?: "answer"
                val sdp = sdpObj?.optString("sdp").orEmpty()
                listener?.onAnswer(src, connectionId?.ifBlank { null }, sdpType, sdp)
            }
            "CANDIDATE" -> {
                val connectionId = payload?.optString("connectionId")
                val candObj = payload?.optJSONObject("candidate")
                val candidate = candObj?.optString("candidate")
                val sdpMid = candObj?.optString("sdpMid")
                val sdpMLineIndex = if (candObj != null && candObj.has("sdpMLineIndex")) candObj.optInt("sdpMLineIndex") else null
                listener?.onCandidate(src, connectionId?.ifBlank { null }, candidate, sdpMid, sdpMLineIndex)
            }
            "LEAVE" -> {
                val connectionId = payload?.optString("connectionId")
                listener?.onLeave(src, connectionId?.ifBlank { null })
            }
            else -> Log.d(TAG, "Unhandled message type=$type")
        }
    }

    private fun baseMessage(type: String, dst: String, payload: JSONObject): JSONObject {
        val json = JSONObject()
        json.put("type", type)
        json.put("src", peerId)
        json.put("dst", dst)
        json.put("payload", payload)
        return json
    }

    fun sendOffer(dstPeerId: String, connectionId: String, sdpType: String, sdp: String) {
        val sdpObj = JSONObject().put("type", sdpType).put("sdp", sdp)
        val payload = JSONObject()
            .put("sdp", sdpObj)
            .put("type", "media")
            .put("connectionId", connectionId)
        socket?.send(baseMessage("OFFER", dstPeerId, payload).toString())
    }

    fun sendAnswer(dstPeerId: String, connectionId: String, sdpType: String, sdp: String) {
        val sdpObj = JSONObject().put("type", sdpType).put("sdp", sdp)
        val payload = JSONObject()
            .put("sdp", sdpObj)
            .put("type", "media")
            .put("connectionId", connectionId)
        socket?.send(baseMessage("ANSWER", dstPeerId, payload).toString())
    }

    fun sendCandidate(dstPeerId: String, connectionId: String, candidate: org.webrtc.IceCandidate) {
        val candObj = JSONObject()
            .put("candidate", candidate.sdp)
            .put("sdpMid", candidate.sdpMid)
            .put("sdpMLineIndex", candidate.sdpMLineIndex)
        val payload = JSONObject()
            .put("candidate", candObj)
            .put("type", "media")
            .put("connectionId", connectionId)
        socket?.send(baseMessage("CANDIDATE", dstPeerId, payload).toString())
    }

    fun sendLeave(dstPeerId: String, connectionId: String?) {
        val payload = JSONObject().put("connectionId", connectionId)
        socket?.send(baseMessage("LEAVE", dstPeerId, payload).toString())
    }

    fun close() {
        try { socket?.close(1000, "bye") } catch (_: Throwable) {}
        socket = null
        connected = false
    }

    companion object {
        private const val TAG = "PeerJsSignalingClient"
    }
}
