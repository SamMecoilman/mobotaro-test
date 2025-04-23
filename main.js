import { tileset, itemset, drawMapLayers, changeFloor, loadAllMaps } from "./mapRenderer.js";
tileset.onload = () => {
  console.log("✅ tileset 読み込み成功", tileset.width, tileset.height);
};

// プレイヤー管理用の配列と自分のプレイヤーID
var players = [];
var myPlayerId = 0;

// ゲーム中かどうかのフラグ（タイトル画面では false）
let isGameStarted = false;

// モブキャラのスプライトシート
const spriteSheet = new Image();
spriteSheet.crossOrigin = "anonymous"; // ← srcより前に書く
spriteSheet.onload = () => {
  // 最初の描画開始（画像読み込み後に）
  requestAnimationFrame(animate);
};
spriteSheet.src = "images/eielIOFX.png";

// 🎮 プレイヤーの状態管理用変数
const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
let x, y;
let direction = "front";
let frameIndex = 0;
let deathHandled = false;

const hpEl = document.getElementById("hp");
const atkEl = document.getElementById("atk");

const enemies = [];
let adachiExists = false;
let adachiHp = 100;
let lastEnemyMoveTime = Date.now();
let enemyMoveInterval = 5000 + Math.floor(Math.random() * 3000); // 5〜8秒ランダム

// 自分のプレイヤーのDOMを取得して代入
let player = null; // DOMではなくcanvas管理
players[myPlayerId] = {
  id: myPlayerId,
  x: x,
  y: y,
  hp: 100,
  maxHp: 100,
  atk: 15,
  exp: 0,
  level: 1,
  nextLevelExp: 100,
  element: null
};

if (player && player.style) {
  player.style.left = x + "px";
  player.style.top = y + "px";
}
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
canvas.width = 96 * 32;
canvas.height = 48 * 32;
const ctx = canvas.getContext("2d");

// onloadで地形とアイテムを描画
tileset.onload = () => {
  itemset.onload = () => {
    drawMapLayers(ctx);
    requestAnimationFrame(animate);
  };
};

// UIボタンから階層切り替え可能
window.changeFloor = (i) => changeFloor(i, ctx);

// 🎵 各種BGMの読み込みと設定
const menuBgm = new Audio("audio/menu_bgm.mp3");
const gameBgm = new Audio("audio/game_bgm.mp3");
const adachiBgm = new Audio("audio/adachi_bgm.mp3");

// モブキャラ（プレイヤー or 他プレイヤー or 敵）ダメージボイス用（mob/damage/ フォルダにある複数音声）
const damageVoices = [
  "mob/damage/voice1.wav",
  "mob/damage/voice2.wav",
  "mob/damage/voice3.wav",
  // 実際のファイル名に合わせて増減OK
];
// 通常攻撃SE（固定）
const normalAttackSE = new Audio("mob/attack_SE/nomal.wav");

// BGMをループ再生に設定し、初期音量を調整
adachiBgm.loop = true;
adachiBgm.volume = 0.1;
menuBgm.loop = true;
menuBgm.volume = 0.1;
gameBgm.loop = true;
gameBgm.volume = 0.1;

// （ゲームループ内の描画処理の一部）他プレイヤーの描画
for (var i = 0; i < players.length; i++) {
    // 自分自身のプレイヤーは既存の描画処理で対応済みのためスキップ
    if (i === myPlayerId) continue;
    var p = players[i];
    // 存在し、表示フラグがtrueかつHPが残っているプレイヤーのみ描画
    if (p && p.visible && p.hp > 0) {
        // プレイヤーの画像を座標(x, y)に描画
        const otherFrameY = 1; // 例：下向き固定
        ctx.drawImage(spriteSheet, frameIndex * 32, otherFrameY * 32, 32, 32, p.x - 8, p.y, 48, 48);
    }
}

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

