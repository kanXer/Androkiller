// Enhanced PeerJS consumer for Android Screen Stream
const ANDROID_PEER_ID = window.ANDROID_PEER_ID || 'android-screen';

const video = document.getElementById('remoteVideo');
const statusEl = document.getElementById('status');
const reconnectBtn = document.getElementById('reconnectBtn');

let peer = null;
let currentCall = null;

function setStatus(text, isError = false) {
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.style.color = isError ? '#f87171' : '#94a3b8';
  }
}

function connect() {
  if (currentCall) {
    try { currentCall.close(); } catch (_) {}
    currentCall = null;
  }
  if (peer) {
    try { peer.destroy(); } catch (_) {}
    peer = null;
  }

  setStatus('Connecting to WebRTC signaling server...');

  try {
    peer = new window.Peer(undefined, {
      host: '0.peerjs.com',
      port: 443,
      path: '/peerjs',
      secure: true,
      key: 'peerjs'
    });
  } catch (e) {
    setStatus('Failed to initialize PeerJS: ' + e.message, true);
    return;
  }

  peer.on('open', (id) => {
    setStatus(`Connected to signaling as ${id}. Calling phone screen (${ANDROID_PEER_ID})...`);
    callPhone();
  });

  peer.on('error', (err) => {
    console.warn('Peer error:', err);
    const errType = err.type || '';
    if (errType === 'peer-unavailable') {
      setStatus(`Screen stream is NOT active on device (Peer '${ANDROID_PEER_ID}' is offline). Open the app on your phone and tap 'Start Stream', then click Reconnect.`, true);
    } else if (errType === 'server-error' || errType === 'socket-error' || errType === 'socket-closed') {
      setStatus('Signaling server connection lost. Click Reconnect below.', true);
    } else {
      setStatus(`Peer error: ${err.message || err.type || err}`, true);
    }
  });
}

function callPhone() {
  if (!peer) return;

  try {
    let outgoingStream;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      outgoingStream = canvas.captureStream ? canvas.captureStream(1) : new MediaStream();
    } catch (_) {
      outgoingStream = new MediaStream();
    }
    const call = peer.call(ANDROID_PEER_ID, outgoingStream);
    currentCall = call;

    call.on('stream', (remoteStream) => {
      setStatus('Live screen streaming active!');
      if (video) {
        video.srcObject = remoteStream;
        video.play().catch(() => {
          setStatus('Stream received. Tap video to start playing.');
          video.addEventListener('click', () => video.play(), { once: true });
        });
      }
    });

    call.on('close', () => {
      setStatus('Screen stream ended by Android device.');
    });

    call.on('error', (err) => {
      setStatus(`Call error: ${err.message || err.type || err}`, true);
    });
  } catch (err) {
    setStatus(`Failed to initiate call: ${err.message}`, true);
  }
}

const fullscreenBtn = document.getElementById('fullscreenBtn');
const fitBtn = document.getElementById('fitBtn');
const rotateBtn = document.getElementById('rotateBtn');
const videoWrapper = document.querySelector('.video-wrapper');

let currentFit = 'contain';
let currentRot = 0;

function toggleFit() {
  if (currentFit === 'contain') {
    currentFit = 'fill';
    video.style.objectFit = 'fill';
    fitBtn.textContent = '📱 Fit Screen';
  } else {
    currentFit = 'contain';
    video.style.objectFit = 'contain';
    fitBtn.textContent = '↔️ Stretch Full';
  }
}

function rotateVideo() {
  currentRot = (currentRot + 90) % 360;
  video.style.transform = `rotate(${currentRot}deg)`;
  video.style.transition = 'transform 0.2s';
}

function toggleFullscreen() {
  const target = videoWrapper || video;
  if (!document.fullscreenElement) {
    if (target.requestFullscreen) target.requestFullscreen().catch(() => {});
    else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
}

if (reconnectBtn) {
  reconnectBtn.addEventListener('click', connect);
}

if (fitBtn) {
  fitBtn.addEventListener('click', toggleFit);
}

if (rotateBtn) {
  rotateBtn.addEventListener('click', rotateVideo);
}

if (fullscreenBtn) {
  fullscreenBtn.addEventListener('click', toggleFullscreen);
}

if (video) {
  video.addEventListener('dblclick', toggleFullscreen);
}

// Start connection on load
connect();
