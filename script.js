// A pointer-based sketch playground inspired by the featured Smart Board article.
// The camera-based browser recreation is separate, in camera-demo.js.
const canvas = document.querySelector('#drawing');
const context = canvas.getContext('2d');
const board = document.querySelector('#board');
const statusLabel = document.querySelector('#board-status');
let mode = 'draw';
let activePointer = null;
let previous = null;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * ratio);
  const height = Math.round(rect.height * ratio);
  if (canvas.width === width && canvas.height === height) return;
  const saved = document.createElement('canvas');
  saved.width = canvas.width;
  saved.height = canvas.height;
  saved.getContext('2d').drawImage(canvas, 0, 0);
  canvas.width = width;
  canvas.height = height;
  context.drawImage(saved, 0, 0, width, height);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}
new ResizeObserver(resizeCanvas).observe(canvas);

function point(event) {
  const rect = canvas.getBoundingClientRect();
  return {x: event.clientX - rect.left, y: event.clientY - rect.top};
}
function stroke(from, to) {
  context.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
  context.strokeStyle = '#dcf592';
  context.lineWidth = mode === 'erase' ? 28 : 3;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
}
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || activePointer !== null) return;
  activePointer = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  previous = point(event);
  board.classList.add('started');
  stroke(previous, {x: previous.x + .1, y: previous.y + .1});
  statusLabel.textContent = mode === 'draw' ? 'Your idea, in motion.' : 'Erase your strokes';
});
canvas.addEventListener('pointermove', event => {
  if (event.pointerId !== activePointer) return;
  const next = point(event);
  stroke(previous, next);
  previous = next;
});
function endStroke(event) {
  if (event.pointerId !== activePointer) return;
  activePointer = null;
  previous = null;
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
canvas.addEventListener('lostpointercapture', endStroke);
document.querySelectorAll('[data-tool]').forEach(button => {
  button.addEventListener('click', () => {
    mode = button.dataset.tool;
    document.querySelectorAll('[data-tool]').forEach(tool => {
      const selected = tool === button;
      tool.classList.toggle('active', selected);
      tool.setAttribute('aria-pressed', String(selected));
    });
    statusLabel.textContent = mode === 'draw' ? 'Try drawing here ↗' : 'Drag over your strokes';
  });
});
document.querySelector('#clear-board').addEventListener('click', () => {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.restore();
  board.classList.remove('started');
  statusLabel.textContent = 'A fresh start.';
});
