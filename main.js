(() => {
  const directions = ["front", "back", "left", "right"];
  const frameCount = 3;
  const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
  let direction = "front";
  let frameIndex = 0;
  let x = 240, y = 240;
  const speed = 2;
  const player = document.getElementById("player");

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
    frameIndex = (frameIndex + 1) % frameCount;
    const framePath = `images/mob_${direction}_frame_${frameIndex + 1}.png`;
    player.src = framePath;
    setTimeout(() => requestAnimationFrame(animate), 150);
  }

  window.addEventListener("keydown", e => keys[e.key] = true);
  window.addEventListener("keyup", e => keys[e.key] = false);

  requestAnimationFrame(animate);
})();
