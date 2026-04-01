const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const speedEl = document.getElementById("speed");
const playerNameDisplay = document.getElementById("playerNameDisplay");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayMessage = document.getElementById("overlayMessage");
const startButton = document.getElementById("startButton");
const nameField = document.getElementById("nameField");
const playerNameInput = document.getElementById("playerNameInput");
const leaderboardList = document.getElementById("leaderboardList");
const touchButtons = document.querySelectorAll(".touch-btn");

const tileCount = 20;
const tileSize = canvas.width / tileCount;
const baseSpeed = 140;
const minSpeed = 60;
const leaderboardKey = "neon-snake-leaderboard";
const playerNameKey = "neon-snake-player-name";
const maxLeaderboardEntries = 5;

let snake;
let direction;
let nextDirection;
let food;
let score;
let speedLevel;
let currentPlayerName = "Guest";
let isRunning = false;
let isPaused = false;
let gameLoopId = null;
let audioContext = null;
let musicTimerId = null;
let musicStep = 0;

function resetGame() {
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 }
  ];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  food = placeFood();
  score = 0;
  speedLevel = 1;
  isPaused = false;
  scoreEl.textContent = String(score);
  speedEl.textContent = String(speedLevel);
  draw();
}

function sanitizePlayerName(name) {
  const cleaned = name.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 16) || "Guest";
}

function loadPlayerName() {
  const storedName = localStorage.getItem(playerNameKey);
  currentPlayerName = sanitizePlayerName(storedName || "Guest");
  playerNameInput.value = currentPlayerName === "Guest" ? "" : currentPlayerName;
  playerNameDisplay.textContent = currentPlayerName;
}

function savePlayerName() {
  currentPlayerName = sanitizePlayerName(playerNameInput.value);
  localStorage.setItem(playerNameKey, currentPlayerName);
  playerNameDisplay.textContent = currentPlayerName;
}

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(leaderboardKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderLeaderboard() {
  const entries = loadLeaderboard();
  leaderboardList.innerHTML = "";

  if (entries.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "leaderboard-empty";
    emptyItem.textContent = "No runs recorded yet. Be the first to light up the grid.";
    leaderboardList.appendChild(emptyItem);
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = entry.name;

    const scoreValue = document.createElement("span");
    scoreValue.className = "score-value";
    scoreValue.textContent = `${entry.score} pts`;

    item.append(name, scoreValue);
    leaderboardList.appendChild(item);
  });
}

function updateLeaderboard(finalScore) {
  const entries = loadLeaderboard();
  entries.push({
    name: currentPlayerName,
    score: finalScore
  });

  entries.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  localStorage.setItem(leaderboardKey, JSON.stringify(entries.slice(0, maxLeaderboardEntries)));
  renderLeaderboard();
}

function ensureAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    audioContext = new AudioContextClass();
  }
  return audioContext;
}

async function unlockAudio() {
  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    await context.resume();
  }
}

function createTone(frequency, duration, options = {}) {
  const context = ensureAudioContext();
  if (!context || context.state !== "running") {
    return;
  }

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const filter = context.createBiquadFilter();
  const now = context.currentTime;

  oscillator.type = options.type || "sine";
  oscillator.frequency.setValueAtTime(frequency, now);
  if (options.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, now + duration);
  }

  filter.type = options.filterType || "lowpass";
  filter.frequency.setValueAtTime(options.filterFrequency || 1500, now);

  const peak = options.volume || 0.04;
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(peak, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}

function createToneAt(frequency, duration, startOffset, options = {}) {
  const context = ensureAudioContext();
  if (!context || context.state !== "running") {
    return;
  }

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const filter = context.createBiquadFilter();
  const now = context.currentTime + startOffset;

  oscillator.type = options.type || "sine";
  oscillator.frequency.setValueAtTime(frequency, now);
  if (options.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, now + duration);
  }

  filter.type = options.filterType || "lowpass";
  filter.frequency.setValueAtTime(options.filterFrequency || 1800, now);
  if (options.q) {
    filter.Q.setValueAtTime(options.q, now);
  }

  const peak = options.volume || 0.04;
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.03, duration / 3));
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}

function playEatSound() {
  createToneAt(610, 0.07, 0, {
    type: "triangle",
    endFrequency: 820,
    volume: 0.05,
    filterFrequency: 2200
  });
  createToneAt(820, 0.08, 0.04, {
    type: "sine",
    endFrequency: 1240,
    volume: 0.04,
    filterFrequency: 2600
  });
  createToneAt(1240, 0.06, 0.08, {
    type: "triangle",
    endFrequency: 1520,
    volume: 0.026,
    filterFrequency: 3200
  });
}

