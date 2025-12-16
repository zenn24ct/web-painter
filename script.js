'use strict';

/* =====================================================
   DOM要素の取得
   ===================================================== */
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

/* devicePixelRatio（Retina対策） */
const DPR = window.devicePixelRatio || 1;

/* =====================================================
   アプリ全体の状態
   ===================================================== */

/*
 layers 配列
  - index 0 が一番下
  - 最後の要素が一番上
  各レイヤーは以下の構造：
  {
    name,
    wrapper, // レイヤー全体を包む div
    canvas,  // 描画用 canvas
    ctx,     // canvas context
    images: [ { el, x, y, scale } ] // このレイヤー上の画像
  }
*/
let layers = [];
let activeLayerIndex = 0;

/* ペン or 消しゴム */
let toolMode = 'draw';

/* 描画中かどうか */
let isDrawing = false;
let lastPos = { x: 0, y: 0 };

/* 現在選択中の画像（ホイール拡大縮小用） */
let activeImageState = null;

/* =====================================================
   共通ユーティリティ
   ===================================================== */

/* canvasContainer の CSS上のサイズを取得 */
function getContainerSize() {
  const r = CANVAS_CONTAINER.getBoundingClientRect();
  return {
    w: Math.max(10, Math.round(r.width)),
    h: Math.max(10, Math.round(r.height))
  };
}

/* 指定サイズの canvas を作成（DPR対応） */
function createCanvas(w, h) {
  const canvas = document.createElement('canvas');

  // 実ピクセルサイズ
  canvas.width = Math.round(w * DPR);
  canvas.height = Math.round(h * DPR);

  // 表示サイズ（CSSピクセル）
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  canvas.className = 'layer-canvas';
  canvas.style.position = 'absolute';
  canvas.style.left = '0';
  canvas.style.top = '0';

  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR); // DPR分拡大
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  return { canvas, ctx };
}

/* canvas上のローカル座標を取得 */
function getLocalPos(e, el) {
  const r = el.getBoundingClientRect();
  return {
    x: e.clientX - r.left,
    y: e.clientY - r.top
  };
}

/* =====================================================
   レイヤー管理
   ===================================================== */

/* レイヤー追加 */
function addLayer(name = `レイヤー ${layers.length}`) {
  const { w, h } = getContainerSize();

  // レイヤー全体を包む wrapper
  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.left = '0';
  wrapper.style.top = '0';
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';

  // canvas作成
  const { canvas, ctx } = createCanvas(w, h);
  wrapper.appendChild(canvas);
  CANVAS_CONTAINER.appendChild(wrapper);

  layers.push({
    name,
    wrapper,
    canvas,
    ctx,
    images: []
  });

  // z-index を配列順に合わせる
  layers.forEach((l, i) => l.wrapper.style.zIndex = i);

  setActiveLayer(layers.length - 1);
  refreshLayerList();
}

/* レイヤー削除 */
function removeLayer(index) {
  if (layers.length <= 1) return;

  CANVAS_CONTAINER.removeChild(layers[index].wrapper);
  layers.splice(index, 1);

  activeLayerIndex = Math.max(0, Math.min(activeLayerIndex, layers.length - 1));
  layers.forEach((l, i) => l.wrapper.style.zIndex = i);

  setActiveLayer(activeLayerIndex);
  refreshLayerList();
}

/* アクティブレイヤー切り替え */
function setActiveLayer(index) {
  if (index < 0 || index >= layers.length) return;
  activeLayerIndex = index;

  layers.forEach((l, i) => {
    // アクティブな canvas のみ描画可能
    l.canvas.classList.toggle('active', i === activeLayerIndex);

    // 画像もアクティブレイヤーのみ操作可能
    l.images.forEach(img =>
      img.el.style.pointerEvents = i === activeLayerIndex ? 'auto' : 'none'
    );
  });

  refreshLayerList();
}

/* レイヤー一覧UI更新 */
function refreshLayerList() {
  layerListEl.innerHTML = '';

  // 上のレイヤーが上に表示されるよう逆順
  for (let i = layers.length - 1; i >= 0; i--) {
    const item = document.createElement('div');
    item.className =
      'layer-item' + (i === activeLayerIndex ? ' selected' : '');
    item.textContent = layers[i].name;
    item.onclick = () => setActiveLayer(i);
    layerListEl.appendChild(item);
  }

  removeLayerBtn.disabled = layers.length <= 1;
}

/* =====================================================
   描画処理
   ===================================================== */

/*
 pointerdown を container で拾う理由：
  - 上に別レイヤーがあっても
  - クリックした「見えているレイヤー」を特定するため
*/
CANVAS_CONTAINER.addEventListener('pointerdown', e => {
  activeImageState = null; // まず画像選択を解除

  // クリック位置にある要素を上から順に取得
  const hits = document.elementsFromPoint(e.clientX, e.clientY);

  let hitLayerIndex = null;
  let hitCanvas = false;

  for (const el of hits) {
    // 画像がヒットした場合
    if (el.tagName === 'IMG') {
      for (let i = layers.length - 1; i >= 0; i--) {
        if (layers[i].wrapper.contains(el)) {
          setActiveLayer(i);
          activeImageState = layers[i].images.find(img => img.el === el);
          return; // 画像操作優先
        }
      }
    }

    // canvasがヒットした場合
    if (el.classList && el.classList.contains('layer-canvas')) {
      for (let i = layers.length - 1; i >= 0; i--) {
        if (layers[i].canvas === el) {
          hitLayerIndex = i;
          hitCanvas = true;
          break;
        }
      }
      break;
    }
  }

  // レイヤーが特定できたら切り替え
  if (hitLayerIndex !== null) {
    setActiveLayer(hitLayerIndex);
  }

  // アクティブ canvas をクリックした場合のみ描画開始
  if (hitCanvas && hitLayerIndex === activeLayerIndex) {
    isDrawing = true;
    lastPos = getLocalPos(e, layers[activeLayerIndex].canvas);
  }
});

