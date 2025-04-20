(() => {
  // 矢印キーをキャラクターの方向に対応付け
  const keyToDir = { 
    "ArrowUp": "back",    // 上キー -> back（キャラクター後ろ向き）
    "ArrowDown": "front", // 下キー -> front（キャラクター正面向き）
    "ArrowLeft": "left",  // 左キー -> left（キャラ左向き）
    "ArrowRight": "right" // 右キー -> right（キャラ右向き）
  };
  const directions = ["back", "front", "left", "right"];
  // スプライト画像を保持する配列
  const frames = { back: [], front: [], left: [], right: [] };
  const totalFrames = 12;
  let loadedCount = 0;
  // 現在のスプライト状態
  let currentDirection = "front";
  let currentFrameIndex = 1; // 0,1,2 は各歩行フレーム（1が待機）
  let frameOrderIndex = 0;
  // 位置と移動に関する変数
  let x = 0, y = 0;
  const speed = 2;
  const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
  // 操作対象のDOM要素
  const playerImg = document.getElementById('player');
  const game = document.getElementById('game');

  // 全方向のフレーム画像を事前に読み込む
  directions.forEach(dir => {
    for (let i = 1; i <= 3; i++) {
      const img = new Image();
      img.src = "images/mob_" + dir + "_frame_" + i + ".png";
      img.onload = () => {
        loadedCount++;
        if (loadedCount === totalFrames) {
          initGame();
          requestAnimationFrame(gameLoop);
        }
      };
      frames[dir].push(img);
    }
  });

  function initGame() {
    // 初期のスプライトフレームと位置を設定
    currentDirection = "front";
    currentFrameIndex = 1;
    frameOrderIndex = 1; // 次の移動時にキャラが足を踏み出すフレームから開始するように設定
    playerImg.src = frames[currentDirection][currentFrameIndex].src;
    // キャラクターをマップ中央に配置
    const spriteW = frames[currentDirection][currentFrameIndex].width;
    const spriteH = frames[currentDirection][currentFrameIndex].height;
    x = (game.clientWidth - spriteW) / 2;
    y = (game.clientHeight - spriteH) / 2;
    playerImg.style.left = x + "px";
    playerImg.style.top = y + "px";
  }

  // キーボード入力の処理を設定
  window.addEventListener('keydown', e => {
    if (keyToDir[e.key] !== undefined) {
      e.preventDefault();
      keys[e.key] = true;
    }
  });
  window.addEventListener('keyup', e => {
    if (keyToDir[e.key] !== undefined) {
      e.preventDefault();
      keys[e.key] = false;
    }
  });

  // アニメーションのタイミング設定
  const frameOrder = [0, 1, 2, 1]; // 歩行アニメのフレーム順序
  let frameCounter = 0;
  const frameSwitchInterval = 10; // アニメーションフレーム切り替え間隔（速度調整用）

  // 移動とアニメーションのメインループ
  function gameLoop() {
    let moving = false;
    let newDirection = currentDirection;

    // 押下キーに応じて移動方向を決定し座標を更新
    if (keys["ArrowUp"])   { moving = true; newDirection = "back";  y -= speed; }
    else if (keys["ArrowDown"]) { moving = true; newDirection = "front"; y += speed; }
    else if (keys["ArrowLeft"]) { moving = true; newDirection = "left";  x -= speed; }
    else if (keys["ArrowRight"]){ moving = true; newDirection = "right"; x += speed; }

    // 範囲外に出ないように調整
    const spriteW = frames[currentDirection][currentFrameIndex].width;
    const spriteH = frames[currentDirection][currentFrameIndex].height;
    const maxX = game.clientWidth - spriteW;
    const maxY = game.clientHeight - spriteH;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x > maxX) x = maxX;
    if (y > maxY) y = maxY;

    // 方向転換時、新しい方向の待機フレームにリセット
    if (newDirection !== currentDirection) {
      currentDirection = newDirection;
      currentFrameIndex = 1;
      frameOrderIndex = frameOrder.length - 1; // シーケンスの最後（待機フレーム）に設定して次のフレームで足を踏み出すようにする
      frameCounter = 0;
      playerImg.src = frames[currentDirection][currentFrameIndex].src;
    }

    if (moving) {
      // アニメーション間隔が経過したらフレームを進める
      frameCounter++;
      if (frameCounter >= frameSwitchInterval) {
        frameCounter = 0;
        frameOrderIndex = (frameOrderIndex + 1) % frameOrder.length;
        currentFrameIndex = frameOrder[frameOrderIndex];
        playerImg.src = frames[currentDirection][currentFrameIndex].src;
      }
    } else {
      // 移動していない場合は待機フレームにする
      if (currentFrameIndex !== 1) {
        currentFrameIndex = 1;
        frameOrderIndex = 1;
        playerImg.src = frames[currentDirection][currentFrameIndex].src;
      }
    }

    // キャラクター位置を画面に反映
    playerImg.style.left = Math.round(x) + "px";
    playerImg.style.top = Math.round(y) + "px";
    requestAnimationFrame(gameLoop);
  }
})();