function playGameOverSound() {
  createToneAt(340, 0.16, 0, {
    type: "sawtooth",
    endFrequency: 260,
    volume: 0.075,
    filterFrequency: 950,
    filterType: "bandpass",
    q: 5
  });
  createToneAt(255, 0.24, 0.1, {
    type: "triangle",
    endFrequency: 150,
    volume: 0.08,
    filterFrequency: 700
  });
  createToneAt(160, 0.34, 0.22, {
    type: "sawtooth",
    endFrequency: 68,
    volume: 0.095,
    filterFrequency: 480
  });
  createToneAt(92, 0.46, 0.26, {
    type: "sine",
    endFrequency: 52,
    volume: 0.05,
    filterFrequency: 320
  });
  createToneAt(72, 0.6, 0.18, {
    type: "triangle",
    endFrequency: 42,
    volume: 0.06,
    filterFrequency: 240
  });
}

function playSpeedUpSound() {
  createTone(520, 0.14, {
    type: "square",
    endFrequency: 740,
    volume: 0.03,
    filterFrequency: 1400
  });
}

function startBackgroundMusic() {
  const context = ensureAudioContext();
  if (!context || context.state !== "running" || musicTimerId) {
    return;
  }

  const notes = [196, 246.94, 293.66, 246.94, 174.61, 196, 220, 246.94];
  musicStep = 0;
  musicTimerId = setInterval(() => {
    if (!isRunning || isPaused) {
      return;
    }

    const baseNote = notes[musicStep % notes.length];
    createTone(baseNote, 0.38, {
      type: "triangle",
      volume: 0.018,
      filterFrequency: 900
    });
    createTone(baseNote * 2, 0.18, {
      type: "sine",
      volume: 0.008,
      filterFrequency: 1200
    });
    musicStep += 1;
  }, 420);
}

function stopBackgroundMusic() {
  clearInterval(musicTimerId);
  musicTimerId = null;
}

function placeFood() {
  let position;
  do {
    position = {
      x: Math.floor(Math.random() * tileCount),
      y: Math.floor(Math.random() * tileCount)
    };
  } while (snake?.some((segment) => segment.x === position.x && segment.y === position.y));
  return position;
}

function getDelay() {
  return Math.max(minSpeed, baseSpeed - (speedLevel - 1) * 14);
}

function scheduleNextTick() {
  clearTimeout(gameLoopId);
  if (isRunning && !isPaused) {
    gameLoopId = setTimeout(tick, getDelay());
  }
}

async function startGame() {
  savePlayerName();
  await unlockAudio();
  resetGame();
  isRunning = true;
  hideOverlay();
  startBackgroundMusic();
  scheduleNextTick();
}

function pauseGame() {
  if (!isRunning) {
    return;
  }

  isPaused = !isPaused;
  if (isPaused) {
    clearTimeout(gameLoopId);
    showOverlay("Paused", "Press P or use the button to continue your run through the neon grid.", "Resume Run");
  } else {
    hideOverlay();
    unlockAudio().then(startBackgroundMusic);
    scheduleNextTick();
  }
}

function tick() {
  direction = nextDirection;

  const head = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y
  };

  const hitWall =
    head.x < 0 ||
    head.x >= tileCount ||
    head.y < 0 ||
    head.y >= tileCount;

  const willGrow = head.x === food.x && head.y === food.y;
  const collisionBody = willGrow ? snake : snake.slice(0, -1);
  const hitSelf = collisionBody.some((segment) => segment.x === head.x && segment.y === head.y);

  if (hitWall || hitSelf) {
    gameOver();
    return;
  }

  snake.unshift(head);

  if (willGrow) {
    score += 1;
    scoreEl.textContent = String(score);
    playEatSound();

    const nextSpeedLevel = Math.floor(score / 3) + 1;
    if (nextSpeedLevel !== speedLevel) {
      speedLevel = nextSpeedLevel;
      speedEl.textContent = String(speedLevel);
      playSpeedUpSound();
    }

    food = placeFood();
  } else {
    snake.pop();
  }

  draw();
  scheduleNextTick();
}

