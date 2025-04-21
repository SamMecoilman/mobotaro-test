
const bgm = new Audio("audio/bgm.mp3");
bgm.loop = true;
bgm.volume = 0.3;

const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
let x = 240, y = 240;
let direction = "front";
let frameIndex = 0;
let hp = 100, atk = 15;

const player = document.getElementById("player");
const enemy = document.getElementById("enemy");
const hpEl = document.getElementById("hp");
const atkEl = document.getElementById("atk");

function updateUI() {
  hpEl.textContent = hp;
  atkEl.textContent = atk;
}

function updatePosition() {
  const speed = 32;
  let newX = x;
  let newY = y;
  if (keys.ArrowUp) { newY -= speed; direction = "back"; }
  if (keys.ArrowDown) { newY += speed; direction = "front"; }
  if (keys.ArrowLeft) { newX -= speed; direction = "left"; }
  if (keys.ArrowRight) { newX += speed; direction = "right"; }

  if (!checkCollision(newX, newY)) {
    x = newX;
    y = newY;
  }

  player.style.left = x + "px";
  player.style.top = y + "px";
}

function checkCollision(newX, newY) {
  const ex = parseInt(enemy.style.left);
  const ey = parseInt(enemy.style.top);
  return Math.abs(newX - ex) < 32 && Math.abs(newY - ey) < 48;
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
  if (checkCollision(x, y)) {
    showDamage(atk, enemy);
  }
}

function animate() {
  updatePosition();
  frameIndex = (frameIndex + 1) % 3;
  player.src = `images/mob_${direction}_frame_${frameIndex + 1}.png`;
  setTimeout(() => requestAnimationFrame(animate), 150);
}

window.addEventListener("keydown", e => {
  if (e.key.startsWith("Arrow")) keys[e.key] = true;
  if (e.key === " ") checkHit();
});
window.addEventListener("keyup", e => {
  if (e.key.startsWith("Arrow")) keys[e.key] = false;
});

function startGame() {
  document.getElementById("menu").style.display = "none";
  document.getElementById("game").style.display = "block";
  bgm.play();
  updateUI();
  requestAnimationFrame(animate);
}
