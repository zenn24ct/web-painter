// script.js — Minimal & working painter with movable/scalable images
// Requires the Minimal HTML/CSS version you already have.

'use strict';

/* -------------------------
   DOM references
   ------------------------- */
const CANVAS_CONTAINER = document.getElementById('canvasContainer');
const colorPicker = document.getElementById('colorPicker');
const sizeSlider = document.getElementById('sizeSlider');
const penBtn = document.getElementById('penBtn');
const eraserBtn = document.getElementById('eraserBtn');
const addLayerBtn = document.getElementById('addLayerBtn');
const removeLayerBtn = document.getElementById('removeLayerBtn');
const clearBtn = document.getElementById('clearBtn');
const saveBtn = document.getElementById('saveBtn');
const fileInput = document.getElementById('fileInput');
const addImageBtn = document.getElementById('addImageBtn');
const layerListEl = document.getElementById('layerList');

const DPR = window.devicePixelRatio || 1;

/* -------------------------
   App state
   layers: array from bottom(0) -> top(last)
   each layer: { id, name, wrapper(div), canvas, ctx, images: [{imgEl, x, y, scale}] }
   activeIndex: index in layers array
   ------------------------- */
let layers = [];
let activeIndex = 0;
let toolMode = 'draw'; // 'draw' | 'erase'
let isDrawing = false;
let lastPos = { x: 0, y: 0 };

/* -------------------------
   Helpers
   ------------------------- */
function getContainerSizeCss() {
  const r = CANVAS_CONTAINER.getBoundingClientRect();
  return { w: Math.max(10, Math.round(r.width)), h: Math.max(10, Math.round(r.height)) };
}

function createCanvasForSize(wCss, hCss) {
  const canvas = document.createElement('canvas');
  // device pixels
  canvas.width = Math.round(wCss * DPR);
  canvas.height = Math.round(hCss * DPR);
  canvas.style.width = wCss + 'px';
  canvas.style.height = hCss + 'px';
  canvas.className = 'layer-canvas';
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return { canvas, ctx };
}

function setActiveLayer(index) {
  if (index < 0 || index >= layers.length) return;
  activeIndex = index;
  // update CSS / pointer-events
  layers.forEach((L, i) => {
    L.wrapper.dataset.index = i;
    L.canvas.classList.toggle('active', i === activeIndex);
    // image pointer-events: only active layer's images accept pointer
    L.images.forEach(imgObj => {
      imgObj.imgEl.style.pointerEvents = (i === activeIndex) ? 'auto' : 'none';
    });
    // wrapper top stacking
    L.wrapper.style.zIndex = i;
  });
  refreshLayerList();
}

/* -------------------------
   UI: layer list
   ------------------------- */
function refreshLayerList() {
  layerListEl.innerHTML = '';
  // Display top-first so user sees top layer on top
  for (let i = layers.length - 1; i >= 0; i--) {
    const arrIdx = i;
    const item = document.createElement('div');
    item.className = 'layer-item' + (arrIdx === activeIndex ? ' selected' : '');
    item.textContent = layers[arrIdx].name;
    item.addEventListener('click', () => setActiveLayer(arrIdx));
    layerListEl.appendChild(item);
  }
  removeLayerBtn.disabled = layers.length <= 1;
}

/* -------------------------
   Create / remove layers
   ------------------------- */
function addLayer(name = `レイヤー ${layers.length}`) {
  const size = getContainerSizeCss();
  const wrapper = document.createElement('div');
  wrapper.className = 'layer-wrapper';
  wrapper.style.position = 'absolute';
  wrapper.style.left = '0';
  wrapper.style.top = '0';
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  wrapper.style.pointerEvents = 'auto';

  const { canvas, ctx } = createCanvasForSize(size.w, size.h);
  canvas.style.position = 'absolute';
  canvas.style.left = '0';
  canvas.style.top = '0';

  wrapper.appendChild(canvas);
  CANVAS_CONTAINER.appendChild(wrapper);

  const layerObj = { id: layers.length, name, wrapper, canvas, ctx, images: [] };
  layers.push(layerObj);

  setActiveLayer(layers.length - 1);
  refreshLayerList();
}

function removeLayer(index) {
  if (layers.length <= 1) return;
  const L = layers[index];
  CANVAS_CONTAINER.removeChild(L.wrapper);
  layers.splice(index, 1);
  // reindex and re-zIndex
  layers.forEach((l, i) => {
    l.id = i;
    l.wrapper.style.zIndex = i;
  });
  if (activeIndex >= layers.length) activeIndex = layers.length - 1;
  setActiveLayer(activeIndex);
  refreshLayerList();
}

/* -------------------------
   Drawing (pen / erase)
   global pointer handlers — draw only when pointer on active canvas
   ------------------------- */