function drawGridGlow() {
  ctx.save();
  for (let i = 0; i <= tileCount; i += 1) {
    const pos = i * tileSize;

    ctx.strokeStyle = "rgba(80, 255, 165, 0.09)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(canvas.width, pos);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSnake() {
  snake.forEach((segment, index) => {
    const x = segment.x * tileSize;
    const y = segment.y * tileSize;
    const inset = index === 0 ? 3 : 4;
    const size = tileSize - inset * 2;

    ctx.save();
    ctx.shadowBlur = index === 0 ? 28 : 20;
    ctx.shadowColor = "rgba(53, 255, 125, 0.95)";
    ctx.fillStyle = index === 0 ? "#7dffad" : "#35ff7d";
    ctx.strokeStyle = "rgba(221, 255, 233, 0.4)";
    ctx.lineWidth = 1.2;

    ctx.fillRect(x + inset, y + inset, size, size);
    ctx.strokeRect(x + inset, y + inset, size, size);
    ctx.restore();
  });
}

function drawFood() {
  const flicker = 0.7 + Math.random() * 0.3;
  const pulse = 0.15 + Math.abs(Math.sin(Date.now() / 120)) * 0.85;
  const x = food.x * tileSize + tileSize / 2;
  const y = food.y * tileSize + tileSize / 2;
  const radius = tileSize * 0.22 + pulse * 2.4;

  ctx.save();
  ctx.globalAlpha = flicker;
  ctx.shadowBlur = 30;
  ctx.shadowColor = "rgba(255, 232, 77, 0.95)";
  ctx.fillStyle = "#ffe84d";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 210, 0.95)";
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFrame() {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 79, 216, 0.25)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    20,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width / 2
  );
  gradient.addColorStop(0, "rgba(16, 34, 38, 0.65)");
  gradient.addColorStop(1, "rgba(2, 8, 12, 0.98)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGridGlow();
  drawFood();
  drawSnake();
  drawFrame();
}

function showOverlay(title, message, buttonText = "Restart Run", showNameInput = false) {
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  startButton.textContent = buttonText;
  nameField.hidden = !showNameInput;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function gameOver() {
  isRunning = false;
  isPaused = false;
  clearTimeout(gameLoopId);
  stopBackgroundMusic();
  playGameOverSound();
  updateLeaderboard(score);
  draw();
  showOverlay("System Crash", `Final score: ${score}. Press Space or use the button to launch another run.`, "Start Run", true);
}

function setDirection(newDirection) {
  const wouldReverse =
    newDirection.x === -direction.x &&
    newDirection.y === -direction.y;

  if (wouldReverse) {
    return;
  }

  nextDirection = newDirection;
}

function getDirectionFromName(name) {
  const directions = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  return directions[name] || null;
}

function handleKeydown(event) {
  const activeElement = document.activeElement;
  const isTypingInField =
    activeElement &&
    (activeElement.tagName === "INPUT" ||
      activeElement.tagName === "TEXTAREA" ||
      activeElement.isContentEditable);

  if (isTypingInField && event.key !== "Enter") {
    return;
  }

  const key = event.key.toLowerCase();

  if (key === " " || event.code === "Space") {
    event.preventDefault();
    if (!isRunning) {
      startGame();
    }
    return;
  }

  if (key === "p") {
    pauseGame();
    return;
  }

  const directions = {
    arrowup: { x: 0, y: -1 },
    w: { x: 0, y: -1 },
    arrowdown: { x: 0, y: 1 },
    s: { x: 0, y: 1 },
    arrowleft: { x: -1, y: 0 },
    a: { x: -1, y: 0 },
    arrowright: { x: 1, y: 0 },
    d: { x: 1, y: 0 }
  };

  if (directions[key]) {
    event.preventDefault();
    setDirection(directions[key]);
  }
}

startButton.addEventListener("click", () => {
  if (!isRunning) {
    startGame();
  } else if (isPaused) {
    pauseGame();
  }
});

playerNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !isRunning) {
    startGame();
  }
});

touchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    const directionName = button.dataset.direction;

    if (action === "pause") {
      pauseGame();
      return;
    }

    if (!isRunning) {
      startGame().then(() => {
        const direction = getDirectionFromName(directionName);
        if (direction) {
          setDirection(direction);
        }
      });
      return;
    }

    const direction = getDirectionFromName(directionName);
    if (direction) {
      setDirection(direction);
    }
  });
});

window.addEventListener("keydown", handleKeydown);

loadPlayerName();
renderLeaderboard();
resetGame();
showOverlay("Boot Sequence Ready", "Use arrow keys or WASD to steer the snake. Every 3 points increases the speed.", "Start Run", true);
