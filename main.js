(() => {
  const directions = ["front", "back", "left", "right"];
  const frames = { front: [], back: [], left: [], right: [] };
  const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
  let direction = "front";
  let frameIndex = 1;
  let x = 240, y = 240;
  const speed = 2;
  const game = document.getElementById("game");
  const player = document.getElementById("player");

  directions.forEach(dir => {
    for (let i = 1; i <= 3; i++) {
      const img = new Image();
      img.src = "images/mob_" + dir + "_frame_" + i + ".png";
      frames[dir].push(img);
    }
  });

  function updatePosition() {
    if (keys.ArrowUp) { direction = "back"; y -= speed; }
    else if (keys.ArrowDown) { direction = "front"; y += speed; }
    else if (keys.ArrowLeft) { direction = "left"; x -= speed; }
    else if (keys.ArrowRight) { direction = "right"; x += speed; }

    player.style.left = x + "px";
    player.style.top = y + "px";
  }

  function animate() {
    updatePosition();
    frameIndex = (frameIndex + 1) % 3;
    player.src = frames[direction][frameIndex].src;
    setTimeout(() => requestAnimationFrame(animate), 150);
  }

  window.addEventListener("keydown", e => keys[e.key] = true);
  window.addEventListener("keyup", e => keys[e.key] = false);

  requestAnimationFrame(animate);
})();
