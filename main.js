(() => {
  const player = document.getElementById("player");
  const enemy = document.getElementById("enemy");
  const hpEl = document.getElementById("hp");
  const atkEl = document.getElementById("atk");
  const speed = 2;
  const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
  let direction = "front";
  let frameIndex = 0;
  let x = 240, y = 240;
  let hp = 100, atk = 15;

  function updateUI() {
    hpEl.textContent = hp;
    atkEl.textContent = atk;
  }

  function updatePosition() {
    if (keys.ArrowUp) y -= speed;
    if (keys.ArrowDown) y += speed;
    if (keys.ArrowLeft) x -= speed;
    if (keys.ArrowRight) x += speed;
    player.style.left = x + "px";
    player.style.top = y + "px";
  }

  function animate() {
    updatePosition();
    frameIndex = (frameIndex + 1) % 3;
    player.src = `images/mob_${direction}_frame_${frameIndex + 1}.png`;
    setTimeout(() => requestAnimationFrame(animate), 150);
  }

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

  function checkHit() {
    const px = x, py = y;
    const ex = parseInt(enemy.style.left), ey = parseInt(enemy.style.top);
    const dx = px - ex, dy = py - ey;
    if (Math.abs(dx) < 32 && Math.abs(dy) < 48) {
      showDamage(atk, enemy);
    }
  }

  window.addEventListener("keydown", e => {
    if (e.key.startsWith("Arrow")) keys[e.key] = true;
    if (e.key === " ") checkHit(); // spacebar attack
  });
  window.addEventListener("keyup", e => {
    if (e.key.startsWith("Arrow")) keys[e.key] = false;
  });

  updateUI();
  requestAnimationFrame(animate);
})();