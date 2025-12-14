// --- JavaScript ロジック ---

const canvasContainer = document.getElementById('canvasContainer');
const colorPicker = document.getElementById('colorPicker');
const sizeSlider = document.getElementById('sizeSlider');
const clearButton = document.getElementById('clearButton');
const saveButton = document.getElementById('saveButton');
const drawModeBtn = document.getElementById('drawModeBtn');
const eraserModeBtn = document.getElementById('eraserModeBtn');
const addLayerBtn = document.getElementById('addLayerBtn');
const removeLayerBtn = document.getElementById('removeLayerBtn');
const layerList = document.getElementById('layerList');

// --- 描画状態とレイヤー管理 ---
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let drawMode = 'draw'; // 'draw' or 'erase'

let layers = []; // { id, canvas, ctx } のオブジェクト配列
let activeLayerIndex = 0; // 現在描画対象となっているレイヤーのインデックス

const CANVAS_BASE_SIZE = 600; // キャンバスの基準サイズ (px)

// --- 初期化 ---

// レイヤー管理構造
class Layer {
    constructor(id, name, width, height) {
        this.id = id;
        this.name = name;
        this.canvas = document.createElement('canvas');
        this.canvas.id = `layer_${id}`;
        this.canvas.className = 'layer-canvas';
        
        // 高解像度ディスプレイ対応のためにスケールを設定
        const scale = window.devicePixelRatio; 
        this.canvas.width = width * scale;
        this.canvas.height = height * scale;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        
        this.ctx = this.canvas.getContext('2d');
        this.ctx.scale(scale, scale);
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // レイヤー0 (一番下) は常に白背景
        if (id === 0) {
            this.ctx.fillStyle = '#fff';
            this.ctx.fillRect(0, 0, width, height);
            this.canvas.style.zIndex = 1;
        } else {
            this.canvas.style.zIndex = id + 10; // 操作レイヤーを上位に
        }
    }
}

// キャンバスのサイズ設定 (固定サイズ)
function setCanvasContainerSize() {
    canvasContainer.style.width = CANVAS_BASE_SIZE + 'px';
    canvasContainer.style.height = CANVAS_BASE_SIZE + 'px';
}


// レイヤーの追加
function addLayer(name) {
    const newId = layers.length;
    const newLayer = new Layer(newId, name, CANVAS_BASE_SIZE, CANVAS_BASE_SIZE);
    
    layers.push(newLayer);
    canvasContainer.appendChild(newLayer.canvas);
    
    // 新しいレイヤーをアクティブにする
    setActiveLayer(newId);
    updateLayerList();
    
    // レイヤーが複数になったら削除ボタンを有効化
    if (layers.length > 1) {
        removeLayerBtn.disabled = false;
    }
}

// レイヤーの削除
function removeLayer() {
    if (layers.length <= 1) return; 
    
    const layerToRemove = layers[activeLayerIndex];
    
    // DOMから削除
    canvasContainer.removeChild(layerToRemove.canvas);
    
    // 配列から削除
    layers.splice(activeLayerIndex, 1);
    
    // アクティブレイヤーを調整 (削除されたレイヤーのすぐ下のレイヤーを選択)
    activeLayerIndex = Math.min(activeLayerIndex, layers.length - 1);
    
    setActiveLayer(layers[activeLayerIndex].id);
    updateLayerList();

    if (layers.length === 1) {
        removeLayerBtn.disabled = true;
    }
}


// アクティブレイヤーの設定
function setActiveLayer(id) {
    const newIndex = layers.findIndex(l => l.id === id);
    if (newIndex === -1) return;

    activeLayerIndex = newIndex;
    
    // イベントリスナーの解除とクラスの調整
    document.querySelectorAll('.layer-canvas').forEach(c => {
        c.classList.remove('active');
        // イベントはドキュメント全体で管理しているため、キャンバス単位のイベントリスナーは不要
    });

    // 新しいアクティブレイヤーに 'active' クラスを付与
    const activeCanvas = layers[activeLayerIndex].canvas;
    activeCanvas.classList.add('active');
    
    updateLayerList();
}

// レイヤーリストのUIを更新
function updateLayerList() {
    layerList.innerHTML = '';
    
    // リストは上から下へ描画されるため、レイヤー配列を逆順にして表示する (上が最前面)
    layers.slice().reverse().forEach(layer => {
        const item = document.createElement('div');
        item.className = 'layer-item' + (layer.id === layers[activeLayerIndex].id ? ' selected' : '');
        item.textContent = layer.name;
        item.dataset.layerId = layer.id;
        
        item.addEventListener('click', () => setActiveLayer(layer.id));
        layerList.appendChild(item);
    });
}

// 初期レイヤーの作成
setCanvasContainerSize(); // サイズを確定
addLayer('背景 (自動)');
addLayer('レイヤー 1');

// --- 描画/消しゴム関数 ---

