// プレイヤー管理用の配列と自分のプレイヤーID
var players = [];
var myPlayerId = 0;

// 🎮 プレイヤーの状態管理用変数
const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
const spawn = getRandomSpawnPosition();
let x = spawn.x, y = spawn.y;
let direction = "front";
let frameIndex = 0;
let deathHandled = false;
let hp = 100, atk = 15;

const hpEl = document.getElementById("hp");
const atkEl = document.getElementById("atk");

const enemies = [];
let adachiExists = false;
let adachiHp = 100;
let lastEnemyMoveTime = Date.now();
let enemyMoveInterval = 5000 + Math.floor(Math.random() * 3000); // 5〜8秒ランダム

// 自分のプレイヤーのDOMを取得して代入
let player = document.getElementById("player");
players[myPlayerId] = {
  id: myPlayerId,
  x: x,
  y: y,
  hp: 100,
  maxHp: 100,
  element: player
};

player.style.left = x + "px";
player.style.top = y + "px";

// 他プレイヤー用の画像をロード（差し替え容易にするため変数に格納）
var otherPlayerImg = new Image();
otherPlayerImg.src = "images/mob_front_frame_2.png";  // 仮のプレイヤー画像

// テスト用他プレイヤーを追加
var player2 = {
    id: 1,
    x: 200, y: 100,         // 初期座標（例）
    hp: 100, maxHp: 100,    // 体力
    visible: true,
    image: otherPlayerImg   // 表示に使う画像
};
var player3 = {
    id: 2,
    x: 250, y: 150, 
    hp: 100, maxHp: 100,
    visible: true,
    image: otherPlayerImg
};
// players配列に追加
players.push(player2);
players.push(player3);

// 🎨 Canvas初期化：他プレイヤー描画用
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

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

// （ゲームループ内の描画処理の一部）他プレイヤーの描画
for (var i = 0; i < players.length; i++) {
    // 自分自身のプレイヤーは既存の描画処理で対応済みのためスキップ
    if (i === myPlayerId) continue;
    var p = players[i];
    // 存在し、表示フラグがtrueかつHPが残っているプレイヤーのみ描画
    if (p && p.visible && p.hp > 0) {
        // プレイヤーの画像を座標(x, y)に描画
        ctx.drawImage(p.image, p.x, p.y);
    }
}

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

// 🔧 ページ読み込み時のすべての初期化処理を統合
document.addEventListener("DOMContentLoaded", () => {
  // 音量設定
  menuBgm.play();
  document.getElementById("bgmVolume").addEventListener("input", e => {
    const vol = parseFloat(e.target.value);
    menuBgm.volume = vol;
    gameBgm.volume = vol;
  });

  // ESCキーでCONFIGトグル
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      const panel = document.getElementById("configPanel");
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  });

  // 📱 仮想コントローラーの表示判定
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  document.getElementById("mobile-controls").style.display = isMobile ? "flex" : "none";

  // 📱 仮想ボタンの長押し対応（DOMContentLoaded内に正しく設置）
  bindButtonHold("btn-up", "ArrowUp");
  bindButtonHold("btn-down", "ArrowDown");
  bindButtonHold("btn-left", "ArrowLeft");
  bindButtonHold("btn-right", "ArrowRight");
  bindButtonHold("btn-attack", " ");
});


// 📏 グリッド単位で位置を揃える（32px単位）
function snapToGrid(value) {
  return Math.round(value / 32) * 32;
}

function getRandomSpawnPosition() {
  const maxTiles = 16;
  let tries = 0;
  let px, py;
  do {
    px = Math.floor(Math.random() * maxTiles) * 32;
    py = Math.floor(Math.random() * maxTiles) * 32;
    tries++;
  } while (isTileBlocked(px, py) && tries < 50);
  return { x: px, y: py };
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

      // 💬 吹き出し削除（もし表示中なら）
      const bubbleId = enemy.dataset.bubbleId;
      if (bubbleId) {
        const bubble = document.querySelector(`[data-owner-id="${bubbleId}"]`);
        if (bubble) bubble.remove();
      }

      // タイマーが存在する場合は解除
      if (enemy.moveTimer) clearTimeout(enemy.moveTimer);
      enemy.remove();
      enemies.splice(i, 1);
      return;
    }
  }

  // 👨‍🏫 足立先生の攻撃処理（そのまま）
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
  
