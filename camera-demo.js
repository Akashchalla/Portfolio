import {classifyGesture, GestureStroke} from './hand-gestures.mjs';

const dialog = document.querySelector('#camera-demo');
const openButton = document.querySelector('#open-camera-demo');
const closeButton = document.querySelector('#close-camera-demo');
const startButton = document.querySelector('#start-camera');
const stopButton = document.querySelector('#stop-camera');
const clearButton = document.querySelector('#clear-camera');
const status = document.querySelector('#camera-status');
const stage = document.querySelector('#camera-stage');
const video = document.querySelector('#hand-video');
const ink = document.querySelector('#hand-ink');
const overlay = document.querySelector('#hand-overlay');
const inkContext = ink.getContext('2d');
const overlayContext = overlay.getContext('2d');
const badge = document.querySelector('#gesture-badge');
const stroke = new GestureStroke();
const VERSION = '0.10.21';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
let detector = null;
let modelGeneration = 0;
let cameraGeneration = 0;
let stream = null;
let active = false;
let frameRequest = 0;
let lastFrameTime = 0;
let lastVideoTime = -1;
let lastTimestamp = 0;

function message(text) {
  if (status.textContent !== text) status.textContent = text;
}
function setBadge(mode, text) {
  badge.dataset.mode = mode;
  if (badge.textContent !== text) badge.textContent = text;
}

async function prepareTracking() {
  const generation = ++modelGeneration;
  startButton.disabled = true;
  startButton.textContent = 'Preparing hand tracking…';
  message('Loading the hand-tracking model. The first visit can take a few moments. Your camera is still off.');
  let readyDetector;
  try {
    const {HandLandmarker, FilesetResolver} = await import(`${CDN}/vision_bundle.mjs`);
    const files = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    if (generation !== modelGeneration || !dialog.open) return;
    const options = {
      baseOptions: {modelAssetPath: MODEL, delegate: 'GPU'},
      runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: .65,
      minHandPresenceConfidence: .65,
      minTrackingConfidence: .6
    };
    try {
      readyDetector = await HandLandmarker.createFromOptions(files, options);
    } catch {
      if (generation !== modelGeneration || !dialog.open) return;
      // Older browsers can use the CPU when GPU initialization is unavailable.
      options.baseOptions.delegate = 'CPU';
      readyDetector = await HandLandmarker.createFromOptions(files, options);
    }
    if (generation !== modelGeneration || !dialog.open) {
      readyDetector.close();
      return;
    }
    detector = readyDetector;
    lastTimestamp = 0;
    startButton.disabled = false;
    startButton.textContent = 'Start camera';
    message('Ready. Choose Start camera, then allow camera access in your browser.');
  } catch {
    if (generation !== modelGeneration || !dialog.open) return;
    readyDetector?.close();
    startButton.disabled = false;
    startButton.textContent = 'Retry hand tracking';
    message('Hand tracking could not load. Check your internet connection or try a browser that supports WebAssembly. You can still use the mouse sketch outside this demo.');
  }
}

function resizeDrawing(width, height) {
  if (ink.width === width && ink.height === height) return;
  const saved = document.createElement('canvas');
  saved.width = ink.width;
  saved.height = ink.height;
  saved.getContext('2d').drawImage(ink, 0, 0);
  ink.width = overlay.width = width;
  ink.height = overlay.height = height;
  inkContext.drawImage(saved, 0, 0, width, height);
}

function stopCamera(text = 'Camera stopped. Your drawing is kept until you clear it.') {
  ++cameraGeneration; // Also cancels any unresolved camera permission request.
  active = false;
  cancelAnimationFrame(frameRequest);
  const oldStream = stream;
  stream = null;
  oldStream?.getTracks().forEach(track => track.stop());
  video.pause();
  video.srcObject = null;
  stage.classList.remove('camera-live');
  overlayContext.clearRect(0, 0, overlay.width, overlay.height);
  stroke.reset();
  lastVideoTime = -1;
  stopButton.disabled = true;
  startButton.disabled = !detector;
  startButton.textContent = detector ? 'Start camera' : 'Preparing hand tracking…';
  setBadge('off', 'CAMERA OFF');
  message(text);
}

async function startCamera() {
  if (!detector) { await prepareTracking(); return; }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    message('Camera access needs HTTPS or localhost and a supported browser. Open this page in a current Chrome, Edge, or Safari browser.');
    return;
  }
  const generation = ++cameraGeneration;
  startButton.disabled = true;
  startButton.textContent = 'Waiting for camera…';
  stopButton.disabled = false;
  message('Allow camera access in your browser to begin. You can cancel with Stop camera.');
  try {
    const requestedStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {facingMode: 'user', width: {ideal: 640}, height: {ideal: 480}, frameRate: {ideal: 24, max: 30}}
    });
    if (generation !== cameraGeneration || !dialog.open || document.hidden) {
      requestedStream.getTracks().forEach(track => track.stop());
      return;
    }
    stream = requestedStream;
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (stream === requestedStream) stopCamera('The camera disconnected. Reconnect it and choose Start camera to try again.');
    });
    video.srcObject = stream;
    await video.play();
    if (generation !== cameraGeneration || !dialog.open || document.hidden) return;
    resizeDrawing(video.videoWidth || 640, video.videoHeight || 480);
    stage.style.aspectRatio = `${ink.width} / ${ink.height}`;
    stage.classList.add('camera-live');
    active = true;
    lastFrameTime = 0;
    lastVideoTime = -1;
    stroke.reset();
    startButton.textContent = 'Camera running';
    setBadge('missing', 'SHOW ONE HAND');
    message('Camera is on. Hold up your hand with your palm facing the camera.');
    frameRequest = requestAnimationFrame(trackFrame);
  } catch (error) {
    if (generation !== cameraGeneration || !dialog.open) return;
    const reasons = {
      NotAllowedError: 'Camera permission was denied. Allow it in your browser’s site settings, or keep using the mouse sketch.',
      NotFoundError: 'No camera was found. Connect a webcam, or use the mouse sketch.',
      NotReadableError: 'The camera could not start. Close other apps using it, then try again.',
      OverconstrainedError: 'This camera does not support the requested video settings. Try another camera or browser.'
    };
    stopCamera(reasons[error.name] || 'The camera could not start. Check your camera and browser permissions, then try again.');
  }
}