/* 描画中の線描画 */
document.addEventListener('pointermove', e => {
  if (!isDrawing) return;

  const layer = layers[activeLayerIndex];
  const pos = getLocalPos(e, layer.canvas);
  const ctx = layer.ctx;

  ctx.lineWidth = Number(sizeSlider.value);

  if (toolMode === 'draw') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = colorPicker.value;
  } else {
    ctx.globalCompositeOperation = 'destination-out';
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

/* =====================================================
   画像の追加・操作
   ===================================================== */

/* 画像追加 */
function addImage(url, clientX, clientY) {
  const layer = layers[activeLayerIndex];
  const rect = CANVAS_CONTAINER.getBoundingClientRect();

  const img = document.createElement('img');
  img.src = url;
  img.draggable = false;
  img.style.position = 'absolute';
  img.style.transformOrigin = 'top left';
  img.style.cursor = 'move';

  const state = {
    el: img,
    x: clientX ? clientX - rect.left : rect.width / 2,
    y: clientY ? clientY - rect.top : rect.height / 2,
    scale: 1
  };

  img.onload = () => {
    updateImageTransform(state);
  };

  enableImageDrag(state);

  layer.wrapper.appendChild(img);
  layer.images.push(state);
  activeImageState = state;
}

/* 画像の transform 更新 */
function updateImageTransform(s) {
  s.el.style.transform =
    `translate(${s.x}px, ${s.y}px) scale(${s.scale})`;
}

/* 画像のドラッグ */
function enableImageDrag(state) {
  let dragging = false;
  let startX = 0, startY = 0;
  let baseX = 0, baseY = 0;

  state.el.addEventListener('pointerdown', e => {
    activeImageState = state;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    baseX = state.x;
    baseY = state.y;
    state.el.setPointerCapture(e.pointerId);
  });

  state.el.addEventListener('pointermove', e => {
    if (!dragging) return;
    state.x = baseX + (e.clientX - startX);
    state.y = baseY + (e.clientY - startY);
    updateImageTransform(state);
  });

  state.el.addEventListener('pointerup', e => {
    dragging = false;
    state.el.releasePointerCapture(e.pointerId);
  });
}

/* ホイールで拡大縮小（containerで一元管理） */
CANVAS_CONTAINER.addEventListener('wheel', e => {
  if (!activeImageState) return;
  e.preventDefault();

  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  activeImageState.scale =
    Math.max(0.05, activeImageState.scale * factor);

  updateImageTransform(activeImageState);
}, { passive: false });

/* =====================================================
   UIイベント
   ===================================================== */

penBtn.onclick = () => {
  toolMode = 'draw';
  penBtn.classList.add('active');
  eraserBtn.classList.remove('active');
};

eraserBtn.onclick = () => {
  toolMode = 'erase';
  eraserBtn.classList.add('active');
  penBtn.classList.remove('active');
};

addLayerBtn.onclick = () => addLayer();
removeLayerBtn.onclick = () => removeLayer(activeLayerIndex);

clearBtn.onclick = () => {
  const layer = layers[activeLayerIndex];
  layer.ctx.clearRect(
    0, 0,
    layer.canvas.width,
    layer.canvas.height
  );
};

addImageBtn.onclick = () => fileInput.click();
fileInput.onchange = e => {
  const f = e.target.files[0];
  if (!f || !f.type.startsWith('image/')) return;
  const url = URL.createObjectURL(f);
  addImage(url);
};

CANVAS_CONTAINER.addEventListener('dragover', e => e.preventDefault());
CANVAS_CONTAINER.addEventListener('drop', e => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (!f || !f.type.startsWith('image/')) return;
  const url = URL.createObjectURL(f);
  addImage(url, e.clientX, e.clientY);
});

/* =====================================================
   保存（PNG）
   ===================================================== */

saveBtn.onclick = () => {
  const { w, h } = getContainerSize();
  const out = document.createElement('canvas');
  out.width = w * DPR;
  out.height = h * DPR;

  const ctx = out.getContext('2d');
  ctx.scale(DPR, DPR);

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  layers.forEach(layer => {
    ctx.drawImage(layer.canvas, 0, 0, w, h);
    layer.images.forEach(img => {
      const i = new Image();
      i.src = img.el.src;
      i.onload = () => {
        ctx.drawImage(
          i,
          img.x,
          img.y,
          i.naturalWidth * img.scale,
          i.naturalHeight * img.scale
        );
      };
    });
  });

  const a = document.createElement('a');
  a.href = out.toDataURL('image/png');
  a.download = 'drawing.png';
  a.click();
};

/* =====================================================
   初期化
   ===================================================== */
(function init() {
  if (CANVAS_CONTAINER.getBoundingClientRect().width === 0) {
    CANVAS_CONTAINER.style.width = '600px';
    CANVAS_CONTAINER.style.height = '600px';
  }

  // 背景レイヤー
  addLayer('背景');
  layers[0].ctx.fillStyle = '#fff';
  layers[0].ctx.fillRect(
    0, 0,
    layers[0].canvas.width / DPR,
    layers[0].canvas.height / DPR
  );

  // 描画レイヤー
  addLayer('レイヤー 1');
})();
