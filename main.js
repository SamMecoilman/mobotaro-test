const menuBgm = new Audio("audio/menu_bgm.mp3");
const gameBgm = new Audio("audio/game_bgm.mp3");
const adachiBgm = new Audio("audio/adachi_bgm.mp3");
adachiBgm.loop = true;
adachiBgm.volume = 0.3;
menuBgm.loop = true;
menuBgm.volume = 0.3;
gameBgm.loop = true;
gameBgm.volume = 0.3;

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

const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
let x = 240, y = 240;
let direction = "front";
let frameIndex = 0;
let hp = 100, atk = 15;

const player = document.getElementById("player");
const enemy = document.getElementById("enemy");
const hpEl = document.getElementById("hp");
const atkEl = document.getElementById("atk");

function snapToGrid(value) {
  return Math.round(value / 32) * 32;
}

function updateUI() {
  hpEl.textContent = hp;
  atkEl.textContent = atk;
}

function updatePosition() {
  let newX = x;
  let newY = y;
  if (keys.ArrowUp) { newY -= 32; direction = "back"; }
  if (keys.ArrowDown) { newY += 32; direction = "front"; }
  if (keys.ArrowLeft) { newX -= 32; direction = "left"; }
  if (keys.ArrowRight) { newX += 32; direction = "right"; }

  if (!checkCollision(newX, newY)) {
    x = snapToGrid(newX);
    y = snapToGrid(newY);
  }

  player.style.left = x + "px";
  player.style.top = y + "px";
}

function checkCollision(newX, newY) {
  const ex = snapToGrid(parseInt(enemy.style.left));
  const ey = snapToGrid(parseInt(enemy.style.top));
  return newX === ex && newY === ey;
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
  const ex = snapToGrid(parseInt(enemy.style.left));
  const ey = snapToGrid(parseInt(enemy.style.top));
  let hit = false;

  if (direction === "front" && ex === x && ey === y + 32) hit = true;
  else if (direction === "back" && ex === x && ey === y - 32) hit = true;
  else if (direction === "left" && ex === x - 32 && ey === y) hit = true;
  else if (direction === "right" && ex === x + 32 && ey === y) hit = true;

  if (hit) {
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
  menuBgm.pause();
  gameBgm.currentTime = 0;
  gameBgm.play();
  updateUI();
  requestAnimationFrame(animate);
}


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