// 🔧 DOMの読み込みが完了したタイミングで初期化処理を実行
document.addEventListener("DOMContentLoaded", () => {
  // 🧠 即時実行関数（async IIFE）で非同期処理を安全に実行
  (async () => {
    try {
      // 🗺 外部CSVからマップデータを一括読み込み（メモリキャッシュ）
      await loadAllMaps();
      console.log("🗺 マップデータ読み込み完了");

      // 🎯 プレイヤーの初期スポーン座標を決定
      const spawn = getRandomSpawnPosition();
      x = spawn.x;
      y = spawn.y;

      // 🎮 プレイヤーの座標をスタイルへ反映（※canvas管理時は未使用の可能性あり）
      if (player && player.style) {
        player.style.left = x + "px";
        player.style.top = y + "px";
      }

      // 🎵 タイトル画面のBGMを再生
      menuBgm.play();

      // 🎚️ 音量スライダーの値をBGM・ゲームBGMへ反映
      document.getElementById("bgmVolume").addEventListener("input", e => {
        const vol = parseFloat(e.target.value);
        menuBgm.volume = vol;
        gameBgm.volume = vol;
      });

      // 🧩 ESCキーで設定パネルの表示/非表示を切り替え
      document.addEventListener("keydown", e => {
        if (e.key === "Escape") {
          const panel = document.getElementById("configPanel");
          panel.style.display = panel.style.display === "none" ? "block" : "none";
        }
      });

      // 📱 モバイル判定による仮想コントローラーの表示切り替え
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      document.getElementById("mobile-controls").style.display = isMobile ? "flex" : "none";

    } catch (e) {
      // ❗マップ読み込み失敗時のエラーハンドリング
      console.error("マップの読み込みに失敗しました", e);
    }
  })();
});

// 📱 仮想ボタンの長押し対応（DOMContentLoaded内に正しく設置）
["btn-up", "btn-down", "btn-left", "btn-right", "btn-attack"].forEach(id => {
  const btn = document.getElementById(id);
  if (btn) {
    const key = id === "btn-attack" ? " " : `Arrow${id.split("-")[1].charAt(0).toUpperCase() + id.split("-")[1].slice(1)}`;
    bindButtonHold(id, key);
  }
});


// 📏 グリッド単位で位置を揃える（32px単位）
function snapToGrid(value) {
  return Math.round(value / 32) * 32;
}

function getRandomSpawnPosition() {
  const mapWidth = canvas.width;
  const mapHeight = canvas.height;
  const tileSize = 32;
  
  const maxTilesX = Math.floor(mapWidth / tileSize);
  const maxTilesY = Math.floor(mapHeight / tileSize);
  
  let tries = 0;
  let px, py;
  do {
    px = Math.floor(Math.random() * maxTilesX) * tileSize;
    py = Math.floor(Math.random() * maxTilesY) * tileSize;
    tries++;
  } while (isTileBlocked(px, py) && tries < 50);
  return { x: px, y: py };
}

// 🧍 ステータスUIの表示を更新
function updateUI() {
  hpEl.textContent = players[myPlayerId].hp;
  atkEl.textContent = players[myPlayerId].atk;
  document.getElementById("level").textContent = players[myPlayerId].level;
  document.getElementById("exp").textContent = `${players[myPlayerId].exp}/${players[myPlayerId].nextLevelExp}`;
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
}

// 💥 ダメージ表示演出
function showDamage(amount, target) {
  const dmg = document.createElement("div");
  dmg.className = "damage";
  dmg.textContent = amount + "!";

  let px = 0;
  let py = 0;
  if (target && typeof target.getBoundingClientRect === "function") {
    const rect = target.getBoundingClientRect();
    px = rect.left + 5;
    py = rect.top - 20;
  } else {
    const canvasRect = canvas.getBoundingClientRect();
    px = canvasRect.left + x + 10;
    py = canvasRect.top + y - 20;
  }
  
  dmg.style.position = "absolute";
  dmg.style.left = px + "px";
  dmg.style.top = py + "px";

  document.body.appendChild(dmg);
  setTimeout(() => dmg.remove(), 1000);
}

