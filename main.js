
const bgm = new Audio("audio/bgm.mp3");
bgm.loop = true;
bgm.volume = 0.3;

function startGame() {
  document.getElementById("menu").style.display = "none";
  document.getElementById("game").style.display = "block";
  bgm.play();
}