function getLocalPos(e, element) {
  const rect = element.getBoundingClientRect();
  const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
  const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

document.addEventListener('pointerdown', (e) => {
  const active = layers[activeIndex];
  if (!active) return;
  if (e.target !== active.canvas) return;
  isDrawing = true;
  lastPos = getLocalPos(e, active.canvas);
  e.preventDefault();
});

document.addEventListener('pointermove', (e) => {
  if (!isDrawing) return;
  const active = layers[activeIndex];
  if (!active) return;
  const pos = getLocalPos(e, active.canvas);
  const ctx = active.ctx;
  ctx.lineWidth = Number(sizeSlider.value);
  if (toolMode === 'draw') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = colorPicker.value;
  } else {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  }
  ctx.beginPath();
  ctx.moveTo(lastPos.x, lastPos.y);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  lastPos = pos;
});

document.addEventListener('pointerup', () => {
  isDrawing = false;
});

/* -------------------------
   Image management per-layer
   Each image: { imgEl, x, y, scale }
   Image DOM sits inside layer.wrapper on top of canvas,
   and is transformed via CSS transform: translate(x,y) scale(s)
   ------------------------- */
function createImageObject(url, dropClientX, dropClientY) {
  const active = layers[activeIndex];
  if (!active) return;
  const rect = CANVAS_CONTAINER.getBoundingClientRect();

  const imgEl = document.createElement('img');
  imgEl.draggable = false;
  imgEl.style.position = 'absolute';
  imgEl.style.left = '0';
  imgEl.style.top = '0';
  imgEl.style.transformOrigin = 'top left';
  imgEl.style.willChange = 'transform';
  imgEl.style.cursor = 'move';
  imgEl.style.maxWidth = 'none';
  imgEl.style.maxHeight = 'none';
  imgEl.style.pointerEvents = (activeIndex === layers.indexOf(active)) ? 'auto' : 'none';

  const state = {
    imgEl,
    x: rect.width / 2,
    y: rect.height / 2,
    scale: 1
  };

  if (typeof dropClientX === 'number' && typeof dropClientY === 'number') {
    state.x = dropClientX - rect.left;
    state.y = dropClientY - rect.top;
  }

  imgEl.onload = () => {
    // If image larger than container, scale down to fit
    const naturalW = imgEl.naturalWidth;
    const naturalH = imgEl.naturalHeight;
    const maxW = rect.width * 0.9;
    const maxH = rect.height * 0.9;
    let startScale = 1;
    if (naturalW > maxW || naturalH > maxH) {
      startScale = Math.min(maxW / naturalW, maxH / naturalH, 1);
    }
    state.scale = startScale;
    // center image around (x,y) by offsetting half of displayed width/height
    // we'll treat state.x/state.y as the top-left of the displayed image (consistent)
    updateImageTransform(state);
  };

  active.wrapper.appendChild(imgEl);
  active.images.push(state);

  makeImageInteractive(state);
  imgEl.src = url;
  return state;
}

function updateImageTransform(state) {
  // apply CSS transform for pixel-perfect placement (CSS pixels)
  state.imgEl.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
}

/* pointer + wheel + pinch handlers for an image state */
function makeImageInteractive(state) {
  const img = state.imgEl;
  let dragging = false;
  let start = { x: 0, y: 0 };
  let base = { x: 0, y: 0 };

  // For pinch/zoom support we track pointers
  const pointers = new Map();
  let basePinchDistance = null;
  let basePinchScale = 1;

  img.addEventListener('pointerdown', (e) => {
    // ensure image is manipulated only on active layer
    const active = layers[activeIndex];
    if (!active || active.wrapper !== img.parentElement) return;

    img.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      dragging = true;
      start = { x: e.clientX, y: e.clientY };
      base = { x: state.x, y: state.y };
    } else if (pointers.size === 2) {
      // setup pinch initial values
      const pts = Array.from(pointers.values());
      basePinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      basePinchScale = state.scale;
    }
    e.preventDefault();
  });

  img.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1 && dragging) {
      // single pointer drag
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      state.x = base.x + dx;
      state.y = base.y + dy;
      updateImageTransform(state);
    } else if (pointers.size === 2) {
      // pinch to zoom
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (basePinchDistance && basePinchDistance > 0) {
        const ratio = dist / basePinchDistance;
        state.scale = Math.max(0.05, basePinchScale * ratio);
        updateImageTransform(state);
      }
    }
  });

  img.addEventListener('pointerup', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      dragging = false;
      basePinchDistance = null;
      basePinchScale = state.scale;
    }
    try { img.releasePointerCapture(e.pointerId); } catch (err) {}
  });

  img.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    dragging = false;
    basePinchDistance = null;
  });

  // wheel to zoom (desktop)
  img.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.08 : 0.92;
    state.scale = Math.max(0.05, state.scale * delta);
    updateImageTransform(state);
  }, { passive: false });

  // ensure images only handle pointer if their layer is active; update on layer change
  // (the setActiveLayer function toggles pointer-events appropriately)
}

/* -------------------------
   Paste / drop handlers
   ------------------------- */
addImageBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  if (!f.type.startsWith('image/')) return;
  const url = URL.createObjectURL(f);
  createImageObject(url);
  // revoke later
  setTimeout(() => URL.revokeObjectURL(url), 20000);
  fileInput.value = '';
});

CANVAS_CONTAINER.addEventListener('dragover', (e) => { e.preventDefault(); });
CANVAS_CONTAINER.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file && file.type && file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    createImageObject(url, e.clientX, e.clientY);
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  }
});

/* -------------------------
   Export: composite all layers -> PNG
   Draw order: bottom -> top
   For each layer: draw canvas, then rasterize images at (x,y) with scale
   ------------------------- */
function exportPNG() {
  const rect = CANVAS_CONTAINER.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const out = document.createElement('canvas');
  out.width = Math.round(w * DPR);
  out.height = Math.round(h * DPR);
  out.style.width = w + 'px';
  out.style.height = h + 'px';
  const outCtx = out.getContext('2d');
  outCtx.scale(DPR, DPR);
  // optional white background
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, w, h);

  // draw each layer in order
  (function drawLayer(i) {
    if (i >= layers.length) {
      // done -> download
      const url = out.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'drawing.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      out.remove();
      return;
    }
    const L = layers[i];
    // draw canvas (the source canvas is in device pixels)
    outCtx.drawImage(L.canvas, 0, 0, L.canvas.width, L.canvas.height, 0, 0, w, h);

    // then draw images placed on the layer (if any)
    const imgs = L.images;
    if (!imgs || imgs.length === 0) {
      drawLayer(i + 1);
      return;
    }

    // draw images sequentially (load from imgEl.src may be immediate since already loaded)
    let loaded = 0;
    imgs.forEach((imgState) => {
      const src = imgState.imgEl.src;
      const raster = new Image();
      raster.crossOrigin = 'anonymous';
      raster.onload = () => {
        const drawW = raster.naturalWidth * imgState.scale;
        const drawH = raster.naturalHeight * imgState.scale;
        outCtx.drawImage(raster, imgState.x, imgState.y, drawW, drawH);
        loaded++;
        if (loaded === imgs.length) drawLayer(i + 1);
      };
      raster.onerror = () => {
        // skip problematic image
        loaded++;
        if (loaded === imgs.length) drawLayer(i + 1);
      };
      raster.src = src;
    });
  })(0);
}

/* -------------------------
   Resize handling
   Maintain pixel content by copying to temp canvas, then resizing and drawing back
   ------------------------- */
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const size = getContainerSizeCss();
    layers.forEach((L) => {
      // save current pixels
      const tmp = document.createElement('canvas');
      tmp.width = L.canvas.width;
      tmp.height = L.canvas.height;
      tmp.getContext('2d').drawImage(L.canvas, 0, 0);

      // resize canvas to new device pixels
      L.canvas.width = Math.round(size.w * DPR);
      L.canvas.height = Math.round(size.h * DPR);
      L.canvas.style.width = size.w + 'px';
      L.canvas.style.height = size.h + 'px';

      // reset ctx scale and draw previous (stretched)
      L.ctx = L.canvas.getContext('2d');
      L.ctx.scale(DPR, DPR);
      L.ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, 0, 0, size.w, size.h);
    });
    // images are placed in CSS pixels; they stay visually in place
  }, 150);
});

/* -------------------------
   Tool buttons
   ------------------------- */
penBtn.addEventListener('click', () => {
  toolMode = 'draw';
  penBtn.classList.add('active');
  eraserBtn.classList.remove('active');
});

eraserBtn.addEventListener('click', () => {
  toolMode = 'erase';
  eraserBtn.classList.add('active');
  penBtn.classList.remove('active');
});

addLayerBtn.addEventListener('click', () => addLayer());
removeLayerBtn.addEventListener('click', () => {
  if (confirm('レイヤーを削除しますか？')) removeLayer(activeIndex);
});

clearBtn.addEventListener('click', () => {
  if (!confirm('アクティブレイヤーをクリアしますか？')) return;
  const L = layers[activeIndex];
  if (!L) return;
  L.ctx.clearRect(0, 0, L.canvas.width, L.canvas.height);
});

saveBtn.addEventListener('click', exportPNG);

/* -------------------------
   Init: create background + one drawing layer
   ------------------------- */
function init() {
  // ensure container has CSS size (fallback if not)
  const rect = CANVAS_CONTAINER.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    CANVAS_CONTAINER.style.width = '600px';
    CANVAS_CONTAINER.style.height = '600px';
  }
  // background layer
  addLayer('背景');
  // fill background white
  const bg = layers[0];
  bg.ctx.fillStyle = '#ffffff';
  bg.ctx.fillRect(0, 0, bg.canvas.width / DPR, bg.canvas.height / DPR);

  // drawing layer
  addLayer('レイヤー 1');
  setActiveLayer(1);
  refreshLayerList();
}

init();

/* -------------------------
   Expose createImageObject for external use (optional)
   ------------------------- */
window.__createImageOnActiveLayer = function (url) {
  return createImageObject(url);
};