// 🔍 攻撃が命中するかチェック（プレイヤー vs 全敵＋足立先生）
function checkHit() {
  const playerAtk = players[myPlayerId].atk;

  // 敵が目の前にいない場合は攻撃できない（SE/ボイスも出さない）
  let targetFound = false;
  const dxdy = { front: [0, 32], back: [0, -32], left: [-32, 0], right: [32, 0] };
  const [dx, dy] = dxdy[direction] || [0, 0];
  const tx = x + dx;
  const ty = y + dy;
  
  for (let enemy of enemies) {
    const ex = snapToGrid(parseInt(enemy.style.left));
    const ey = snapToGrid(parseInt(enemy.style.top));
    if (ex === tx && ey === ty) {
      targetFound = true;
      break;
    }
  }
  if (!targetFound) {
    const adachi = document.getElementById("adachi");
    if (adachi) {
      const ax = snapToGrid(parseInt(adachi.style.left));
      const ay = snapToGrid(parseInt(adachi.style.top));
      if (ax === tx && ay === ty) targetFound = true;
    }
  }
  for (let i = 0; i < players.length; i++) {
    if (i === myPlayerId) continue;
    const p = players[i];
    if (!p || !p.hp || !p.element) continue;
    const px = snapToGrid(p.x);
    const py = snapToGrid(p.y);
    if (px === tx && py === ty) {
      targetFound = true;
      break;
    }
  }
  if (!targetFound) return;
  
  // 🎵 ランダム攻撃ボイス（mob/attack/voice1〜3.wav）
  const attackVoiceId = Math.floor(Math.random() * 3) + 1;
  const attackVoice = new Audio(`mob/attack/voice${attackVoiceId}.wav`);
  attackVoice.volume = 0.7;
  attackVoice.play();

  // 🎵 プレイヤーの通常攻撃SE（既存のnormalAttackSEを使用）
  normalAttackSE.currentTime = 0;
  normalAttackSE.volume = 0.5;
  normalAttackSE.play();
  
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
      // 敵のHP処理を追加（耐久力を持たせる）
      let currentHp = parseInt(enemy.dataset.hp || "30");
      currentHp -= playerAtk;
      enemy.dataset.hp = currentHp;
      
      showDamage(playerAtk, enemy);
      
      if (enemy.dataset.type === 'passive') enemy.dataset.type = 'aggressive';
      
      // 💬 吹き出し削除（もし表示中なら）
      const bubbleId = enemy.dataset.bubbleId;
      if (bubbleId) {
        const bubble = document.querySelector(`[data-owner-id="${bubbleId}"]`);
        if (bubble) bubble.remove();
      }
      
      // HPが0以下なら削除と経験値処理
      if (currentHp <= 0) {
        if (enemy.moveTimer) clearTimeout(enemy.moveTimer);
        enemy.remove();
        enemies.splice(i, 1);
        players[myPlayerId].exp += 25;
        checkLevelUp();
      }
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
      showDamage(playerAtk, enemy);
      adachiHp -= playerAtk;
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

// 📢 レベルアップの吹き出し表示
function showLevelUpBubble(level) {
  const msg = document.createElement("div");
  const bubbleId = `levelup-${Date.now()}`;
  msg.className = "bubble";
  msg.dataset.ownerId = bubbleId;
  msg.textContent = `🎉 Lv.${level}にアップ！`;

  msg.style.left = `${x}px`;
  msg.style.top = `${y - 32}px`;

  document.getElementById("map").appendChild(msg);
  setTimeout(() => msg.remove(), 1500);
}

// 🆙 レベルアップ処理
function checkLevelUp() {
  const playerData = players[myPlayerId];
  let leveledUp = false; // 🔄 同期確認用フラグ
  while (playerData.exp >= playerData.nextLevelExp) {
    playerData.exp -= playerData.nextLevelExp;
    playerData.level += 1;
    playerData.nextLevelExp = Math.floor(playerData.nextLevelExp * 1.5);
    playerData.maxHp += 10;
    playerData.atk += 2;
    playerData.hp = playerData.maxHp;
    leveledUp = true;
    showLevelUpBubble(playerData.level); // ← alert ではなく吹き出し表示に変更
  }
  updateUI(); // 🔄 レベルアップしてなくても毎回UI更新
}


// 🎞️ 歩行アニメーション処理
// canvas に描画するための animate
function animate() {
  updatePosition();
  checkEnemyAttack();

  const now = Date.now();
  frameIndex = (frameIndex + 1) % 3;

  // 各方向を行番号にマッピング
  const directionMap = { front: 0, left: 1, back: 2, right: 3 };
  const frameY = directionMap[direction] ?? 0;

  // canvasを消去して再描画（背景がある場合は差し替え要）
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // プレイヤーのスプライトを描画
  ctx.drawImage(
    spriteSheet,
    frameIndex * 32,       // ← X位置（フレーム列）
    frameY * 32,           // ← Y位置（方向行）
    32, 32,                // ← 切り出しサイズ（32x32）
    x - 8, y,          // ← 描画先（プレイヤー座標）(32に対してプレイヤーを48にしてしまったため差分の-8で中央に立つようにしている)
    48, 48                 // ← 描画サイズ（1.5倍）
  );

  // 他プレイヤーなども再描画（必要ならここに追加）

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
    if (enemy.dataset.type === 'aggressive') {
      const dx = x - parseInt(enemy.style.left);
      const dy = y - parseInt(enemy.style.top);
      dir = { dx: Math.sign(dx) * 32, dy: Math.sign(dy) * 32 };
    }
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
  enemy.dataset.type = Math.random() < 0.5 ? 'passive' : 'aggressive';
  enemy.dataset.hp = 30; // プレイヤーの攻撃（15）を2回耐える
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

// 最終攻撃時間を追跡するマップ
const enemyAttackTimestamps = new Map();
// ⛔ プレイヤーを攻撃するロジック（敵モブが隣接していたら1秒後に攻撃）
function checkEnemyAttack() {
  for (let enemy of enemies) {
    if (enemy.dataset.type !== 'aggressive') continue;
    const ex = snapToGrid(parseInt(enemy.style.left));
    const ey = snapToGrid(parseInt(enemy.style.top));

    const isAdjacent =
      (x === ex && y === ey - 32) ||
      (x === ex && y === ey + 32) ||
      (x === ex - 32 && y === ey) ||
      (x === ex + 32 && y === ey);

    if (isAdjacent) {
      const now = Date.now();

      // 初めて隣接した or 離れてから再び隣接した場合、タイマー開始
      if (!enemy.firstAdjacentTime) {
        enemy.firstAdjacentTime = now;
        return;
      }

      // まだ1秒経っていないなら攻撃しない
      if (now - enemy.firstAdjacentTime < 1000) return;

      // 攻撃間隔制限（1秒に1回）
      if (enemy.lastAttack && now - enemy.lastAttack < 1000) return;
      enemy.lastAttack = now;

      // クリティカル判定
      const isCritical = Math.random() < 0.2;
      const damage = isCritical ? 20 : 10;

      // 攻撃ボイス（VOICE）
      const voiceId = Math.floor(Math.random() * 3) + 1;
      const voice = new Audio(`mob/attack/voice${voiceId}.wav`);
      voice.volume = 0.7;
      voice.play();

      // 攻撃SE（SE）
      const se = new Audio(isCritical ? "mob/attack_SE/critical.wav" : "mob/attack_SE/nomal.wav");
      se.volume = 0.6;
      se.play();

      // フラッシュ演出
      enemy.classList.add("enemy-attack-flash");
      setTimeout(() => enemy.classList.remove("enemy-attack-flash"), 150);

      // ダメージ処理
      players[myPlayerId].hp -= damage;
      if (players[myPlayerId].hp < 0) players[myPlayerId].hp = 0;

      updateUI();
      showDamage(damage, player);

      if (players[myPlayerId].hp <= 0 && !deathHandled) {
        deathHandled = true;
        setTimeout(() => returnToTitle(true), 100);
      }

      return; // 1体だけ処理して終わり
    } else {
      // 隣接していない：タイマーリセット
      enemy.firstAdjacentTime = 0;
      enemy.lastAttack = 0;
    }
  }
}



// ランダムダメージVoice & SE
function playEnemyAttackSound() {
  // ランダムにダメージボイスを選択
  const randomVoicePath = damageVoices[Math.floor(Math.random() * damageVoices.length)];
  const voiceAudio = new Audio(randomVoicePath);
  voiceAudio.play();

  // ダメージSEを再生（ボイスと同時）
  normalAttackSE.currentTime = 0;
  normalAttackSE.play();
}


// 敵が攻撃した瞬間、赤くフラッシュ
function flashRed(target) {
  target.style.transition = "filter 0.1s";
  target.style.filter = "brightness(2) sepia(1) hue-rotate(-50deg) saturate(5)";
  setTimeout(() => {
    target.style.filter = "";
  }, 100);
}

function returnToTitle(showMessageAfter = false) {
  document.getElementById("game").style.display = "none";
  document.getElementById("menu").style.display = "block";
  gameBgm.pause();
  gameBgm.currentTime = 0;
  menuBgm.currentTime = 0;
  menuBgm.play();

  // プレイヤーステータスをリセット
  const playerData = players[myPlayerId];
  playerData.hp = 100;
  playerData.maxHp = 100;
  playerData.atk = 15;
  playerData.exp = 0;
  playerData.level = 1;
  playerData.nextLevelExp = 100;

  updateUI();

  // プレイヤー位置をランダムに設定
  const spawn = getRandomSpawnPosition();
  x = spawn.x;
  y = spawn.y;
  
  if (player && player.style) {
    player.style.left = x + "px";
    player.style.top = y + "px";
  }
  deathHandled = false;
  isGameStarted = false; // ゲーム終了時に無効化

  if (showMessageAfter) {
    setTimeout(() => alert("あなたはやられた！"), 300);
  }
}



// 🎹 キー操作で移動 or 攻撃
window.addEventListener("keydown", e => {
  if (!isGameStarted) return; // ✅ タイトル画面では無視
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    e.preventDefault(); // ← デフォルトのスクロールを無効化
  }
  if (e.key.startsWith("Arrow")) keys[e.key] = true;
  if (e.key === " ") checkHit();
});

window.addEventListener("keyup", e => {
  if (!isGameStarted) return; // ✅ タイトル画面では無視
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    e.preventDefault(); // ← デフォルトのスクロールを無効化
  }
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
  isGameStarted = true; // ✅ ゲーム開始フラグON
  
  document.getElementById("menu").style.display = "none";
  document.getElementById("game").style.display = "block";
  menuBgm.pause();
  gameBgm.currentTime = 0;
  gameBgm.play();
  updateUI();

  // ⛔ 方向キー状態を初期化（これが今回の修正点）
  keys.ArrowUp = false;
  keys.ArrowDown = false;
  keys.ArrowLeft = false;
  keys.ArrowRight = false;

  
  // 🎲 再開時もランダムリスポーン
  const spawn = getRandomSpawnPosition();
  x = spawn.x;
  y = spawn.y;

  players[myPlayerId].x = x;
  players[myPlayerId].y = y;

  requestAnimationFrame(animate);
  setInterval(spawnEnemy, 1000);
};
