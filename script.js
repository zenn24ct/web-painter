// Minimal, working painter with multiple canvas layers.
// Features: add/remove/select layer, draw/erase on active layer, paste image to active layer, save PNG.
// Keep code minimal and clear.

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
let layers = []; // [{id, canvas, ctx, name}]
let activeIndex = 0;
let mode = 'draw'; // 'draw' or 'erase'
let drawing = false;
let last = {x:0,y:0};

// Ensure container has size (CSS sets it), but track rect for canvas sizing
function createCanvasElement(widthPx, heightPx){
  const c = document.createElement('canvas');
  // size in device pixels
  c.width = Math.round(widthPx * DPR);
  c.height = Math.round(heightPx * DPR);
  c.style.width = widthPx + 'px';
  c.style.height = heightPx + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(DPR, DPR);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return { canvas: c, ctx };
}

function addLayer(name = `レイヤー ${layers.length}`){
  const rect = CANVAS_CONTAINER.getBoundingClientRect();
  const width = Math.max(10, Math.round(rect.width));
  const height = Math.max(10, Math.round(rect.height));
  const {canvas, ctx} = createCanvasElement(width, height);
  canvas.className = 'layer-canvas';
  canvas.dataset.layer = layers.length;
  canvas.style.zIndex = layers.length; // stacking order
  CANVAS_CONTAINER.appendChild(canvas);
  layers.push({ id: layers.length, canvas, ctx, name });
  setActiveLayer(layers.length - 1);
  refreshLayerList();
  removeLayerBtn.disabled = layers.length <= 1;
}

function removeLayer(index){
  if(layers.length <= 1) return;
  const L = layers[index];
  CANVAS_CONTAINER.removeChild(L.canvas);
  layers.splice(index,1);
  // adjust zIndex and dataset
  layers.forEach((l, i)=>{
    l.canvas.dataset.layer = i;
    l.canvas.style.zIndex = i;
  });
  if(activeIndex >= layers.length) activeIndex = layers.length -1;
  setActiveLayer(activeIndex);
  refreshLayerList();
  removeLayerBtn.disabled = layers.length <= 1;
}

function setActiveLayer(index){
  if(index < 0 || index >= layers.length) return;
  activeIndex = index;
  layers.forEach((l,i)=>{
    l.canvas.classList.toggle('active', i === activeIndex);
  });
  refreshLayerList();
}

// Update layer list UI
function refreshLayerList(){
  layerListEl.innerHTML = '';
  // show top-to-bottom (last array element is top)
  for(let i = layers.length - 1; i >= 0; i--){
    const li = document.createElement('div');
    li.className = 'layer-item' + (i === activeIndex ? ' selected' : '');
    li.textContent = layers[i].name;
    li.addEventListener('click', ()=> {
      // When clicked in list, index from top -> convert
      const idxFromTop = i;
      // array index is same as i here because we iterated from end; compute actual index:
      const idx = i;
      setActiveLayer(idx);
    });
    layerListEl.appendChild(li);
  }
}

// Get pointer coords relative to active canvas (CSS pixels)
function getLocalPos(e, canvas){
  const rect = canvas.getBoundingClientRect();
  const clientX = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
  const clientY = (e.clientY !== undefined) ? e.clientY : (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

// Drawing handlers (global)
document.addEventListener('pointerdown', (e)=>{
  const active = layers[activeIndex];
  if(!active) return;
  if(e.target !== active.canvas) return; // only draw when pointer is on active canvas
  drawing = true;
  last = getLocalPos(e, active.canvas);
  e.preventDefault();
});
document.addEventListener('pointermove', (e)=>{
  if(!drawing) return;
  const active = layers[activeIndex];
  if(!active) return;
  const pos = getLocalPos(e, active.canvas);
  const ctx = active.ctx;
  ctx.lineWidth = Number(sizeSlider.value);
  if(mode === 'draw'){
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = colorPicker.value;
  } else {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  }
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  last = pos;
});
document.addEventListener('pointerup', ()=>{ drawing = false; });

// Tools
penBtn.addEventListener('click', ()=>{
  mode = 'draw';
  penBtn.classList.add('active');
  eraserBtn.classList.remove('active');
});
eraserBtn.addEventListener('click', ()=>{
  mode = 'erase';
  eraserBtn.classList.add('active');
  penBtn.classList.remove('active');
});

addLayerBtn.addEventListener('click', ()=> addLayer());
removeLayerBtn.addEventListener('click', ()=> {
  if(confirm('レイヤーを削除しますか？')) removeLayer(activeIndex);
});
clearBtn.addEventListener('click', ()=> {
  if(!confirm('アクティブレイヤーをクリアしますか？')) return;
  const a = layers[activeIndex];
  if(!a) return;
  a.ctx.clearRect(0,0, a.canvas.width, a.canvas.height);
});

// Image paste via file input
addImageBtn.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', (e)=>{
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  if(!f.type.startsWith('image/')) return;
  const url = URL.createObjectURL(f);
  pasteImageToActiveLayer(url);
  // revoke later
  setTimeout(()=>URL.revokeObjectURL(url), 20000);
  fileInput.value = '';
});

