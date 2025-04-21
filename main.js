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

// 壁タイルの管理（将来のマップ定義と連携予定）
const wallTiles = new Set(); // 例: wallTiles.add("5x10")

function isTileBlocked(xPos, yPos) {
  const tx = xPos / 32;
  const ty = yPos / 32;
  const key = `${tx}x${ty}`;
  if (wallTiles.has(key)) return true;
  for (let enemy of enemies) {
    const ex = snapToGrid(parseInt(enemy.style.left));
    const ey = snapToGrid(parseInt(enemy.style.top));
    if (xPos === ex && yPos === ey) return true;
  }
  const adachi = document.getElementById("adachi");
  if (adachi) {
    const ax = snapToGrid(parseInt(adachi.style.left));
    const ay = snapToGrid(parseInt(adachi.style.top));
    if (xPos === ax && yPos === ay) return true;
  }
  return false;
}

// 🔧 ページが読み込まれた時の初期処理
document.addEventListener("DOMContentLoaded", () => {
  menuBgm.play();
  document.getElementById("bgmVolume").addEventListener("input", e => {
    const vol = parseFloat(e.target.value);
    menuBgm.volume = vol;
    gameBgm.volume = vol;
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      const panel = document.getElementById("configPanel");
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  });
});

// 🎮 プレイヤーの状態管理用変数
const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
let x = 240, y = 240;
let direction = "front";
let frameIndex = 0;
let hp = 100, atk = 15;

const player = document.getElementById("player");
const hpEl = document.getElementById("hp");
const atkEl = document.getElementById("atk");

const enemies = [];
let adachiExists = false;
let adachiHp = 100;

// 📏 グリッド単位で位置を揃える（32px単位）
function snapToGrid(value) {
  return Math.round(value / 32) * 32;
}

// 🧍 ステータスUIの表示を更新
function updateUI() {
  hpEl.textContent = hp;
  atkEl.textContent = atk;
}

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

// 💥 ダメージ表示演出
function showDamage(amount, target) {
  const dmg = document.createElement("div");
  dmg.className = "damage";
  dmg.textContent = amount + "!";
  const rect = target.getBoundingClientRect();
  dmg.style.left = (rect.left + 5) + "px";
  dmg.style.top = (rect.top - 20) + "px";
  document.body.appendChild(dmg);
  setTimeout(() => dmg.remove(), 1000);
}

// 🔍 攻撃が命中するかチェック（プレイヤー vs 全敵＋足立先生）
function checkHit() {
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    const ex = snapToGrid(parseInt(enemy.style.left));
    const ey = snapToGrid(parseInt(enemy.style.top));
    let hit = false;
    if (direction === "front" && ex === x && ey === y + 32) hit = true;
    else if (direction === "back" && ex === x && ey === y - 32) hit = true;
    else if (direction === "left" && ex === x - 32 && ey === y) hit = true;
    else if (direction === "right" && ex === x + 32 && ey === y) hit = true;
    if (hit) {
      showDamage(atk, enemy);
      enemy.remove();
      enemies.splice(i, 1);
      return;
    }
  }
  const adachi = document.getElementById("adachi");
  if (adachi) {
    const ax = snapToGrid(parseInt(adachi.style.left));
    const ay = snapToGrid(parseInt(adachi.style.top));
    let hit = false;
    if (direction === "front" && ax === x && ay === y + 32) hit = true;
    else if (direction === "back" && ax === x && ay === y - 32) hit = true;
    else if (direction === "left" && ax === x - 32 && ay === y) hit = true;
    else if (direction === "right" && ax === x + 32 && ay === y) hit = true;
    if (hit) {
      adachiHp -= atk;
      showDamage(atk, adachi);
      if (adachiHp <= 0) {
        adachi.remove();
        adachiExists = false;
        gameBgm.play();
      }
    }
  }
}

// 🎞️ 歩行アニメーション処理
function animate() {
  updatePosition();
  frameIndex = (frameIndex + 1) % 3;
  player.src = `images/mob_${direction}_frame_${frameIndex + 1}.png`;
  moveEnemies();
  setTimeout(() => requestAnimationFrame(animate), 150);
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

// 🎹 キー操作で移動 or 攻撃
window.addEventListener("keydown", e => {
  if (e.key.startsWith("Arrow")) keys[e.key] = true;
  if (e.key === " ") checkHit();
});
window.addEventListener("keyup", e => {
  if (e.key.startsWith("Arrow")) keys[e.key] = false;
});

// 🧑‍🎓 敵をランダムにリスポーンさせる（最大30体／ブロック回避）
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

// 🧑‍🏫 足立先生の出現処理（1体のみ／ブロック回避）
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

// ▶️ ゲーム開始時の処理
function startGame() {
  document.getElementById("menu").style.display = "none";
  document.getElementById("game").style.display = "block";
  menuBgm.pause();
  gameBgm.currentTime = 0;
  gameBgm.play();
  updateUI();
  requestAnimationFrame(animate);
  setInterval(spawnEnemy, 1000);
}
