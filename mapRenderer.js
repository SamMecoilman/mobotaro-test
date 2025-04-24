// === 🧱 タイルマップ描画処理の追加（images/map.png, item.png 使用） ===
export const TILE_SIZE = 32;
export const FLOOR_COUNT = 1;
export const TILESET_COLS = 8;
export let floorIndex = 0;

export const tileset = new Image();
tileset.crossOrigin = "anonymous"; // ← 必須！
tileset.src = "images/map.png";

export const itemset = new Image();
itemset.crossOrigin = "anonymous"; // ← 同様に！
itemset.src = "images/item.png";

export const tileMaps = Array(FLOOR_COUNT).fill(null);
export const itemMaps = Array(FLOOR_COUNT).fill(null);

async function loadCsvMap(path) {
  const res = await fetch(path);
  const text = await res.text();
  return text.trim().split("\n").map(line => line.split(",").map(Number));
}

export async function loadAllMaps() {
  for (let i = 0; i < FLOOR_COUNT; i++) {
    tileMaps[i] = await loadCsvMap(`map/floor${i}_tile.csv`);
    itemMaps[i] = await loadCsvMap(`map/floor${i}_item.csv`);
    // 👇 ここに最大IDのログを追加
    const maxTileId = Math.max(...tileMaps[i].flat());
    console.log(`🧱 floor${i} tileMap 最大ID: ${maxTileId}`);
  }
}

export function createDummyTileMap(offset) {
  const map = [];
  const tilesX = Math.floor(canvas.width / TILE_SIZE);
  const tilesY = Math.floor(canvas.height / TILE_SIZE);
  for (let y = 0; y < tilesY; y++) {
    const row = [];
    for (let x = 0; x < tilesX; x++) {
      row.push((offset * 10 + (x + y) % 10) % 1024); // 仮tileId
    }
    map.push(row);
  }
  return map;
}

export function createDummyItemMap(offset) {
  const map = [];
  const tilesX = canvas.width / TILE_SIZE;
  const tilesY = canvas.height / TILE_SIZE;
  for (let y = 0; y < tilesY; y++) {
    const row = [];
    for (let x = 0; x < tilesX; x++) {
      const itemId = ((x + y + offset) % 15 === 0) ? (offset * 5 + (x % 10)) : -1;
      row.push(itemId); // -1 はアイテムなし
    }
    map.push(row);
  }
  return map;
}

export function drawTileLayer(tileMap, tilesetImage, ctx) {
  for (let y = 0; y < tileMap.length; y++) {
    for (let x = 0; x < tileMap[y].length; x++) {
      const tileId = tileMap[y][x];
      if (tileId < 0 || isNaN(tileId)) continue; // ← これを追加

      // 🔽 追加：タイルごとに背景色をつけて視覚テスト
      ctx.fillStyle = `rgb(${tileId * 50},0,0)`;  // 赤系の色分け
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      
      const sx = (tileId % TILESET_COLS) * TILE_SIZE;
      const sy = Math.floor(tileId / TILESET_COLS) * TILE_SIZE;

      ctx.drawImage(
        tilesetImage,
        sx, sy, TILE_SIZE, TILE_SIZE,
        x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE
      );
    }
  }
}

export function drawItemLayer(itemMap, itemsetImage, ctx) {
  if (!itemMap || !Array.isArray(itemMap) || itemMap.length === 0) return;
    for (let y = 0; y < itemMap.length; y++) {
      for (let x = 0; x < itemMap[y].length; x++) {
        const itemId = itemMap[y][x];
        if (itemId >= 0) {
          const sx = (itemId % TILESET_COLS) * TILE_SIZE;
          const sy = Math.floor(itemId / TILESET_COLS) * TILE_SIZE;
          ctx.drawImage(itemsetImage, sx, sy, TILE_SIZE, TILE_SIZE, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
}

export function drawMapLayers(ctx) {
  if (!ctx) return;
  // Canvasをクリア
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // テスト：tileId=1 のタイルを直接描画（tileset の2列目, 1行目）
  ctx.globalAlpha = 1.0; // 念のため透過無効化
  ctx.drawImage(
    tileset,   // ← images/map.png
    32, 0,     // ← tileId=1 の位置 (X=32, Y=0)
    32, 32,    // ← tileサイズ
    0, 0,      // ← 描画位置 (canvas左上)
    32, 32     // ← 描画サイズ（同じく）
  );

  console.log("🧪 tileId=1 の直接描画テスト完了");
  
  /*
  const tileMap = tileMaps[floorIndex];
  const itemMap = itemMaps[floorIndex];
  
  console.log("🖌️ drawMapLayers 呼び出し確認"); // ←★追記
  console.log("🧱 tileMap:", tileMap);
  console.log("🌱 itemMap:", itemMap);
  if (!tileMap || !itemMap) return;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  drawTileLayer(tileMap, tileset, ctx);
  drawItemLayer(itemMap, itemset, ctx);
  */
}

export function changeFloor(newFloor, ctx) {
  floorIndex = newFloor;
  drawMapLayers(ctx);
}