// Drag & drop image onto container
CANVAS_CONTAINER.addEventListener('dragover', (e)=>{ e.preventDefault(); });
CANVAS_CONTAINER.addEventListener('drop', (e)=>{
  e.preventDefault();
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if(file && file.type.startsWith('image/')){
    const url = URL.createObjectURL(file);
    // compute drop position relative to active canvas and draw image with top-left at drop
    pasteImageToActiveLayer(url, e.clientX, e.clientY);
    setTimeout(()=>URL.revokeObjectURL(url), 20000);
  }
});

// Draw image onto active layer canvas.
// If drop coordinates provided, place image with its top-left at that position; otherwise center.
function pasteImageToActiveLayer(url, clientX, clientY){
  const active = layers[activeIndex];
  if(!active) return;
  const img = new Image();
  img.onload = ()=>{
    const canvas = active.canvas;
    const rect = canvas.getBoundingClientRect();
    let x = (rect.width - img.naturalWidth) / 2;
    let y = (rect.height - img.naturalHeight) / 2;
    if(clientX !== undefined && clientY !== undefined){
      // convert client coords to canvas local
      x = clientX - rect.left;
      y = clientY - rect.top;
    }
    // ensure image fits — scale down if larger than canvas
    let drawW = img.naturalWidth;
    let drawH = img.naturalHeight;
    const maxW = rect.width - x;
    const maxH = rect.height - y;
    if(drawW > maxW || drawH > maxH){
      const ratio = Math.min(maxW / drawW, maxH / drawH, 1);
      drawW *= ratio;
      drawH *= ratio;
    }
    active.ctx.globalCompositeOperation = 'source-over';
    active.ctx.drawImage(img, x, y, drawW, drawH);
  };
  img.crossOrigin = 'anonymous';
  img.src = url;
}

// Save: composite all layers (in array order: bottom -> top)
saveBtn.addEventListener('click', ()=>{
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
  // optional: white background
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0,0,w,h);
  // draw in order
  for(let i = 0; i < layers.length; i++){
    outCtx.drawImage(layers[i].canvas, 0, 0, layers[i].canvas.width, layers[i].canvas.height, 0, 0, w, h);
  }
  const url = out.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'drawing.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  out.remove();
});

// Resize handler: if container size changes, resize canvases while preserving drawing by raster copy
let resizeTimeout = null;
window.addEventListener('resize', ()=>{
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const rect = CANVAS_CONTAINER.getBoundingClientRect();
    const w = Math.max(10, Math.round(rect.width));
    const h = Math.max(10, Math.round(rect.height));
    layers.forEach(layer => {
      // save pixels
      const temp = document.createElement('canvas');
      temp.width = layer.canvas.width;
      temp.height = layer.canvas.height;
      temp.getContext('2d').drawImage(layer.canvas, 0,0);
      // resize canvas
      layer.canvas.width = Math.round(w * DPR);
      layer.canvas.height = Math.round(h * DPR);
      layer.canvas.style.width = w + 'px';
      layer.canvas.style.height = h + 'px';
      layer.ctx.scale(DPR, DPR);
      // draw back (simple stretch)
      layer.ctx.drawImage(temp, 0,0, temp.width, temp.height, 0,0, w, h);
    });
  }, 120);
});

// Initialization: create two layers (background + drawing)
function init(){
  // ensure container has explicit size from CSS; if not, give default
  const rect = CANVAS_CONTAINER.getBoundingClientRect();
  if(rect.width === 0 || rect.height === 0){
    CANVAS_CONTAINER.style.width = '600px';
    CANVAS_CONTAINER.style.height = '600px';
  }
  addLayer('背景');
  // fill background white
  const bg = layers[0];
  bg.ctx.fillStyle = '#ffffff';
  bg.ctx.fillRect(0,0, bg.canvas.width / DPR, bg.canvas.height / DPR);

  addLayer('レイヤー 1');
  setActiveLayer(1);
  refreshLayerList();
}
init();