function draw(e) {
    if (!isDrawing) return; 

    const ctx = layers[activeLayerIndex].ctx;
    if (!ctx) return;

    ctx.lineWidth = sizeSlider.value;
    
    if (drawMode === 'draw') {
        ctx.globalCompositeOperation = 'source-over'; // 標準描画
        ctx.strokeStyle = colorPicker.value;
    } else { // 'erase' モード
        // 修正点1: 消しゴム機能の修正 (destination-outで透明化)
        ctx.globalCompositeOperation = 'destination-out'; 
        ctx.strokeStyle = 'rgba(0,0,0,1)'; // 色は何でも良いが、このモードで透明化される
    }

    ctx.beginPath();
    ctx.moveTo(lastX, lastY); 
    
    // 現在のマウス/ポインター位置を取得
    const rect = layers[activeLayerIndex].canvas.getBoundingClientRect();
    
    // タッチイベントとマウスイベントの両方に対応
    const clientX = (e.clientX !== undefined) ? e.clientX : e.touches[0].clientX;
    const clientY = (e.clientY !== undefined) ? e.clientY : e.touches[0].clientY;

    const currentX = clientX - rect.left;
    const currentY = clientY - rect.top;

    ctx.lineTo(currentX, currentY); 
    ctx.stroke(); 

    [lastX, lastY] = [currentX, currentY];
}

// --- イベントハンドラ ---

function startDrawing(e) {
    // アクティブでないキャンバスでの描画開始は無視
    if (!e.target.classList.contains('active')) return; 

    isDrawing = true;
    e.preventDefault(); 
    
    const rect = layers[activeLayerIndex].canvas.getBoundingClientRect();
    
    const clientX = (e.clientX !== undefined) ? e.clientX : e.touches[0].clientX;
    const clientY = (e.clientY !== undefined) ? e.clientY : e.touches[0].clientY;

    lastX = clientX - rect.left;
    lastY = clientY - rect.top;

    draw(e); 
}

function stopDrawing() {
    isDrawing = false;
}

// --- ツールモード切り替え ---

function setToolMode(mode) {
    drawMode = mode;
    drawModeBtn.classList.remove('active');
    eraserModeBtn.classList.remove('active');
    
    if (mode === 'draw') {
        drawModeBtn.classList.add('active');
        canvasContainer.style.cursor = 'crosshair';
    } else {
        eraserModeBtn.classList.add('active');
        canvasContainer.style.cursor = 'cell';
    }
}

// --- 画像保存機能の追加 ---

function saveImage() {
    // 1. レイヤーをすべて結合するための仮想キャンバスを作成
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = CANVAS_BASE_SIZE;
    finalCanvas.height = CANVAS_BASE_SIZE;
    const finalCtx = finalCanvas.getContext('2d');
    
    // 2. すべてのレイヤーを順番に仮想キャンバスに描画
    const dpr = window.devicePixelRatio;
    
    layers.forEach(layer => {
        // レイヤーキャンバスを仮想キャンバスに描画
        finalCtx.drawImage(
            layer.canvas, 
            0, 0, 
            layer.canvas.width, 
            layer.canvas.height,
            0, 0,
            finalCanvas.width,
            finalCanvas.height
        );
    });

    // 3. データURLを取得し、ダウンロードリンクを作成
    const imageURL = finalCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = imageURL;
    a.download = 'my_drawing.png';
    
    // 4. ダウンロードを実行
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    finalCanvas.remove();
}

// --- イベントリスナーの設定 ---

// ドキュメント全体にイベントリスナーを設定
document.addEventListener('mousemove', draw);
document.addEventListener('mouseup', stopDrawing);
document.addEventListener('touchmove', draw);
document.addEventListener('touchend', stopDrawing);
document.addEventListener('touchcancel', stopDrawing);

// キャンバスへの描画開始はアクティブキャンバスでのみ検知
canvasContainer.addEventListener('mousedown', startDrawing);
canvasContainer.addEventListener('touchstart', startDrawing);


// ツールボタン
drawModeBtn.addEventListener('click', () => setToolMode('draw'));
eraserModeBtn.addEventListener('click', () => setToolMode('erase'));

clearButton.addEventListener('click', () => {
    // 修正点2: 「すべて消去」機能の修正 (背景レイヤー対応)
    if (confirm('アクティブレイヤーの内容をすべて消去しますか？')) {
        const activeLayer = layers[activeLayerIndex];
        const ctx = activeLayer.ctx;
        const width = CANVAS_BASE_SIZE;
        const height = CANVAS_BASE_SIZE;
        
        // レイヤーを完全に透明にする (描画内容のみ消去)
        ctx.clearRect(0, 0, width, height);
        
        // レイヤー0 (背景) の場合は、透明になった後に白で塗りつぶし直す
        if (activeLayer.id === 0) {
             ctx.fillStyle = '#fff';
             ctx.fillRect(0, 0, width, height);
        }
    }
});

saveButton.addEventListener('click', saveImage);

// レイヤーボタン
addLayerBtn.addEventListener('click', () => addLayer(`レイヤー ${layers.length}`));
removeLayerBtn.addEventListener('click', removeLayer);


// 初期化
setToolMode('draw');