const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
function drawTracking(points, gesture) {
  overlayContext.clearRect(0, 0, overlay.width, overlay.height);
  if (!points) return;
  const pixel = p => ({x: (1 - p.x) * overlay.width, y: p.y * overlay.height});
  overlayContext.strokeStyle = '#a9caff88';
  overlayContext.lineWidth = 1.5;
  overlayContext.beginPath();
  for (const [a, b] of connections) {
    const start = pixel(points[a]), end = pixel(points[b]);
    overlayContext.moveTo(start.x, start.y);
    overlayContext.lineTo(end.x, end.y);
  }
  overlayContext.stroke();
  overlayContext.fillStyle = '#d2e4ff';
  for (const p of points) {
    const at = pixel(p);
    overlayContext.beginPath();
    overlayContext.arc(at.x, at.y, 2.5, 0, Math.PI * 2);
    overlayContext.fill();
  }
  if (gesture.tip) {
    const at = pixel(gesture.tip);
    overlayContext.strokeStyle = gesture.mode === 'erase' ? '#ffbda8' : '#81efec';
    overlayContext.lineWidth = 2;
    overlayContext.beginPath();
    overlayContext.arc(at.x, at.y, gesture.mode === 'erase' ? ink.width * .04 : 8, 0, Math.PI * 2);
    overlayContext.stroke();
  }
}

function paint(segment) {
  if (!segment) return;
  const {from, to, mode} = segment;
  inkContext.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
  inkContext.strokeStyle = '#81efec';
  inkContext.fillStyle = '#81efec';
  inkContext.lineWidth = mode === 'erase' ? ink.width * .08 : Math.max(3, ink.width * .006);
  inkContext.lineCap = 'round';
  inkContext.lineJoin = 'round';
  if (from.x === to.x && from.y === to.y) {
    inkContext.beginPath();
    inkContext.arc(to.x, to.y, inkContext.lineWidth / 2, 0, Math.PI * 2);
    inkContext.fill();
  } else {
    inkContext.beginPath();
    inkContext.moveTo(from.x, from.y);
    inkContext.lineTo(to.x, to.y);
    inkContext.stroke();
  }
}

function trackFrame(now) {
  if (!active || !detector) return;
  try {
    // Limit inference to 20 FPS; the live video can still display at its native rate.
    if (video.readyState >= 2 && now - lastFrameTime >= 50 && video.currentTime !== lastVideoTime) {
      lastFrameTime = now;
      lastVideoTime = video.currentTime;
      const timestamp = Math.max(now, lastTimestamp + 1);
      lastTimestamp = timestamp;
      const results = detector.detectForVideo(video, timestamp);
      const points = results.landmarks[0];
      const gesture = classifyGesture(points, ink.width / ink.height);
      const segment = stroke.update(gesture, now, ink.width, ink.height);
      paint(segment);
      drawTracking(points, gesture);
      const labels = {missing: 'SHOW ONE HAND', pause: 'PAUSED · REPOSITION YOUR HAND', draw: 'INDEX FINGER · DRAWING', erase: 'PINKY FINGER · ERASING'};
      setBadge(gesture.mode, segment || !gesture.tip ? labels[gesture.mode] : 'HOLD THE GESTURE…');
    }
    frameRequest = requestAnimationFrame(trackFrame);
  } catch {
    stopCamera('Hand tracking stopped unexpectedly. Restart the camera, or close and reopen the demo to reload the model.');
  }
}

openButton.addEventListener('click', () => {
  dialog.showModal();
  document.body.classList.add('camera-dialog-open');
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    startButton.disabled = true;
    startButton.textContent = 'Camera unavailable';
    message('Open this page over HTTPS or localhost in a camera-enabled browser. The mouse sketch is available without a camera.');
    return;
  }
  prepareTracking();
});
startButton.addEventListener('click', startCamera);
stopButton.addEventListener('click', () => stopCamera());
closeButton.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  ++modelGeneration;
  stopCamera();
  detector?.close();
  detector = null;
  document.body.classList.remove('camera-dialog-open');
  openButton.focus({preventScroll: true});
});
clearButton.addEventListener('click', () => {
  inkContext.clearRect(0, 0, ink.width, ink.height);
  stroke.reset();
  message(active ? 'Drawing cleared. Open your hand to pause, or raise a finger to continue.' : 'Drawing cleared. Your camera is off.');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (stream || !stopButton.disabled)) stopCamera('Camera stopped because you left this tab. Choose Start camera to resume.');
});
window.addEventListener('pagehide', () => {
  ++modelGeneration;
  stopCamera();
  detector?.close();
  detector = null;
  if (dialog.open) dialog.close();
});
