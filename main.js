
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let x = 200, y = 150;
let hp = 100;
let atk = 15;

document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") y -= 5;
    if (e.key === "ArrowDown") y += 5;
    if (e.key === "ArrowLeft") x -= 5;
    if (e.key === "ArrowRight") x += 5;
    if (e.key === "z") {
        drawHitEffect();
    }
    draw();
});

function drawHitEffect() {
    ctx.fillStyle = "yellow";
    ctx.beginPath();
    ctx.arc(x + 10, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "black";
    ctx.fillText("-15", x + 5, y - 10);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "blue";
    ctx.fillRect(x, y, 16, 16);
    ctx.fillStyle = "black";
    ctx.fillText("HP: " + hp + "  ATK: " + atk, 10, 10);
}

draw();
