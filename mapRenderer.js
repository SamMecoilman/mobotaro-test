// === 🧱 タイルマップ描画処理の追加（images/map.png, item.png 使用） ===
export const TILE_SIZE = 32;
export const FLOOR_COUNT = 4;
export const TILESET_COLS = 32;
export let floorIndex = 0;

export const tileset = new Image();
tileset.src = "images/map.png";

export const itemset = new Image();
itemset.src = "images/item.png";

export const tileMaps = Array.from({ length: FLOOR_COUNT }, (_, i) => createDummyTileMap(i));
export const itemMaps = Array.from({ length: FLOOR_COUNT }, (_, i) => createDummyItemMap(i));

export function createDummyTileMap(offset) {
  const map = [];
  const tilesX = canvas.width / TILE_SIZE;
  const tilesY = canvas.height / TILE_SIZE;
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
      const sx = (tileId % TILESET_COLS) * TILE_SIZE;
      const sy = Math.floor(tileId / TILESET_COLS) * TILE_SIZE;
      ctx.drawImage(tilesetImage, sx, sy, TILE_SIZE, TILE_SIZE, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
}

export function drawItemLayer(itemMap, itemsetImage, ctx) {
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
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  drawTileLayer(tileMaps[floorIndex], tileset, ctx);
  drawItemLayer(itemMaps[floorIndex], itemset, ctx);
}

export function changeFloor(newFloor) {
  floorIndex = newFloor;
  drawMapLayers();
}

