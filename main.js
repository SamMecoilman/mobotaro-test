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

// 🔧 ページが読み込まれた時の初期処理
document.addEventListener("DOMContentLoaded", () => {
  // メニューBGMを再生
  menuBgm.play();

  // 音量スライダー変更時の処理
  document.getElementById("bgmVolume").addEventListener("input", e => {
    const vol = parseFloat(e.target.value);
    menuBgm.volume = vol;
    gameBgm.volume = vol;
  });

  // ESCキーで設定パネルの表示/非表示を切り替え
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      const panel = document.getElementById("configPanel");
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  });
});

// 🎮 プレイヤーの状態管理用変数
const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
let x = 240, y = 240; // 初期座標
let direction = "front"; // 初期の向き
let frameIndex = 0; // アニメーションフレーム
let hp = 100, atk = 15; // ステータス

// DOM要素の取得
const player = document.getElementById("player");
const enemy = document.getElementById("enemy");
const hpEl = document.getElementById("hp");
const atkEl = document.getElementById("atk");

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

  // 押されたキーに応じて方向と移動先を決定
  if (keys.ArrowUp) { newY -= 32; direction = "back"; }
  if (keys.ArrowDown) { newY += 32; direction = "front"; }
  if (keys.ArrowLeft) { newX -= 32; direction = "left"; }
  if (keys.ArrowRight) { newX += 32; direction = "right"; }

  // 移動先が敵と重ならないなら移動実行
  if (!checkCollision(newX, newY)) {
    x = snapToGrid(newX);
    y = snapToGrid(newY);
  }

  // 実際のDOM位置を更新
  player.style.left = x + "px";
  player.style.top = y + "px";
}

// 🚫 敵との衝突判定
function checkCollision(newX, newY) {
  const ex = snapToGrid(parseInt(enemy.style.left));
  const ey = snapToGrid(parseInt(enemy.style.top));
  return newX === ex && newY === ey;
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
  setTimeout(() => dmg.remove(), 1000); // 1秒後に削除
}

// 🔍 攻撃が命中するかチェック
function checkHit() {
  const ex = snapToGrid(parseInt(enemy.style.left));
  const ey = snapToGrid(parseInt(enemy.style.top));
  let hit = false;

  // プレイヤーの向きと位置からヒット判定
  if (direction === "front" && ex === x && ey === y + 32) hit = true;
  else if (direction === "back" && ex === x && ey === y - 32) hit = true;
  else if (direction === "left" && ex === x - 32 && ey === y) hit = true;
  else if (direction === "right" && ex === x + 32 && ey === y) hit = true;

  // 命中時はダメージを表示
  if (hit) {
    showDamage(atk, enemy);
  }
}

// 🎞️ 歩行アニメーション処理
function animate() {
  updatePosition(); // 位置を更新
  frameIndex = (frameIndex + 1) % 3; // 3フレームでループ
  player.src = `images/mob_${direction}_frame_${frameIndex + 1}.png`; // フレーム画像切替
  setTimeout(() => requestAnimationFrame(animate), 150); // 約150msごとに再描画
}

// 🎹 キー操作で移動 or 攻撃
window.addEventListener("keydown", e => {
  if (e.key.startsWith("Arrow")) keys[e.key] = true;
  if (e.key === " ") checkHit(); // スペースで攻撃
});
window.addEventListener("keyup", e => {
  if (e.key.startsWith("Arrow")) keys[e.key] = false;
});

// ▶️ ゲーム開始時の処理
function startGame() {
  document.getElementById("menu").style.display = "none"; // メニュー非表示
  document.getElementById("game").style.display = "block"; // ゲーム画面表示
  menuBgm.pause(); // メニューBGM停止
  gameBgm.currentTime = 0;
  gameBgm.play(); // ゲームBGM再生
  updateUI(); // UI更新
  requestAnimationFrame(animate); // アニメ開始
}

// 🧑‍🏫 レイドボス足立先生の出現処理
function spawnAdachi() {
  const adachi = document.createElement("div");
  adachi.id = "adachi";
  adachi.textContent = "👨‍🏫 足立先生、降臨";
  adachi.style.position = "absolute";
  adachi.style.left = "320px";
  adachi.style.top = "64px";
  adachi.style.color = "white";
  adachi.style.background = "rgba(150,0,0,0.7)";
  adachi.style.padding = "4px 8px";
  adachi.style.zIndex = "999";
  document.getElementById("map").appendChild(adachi);

  gameBgm.pause();
  adachiBgm.currentTime = 0;
  adachiBgm.play();
}
