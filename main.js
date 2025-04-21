// 🎵 各種BGMの読み込みと設定
const menuBgm = new Audio("audio/menu_bgm.mp3");
const gameBgm = new Audio("audio/game_bgm.mp3");
const adachiBgm = new Audio("audio/adachi_bgm.mp3");

// BGMをループ再生に設定し、初期音量を調整
adachiBgm.loop = true;
adachiBgm.volume = 0.3;
menuBgm.loop = true;
menuBgm.volume = 0.3;
gameBgm.loop = true;
gameBgm.volume = 0.3;

// 壁タイルリスト（後でマップと連携可能）
const wallTiles = new Set(); // 例: wallTiles.add("5x10") でタイル(5,10)が壁扱い

// 📏 グリッド単位で位置を揃える（32px単位）
function snapToGrid(value) {
  return Math.round(value / 32) * 32;
}

// 📦 指定座標が進入可能か判定（プレイヤー、敵共通）
function isTileBlocked(xPos, yPos) {
  const tx = xPos / 32;
  const ty = yPos / 32;
  const tileKey = `${tx}x${ty}`;
  if (wallTiles.has(tileKey)) return true;

  // 敵との衝突防止
  for (let enemy of enemies) {
    const ex = snapToGrid(parseInt(enemy.style.left));
    const ey = snapToGrid(parseInt(enemy.style.top));
    if (xPos === ex && yPos === ey) return true;
  }

  // 足立先生との衝突防止
  const adachi = document.getElementById("adachi");
  if (adachi) {
    const ax = snapToGrid(parseInt(adachi.style.left));
    const ay = snapToGrid(parseInt(adachi.style.top));
    if (xPos === ax && yPos === ay) return true;
  }
  return false;
}

// 🔧 ページが読み込まれた時の初期処理
// （省略: 既存のDOMContentLoaded部分はそのまま）

// 🎮 プレイヤーの状態管理用変数
// （省略: 既存の変数定義）

// ↔ プレイヤーの移動処理
function updatePosition() {
  let newX = x;
  let newY = y;
  if (keys.ArrowUp) { newY -= 32; direction = "back"; }
  if (keys.ArrowDown) { newY += 32; direction = "front"; }
  if (keys.ArrowLeft) { newX -= 32; direction = "left"; }
  if (keys.ArrowRight) { newX += 32; direction = "right"; }

  if (!isTileBlocked(newX, newY)) {
    x = snapToGrid(newX);
    y = snapToGrid(newY);
  }

  player.style.left = x + "px";
  player.style.top = y + "px";
}

// 🧟 敵モブをランダムに動かす
function moveEnemies() {
  for (let enemy of enemies) {
    const dx = [0, 32, -32, 0, 0];
    const dy = [0, 0, 0, 32, -32];
    const dir = Math.floor(Math.random() * dx.length);
    const newX = snapToGrid(parseInt(enemy.style.left)) + dx[dir];
    const newY = snapToGrid(parseInt(enemy.style.top)) + dy[dir];
    if (!isTileBlocked(newX, newY)) {
      enemy.style.left = `${newX}px`;
      enemy.style.top = `${newY}px`;
    }
  }
}

// 🧑‍🎓 敵をランダムにリスポーンさせる（最大30体／進入可能タイルのみ）
function spawnEnemy() {
  if (enemies.length >= 30 || adachiExists) return;
  const map = document.getElementById("map");
  const maxTiles = 16;
  let ex, ey, tries = 0;
  do {
    ex = Math.floor(Math.random() * maxTiles) * 32;
    ey = Math.floor(Math.random() * maxTiles) * 32;
    tries++;
  } while ((isTileBlocked(ex, ey) || (ex === x && ey === y)) && tries < 50);

  const enemy = document.createElement("img");
  enemy.src = "images/enemy.png";
  enemy.className = "enemy";
  enemy.style.position = "absolute";
  enemy.style.left = `${ex}px`;
  enemy.style.top = `${ey}px`;
  enemy.style.width = "32px";
  enemy.style.height = "48px";
  map.appendChild(enemy);
  enemies.push(enemy);
}

// 🧑‍🏫 足立先生の出現処理（1体のみ／進入可能タイル）
function spawnAdachi() {
  if (adachiExists) return;
  adachiExists = true;
  adachiHp = 100;
  const map = document.getElementById("map");
  const maxTiles = 16;
  let ax, ay, tries = 0;
  do {
    ax = Math.floor(Math.random() * maxTiles) * 32;
    ay = Math.floor(Math.random() * maxTiles) * 32;
    tries++;
  } while ((isTileBlocked(ax, ay) || (ax === x && ay === y)) && tries < 50);

  const adachi = document.createElement("div");
  adachi.id = "adachi";
  adachi.textContent = "👨‍🏫 足立先生、降臨";
  adachi.style.position = "absolute";
  adachi.style.left = `${ax}px`;
  adachi.style.top = `${ay}px`;
  adachi.style.color = "white";
  adachi.style.background = "rgba(150,0,0,0.7)";
  adachi.style.padding = "4px 8px";
  adachi.style.zIndex = "999";
  map.appendChild(adachi);

  gameBgm.pause();
  adachiBgm.currentTime = 0;
  adachiBgm.play();
}
