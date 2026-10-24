# Akash Challa — Portfolio

Personal portfolio at **https://akashchalla.com** with selected projects, experience, education, and featured writing about the Touchless Smart Board on Qualcomm QIM SDK.

## Run locally

From this folder, run:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open http://127.0.0.1:4173. Use localhost or HTTPS for the camera demo; opening the HTML directly as a file does not provide the same camera and JavaScript module support.

## Files

- `index.html`: page content and camera-demo dialog
- `styles.css`: responsive layout and visual design
- `script.js`: mouse/touch sketch playground
- `camera-demo.js`: opt-in webcam demo and camera lifecycle
- `hand-gestures.mjs`: gesture classification and stroke smoothing
- `profile.jpg`: portrait
- `Akash_Challa_Resume.pdf`: downloadable resume
- `CNAME`: custom domain for GitHub Pages
- `tests/camera-demo.test.mjs`: gesture and camera lifecycle checks

## Touchless demo

Open **Try the touchless demo**, wait for the model to load, then choose **Start camera** and allow camera access.

- Raise only the index finger to draw.
- Raise only the pinky finger to erase.
- Open the hand or make a fist to pause.

Keep one hand in view, palm facing the camera, with good lighting. The browser demo uses MediaPipe Hand Landmarker, not Qualcomm QIM SDK. The original hardware application is described in the linked Qualcomm article.

The library is pinned to MediaPipe Tasks Vision 0.10.21. Library/WASM files load from jsDelivr and the model loads from Google Cloud Storage. Internet access is needed for these downloads. Video frames stay in the browser; the application does not record, upload video, or request microphone access. Stop, close, tab visibility changes, and page navigation release camera tracks.

## Checks

With Node.js installed:

```sh
node --test tests/camera-demo.test.mjs
```

Tests cover gesture classification, stroke continuity, permission denial, and camera/model cleanup races. Live accuracy varies with camera, lighting, and hand pose.

## Publishing

The site uses static files at the repository root. Keep `CNAME` set to `akashchalla.com` and preserve the repository's existing GitHub Pages configuration. No build step is required.