// PvP 判定を追加（他プレイヤーへの攻撃処理）
for (let i = 0; i < players.length; i++) {
  if (i === myPlayerId) continue;
  const p = players[i];
  if (!p || !p.hp || !p.element) continue;

  const px = snapToGrid(p.x);
  const py = snapToGrid(p.y);

  let hit = false;
  if (direction === "front" && px === x && py === y + 32) hit = true;
  else if (direction === "back" && px === x && py === y - 32) hit = true;
  else if (direction === "left" && px === x - 32 && py === y) hit = true;
  else if (direction === "right" && px === x + 32 && py === y) hit = true;

  if (hit) {
    p.hp -= atk;
    showDamage(atk, p.element);
    if (p.hp <= 0) {
      if (hp <= 0 && player) {
        player.remove();
      }
      p.element.remove();
      p.hp = 0;
    }
    return;
  }
}
}

// 🎞️ 歩行アニメーション処理
function animate() {
  updatePosition();
  checkEnemyAttack();
  const now = Date.now();
  frameIndex = (frameIndex + 1) % 3;
  player.src = `images/mob_${direction}_frame_${frameIndex + 1}.png`;
  setTimeout(() => requestAnimationFrame(animate), 150);
}

// 🧟 敵モブをランダムに動かす
function moveEnemies() {
  const directions = [
    { dx: 0, dy: -32 }, // 上
    { dx: 0, dy: 32 },  // 下
    { dx: -32, dy: 0 }, // 左
    { dx: 32, dy: 0 },  // 右
    { dx: 0, dy: 0 }    // 静止
  ];

  for (let enemy of enemies) {
    const dir = directions[Math.floor(Math.random() * directions.length)];
    const currentX = snapToGrid(parseInt(enemy.style.left));
    const currentY = snapToGrid(parseInt(enemy.style.top));
    const newX = currentX + dir.dx;
    const newY = currentY + dir.dy;

    if (!isTileBlocked(newX, newY)) {
      enemy.style.left = `${newX}px`;
      enemy.style.top = `${newY}px`;
    }

    // 🎈 静止してるときだけふきだしを出す
    if (dir.dx === 0 && dir.dy === 0) {
      const phrases = ["…退屈", "Zzz…", "誰か来いよ", "ヒマすぎ", "やる気でない"];
      const msg = document.createElement("div");
      const bubbleId = `bubble-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      msg.className = "bubble";
      msg.dataset.ownerId = bubbleId;
      enemy.dataset.bubbleId = bubbleId;

      msg.textContent = phrases[Math.floor(Math.random() * phrases.length)];
      msg.style.position = "absolute";
      msg.style.left = enemy.style.left;
      msg.style.top = `${parseInt(enemy.style.top) - 32}px`;
      msg.style.color = "white";
      msg.style.background = "rgba(0,0,0,0.7)";
      msg.style.padding = "2px 6px";
      msg.style.borderRadius = "6px";
      msg.style.fontSize = "12px";
      msg.style.zIndex = "999";
      msg.style.pointerEvents = "none";

      document.getElementById("map").appendChild(msg);
      setTimeout(() => msg.remove(), 1500);
    }
  }
}



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

// 🕒 敵個別の移動タイマーを開始（3〜8秒ごとに移動）
enemy.moveTimer = setTimeout(function moveSelf() {
  if (!document.body.contains(enemy)) return; // DOMから削除されたら中断
  const dx = [0, 32, -32, 0, 0];
  const dy = [0, 0, 0, 32, -32];
  const dir = Math.floor(Math.random() * dx.length);
  const newX = snapToGrid(parseInt(enemy.style.left)) + dx[dir];
  const newY = snapToGrid(parseInt(enemy.style.top)) + dy[dir];
  if (!isTileBlocked(newX, newY)) {
    enemy.style.left = `${newX}px`;
    enemy.style.top = `${newY}px`;
  }
  // 次の移動を予約
  enemy.moveTimer = setTimeout(moveSelf, 3000 + Math.random() * 5000);
}, 3000 + Math.random() * 5000);
  
  // 🎯 モブごとに独立した移動ループを開始
  const directions = [
    { dx: 0, dy: -32 },
    { dx: 0, dy: 32 },
    { dx: -32, dy: 0 },
    { dx: 32, dy: 0 },
    { dx: 0, dy: 0 }
  ];

  function moveThisEnemy() {
    const dir = directions[Math.floor(Math.random() * directions.length)];
    const currentX = snapToGrid(parseInt(enemy.style.left));
    const currentY = snapToGrid(parseInt(enemy.style.top));
    const newX = currentX + dir.dx;
    const newY = currentY + dir.dy;

    if (!isTileBlocked(newX, newY)) {
      enemy.style.left = `${newX}px`;
      enemy.style.top = `${newY}px`;
    }

    // 静止してたらふきだし表示
    if (dir.dx === 0 && dir.dy === 0) {
      const phrases = ["…退屈", "Zzz…", "誰か来いよ", "ヒマすぎ", "やる気でない"];
      const msg = document.createElement("div");
      const bubbleId = `bubble-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      msg.className = "bubble";
      msg.dataset.ownerId = bubbleId;
      enemy.dataset.bubbleId = bubbleId;

      msg.textContent = phrases[Math.floor(Math.random() * phrases.length)];
      msg.style.position = "absolute";
      msg.style.left = enemy.style.left;
      msg.style.top = `${parseInt(enemy.style.top) - 32}px`;
      msg.style.color = "white";
      msg.style.background = "rgba(0,0,0,0.7)";
      msg.style.padding = "2px 6px";
      msg.style.borderRadius = "6px";
      msg.style.fontSize = "12px";
      msg.style.zIndex = "999";
      msg.style.pointerEvents = "none";

      document.getElementById("map").appendChild(msg);
      setTimeout(() => msg.remove(), 1500);
    }

    // 🎯 次の移動はランダム時間後（3〜8秒）
    const nextDelay = 3000 + Math.floor(Math.random() * 5000);
    enemy.moveTimer = setTimeout(moveThisEnemy, nextDelay);
  }

  moveThisEnemy(); // 初回呼び出し
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

// 📱 仮想ボタンに長押し対応を追加するユーティリティ
function bindButtonHold(buttonId, key) {
  let interval;
  const btn = document.getElementById(buttonId);
  btn.addEventListener("touchstart", () => {
    window.pressKey(key); // 👈 既存の pressKey 関数を呼び出す
    interval = setInterval(() => window.pressKey(key), 200); // 200msごとにキー送信
  });
  btn.addEventListener("touchend", () => clearInterval(interval));
  btn.addEventListener("touchcancel", () => clearInterval(interval));
}

// ⛔ プレイヤーを攻撃するロジック（敵モブが隣接していたら攻撃）
function checkEnemyAttack() {
  for (let enemy of enemies) {
    const ex = snapToGrid(parseInt(enemy.style.left));
    const ey = snapToGrid(parseInt(enemy.style.top));

    const isAdjacent =
      (x === ex && y === ey - 32) ||
      (x === ex && y === ey + 32) ||
      (x === ex - 32 && y === ey) ||
      (x === ex + 32 && y === ey);

    if (isAdjacent) {
      hp -= 10;
      if (hp < 0) hp = 0; // ✅ 0未満にしない
      updateUI();
      showDamage(10, player);

      if (hp <= 0 && !deathHandled) { // ✅ 二重alert防止
        deathHandled = true;
        setTimeout(() => returnToTitle(true), 100); // alertはreturnToTitle内で出す
      }

      break;
    }
  }
}


function returnToTitle(showMessageAfter = false) {
  document.getElementById("game").style.display = "none";
  document.getElementById("menu").style.display = "block";
  gameBgm.pause();
  gameBgm.currentTime = 0;
  menuBgm.currentTime = 0;
  menuBgm.play();

  // HPなどをリセット
  x = 240;
  y = 240;
  hp = 100;
  updateUI();
  player.style.left = x + "px";
  player.style.top = y + "px";
  deathHandled = false; // ✅ 死亡フラグリセット

  if (showMessageAfter) {
    setTimeout(() => alert("あなたはやられた！"), 300); // ✅ 一度だけalertを出す
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

window.pressKey = function(key) {
  const down = new KeyboardEvent("keydown", { key });
  const up = new KeyboardEvent("keyup", { key });
  window.dispatchEvent(down);
  setTimeout(() => window.dispatchEvent(up), 100); // 0.1秒後にキーを離す
};

// ▶️ ゲーム開始時の処理（HTMLのonclickから呼ばれるため、グローバル公開する必要あり）
window.startGame = function () {
  document.getElementById("menu").style.display = "none";
  document.getElementById("game").style.display = "block";
  menuBgm.pause();
  gameBgm.currentTime = 0;
  gameBgm.play();
  updateUI();

  // 🎲 再開時もランダムリスポーン
  const spawn = getRandomSpawnPosition();
  x = spawn.x;
  y = spawn.y;

  // 再作成（消えている場合）
  if (!document.getElementById("player")) {
    const newPlayer = document.createElement("img");
    newPlayer.id = "player";
    newPlayer.src = `images/mob_front_frame_1.png`;
    newPlayer.style.position = "absolute";
    newPlayer.style.width = "32px";
    newPlayer.style.height = "48px";
    document.getElementById("map").appendChild(newPlayer);
  }

  const updatedPlayer = document.getElementById("player");
  updatedPlayer.style.left = x + "px";
  updatedPlayer.style.top = y + "px";
  player = updatedPlayer;
  players[myPlayerId].element = updatedPlayer;
  players[myPlayerId].x = x;
  players[myPlayerId].y = y;

  requestAnimationFrame(animate);
  setInterval(spawnEnemy, 1000);
};
