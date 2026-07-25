const keys = {};
const vKeys = { up: false, down: false, left: false, right: false };

const HERO_IMAGE_MAX = 8; // hero.png〜hero8.png（完全武装）
const LEVELUP_CEREMONY_MS = 1200;
const WAVE_SPAWN_MS = 550;
const BOSS_BANNER_MS = 1600;
const BOSS_HP_MAX = 5;
const BOSS_SIZE = 140;
const PLAYER_SIZE = Math.round(96 * 1.2);
const ENEMY_SIZE = 72;
const PLAYER_HIT_SCALE = 0.38;
const ENEMY_HIT_SCALE = 0.40;
const BOSS_HIT_SCALE = 0.55;

const ENEMY_WAVE_FILTERS = [
  "none",
  "hue-rotate(55deg) saturate(1.45)",
  "hue-rotate(135deg) saturate(1.4) brightness(1.05)",
  "hue-rotate(210deg) saturate(1.5)",
  "hue-rotate(280deg) saturate(1.35) brightness(1.08)",
  "hue-rotate(320deg) saturate(1.55) contrast(1.1)"
];

const HERO_UNLOCK_TEXT = {
  2: "赤シャツを着た！",
  3: "ズボンを履いた！",
  4: "棍棒と仲間を手に入れた！",
  5: "ヘルメットをかぶった！",
  6: "鎧を装着した！",
  7: "盾を装備した！",
  8: "剣を手に入れた！完全武装！"
};

const gameState = {
  player: { x: 0, y: 0, speed: 4, hp: 3, exp: 0, level: 1, combo: 0 },
  enemies: [],
  isPaused: false,
  quizData: {},
  gameStarted: false,
  wave: 1,
  gearComplete: false, // Lv.8到達
  bossPending: false, // 装備完了後の次ウェーブで魔王
  bossActive: false,
  bossDefeated: false,
  bossHp: BOSS_HP_MAX,
  usedQuizKeys: new Set(),
  flatQuizzes: [] // { genre, q, a, c, d, key }
};

let bgmField, bgmBoss, seCorrect, seWrong, seLevelup;
let lastTouchEnd = 0;

function setupAudio() {
  bgmField = document.getElementById("bgm-field");
  bgmBoss = document.getElementById("bgm-boss");
  seCorrect = document.getElementById("se-correct");
  seWrong = document.getElementById("se-wrong");
  seLevelup = document.getElementById("se-levelup");

  bgmField.src = "./audio/field.mp3";
  bgmBoss.src = "./audio/maou.mp3";
  seCorrect.src = "./audio/seikai2.mp3";
  seWrong.src = "./audio/fuseikai2.mp3";
  seLevelup.src = "./audio/levelup.mp3";

  bgmField.loop = true;
  bgmBoss.loop = true;
  [bgmField, bgmBoss, seCorrect, seWrong, seLevelup].forEach(a => {
    if (a) a.preload = "auto";
  });
}

function stopBgm(audio) {
  if (!audio) return;
  audio.pause();
  try { audio.currentTime = 0; } catch (_) { /* ignore */ }
}

function playBgm(audio, volume) {
  if (!audio) return;
  audio.volume = volume;
  audio.play().catch(() => {});
}

function startFieldBgm() {
  stopBgm(bgmBoss);
  playBgm(bgmField, 0.3);
}

function startBossBgm() {
  stopBgm(bgmField);
  playBgm(bgmBoss, 0.35);
}

function playSe(audio) {
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

document.addEventListener("DOMContentLoaded", async () => {
  await new Promise(resolve => {
    if (document.readyState === "complete") resolve();
    else window.addEventListener("load", resolve);
  });

  setupAudio();
  setupTouchGuards();

  document.addEventListener("keydown", e => {
    keys[e.key] = true;
  });
  document.addEventListener("keyup", e => {
    delete keys[e.key];
  });

  [["btn-up", "up"], ["btn-down", "down"], ["btn-left", "left"], ["btn-right", "right"]].forEach(([id, dir]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    ["mousedown", "touchstart"].forEach(ev =>
      btn.addEventListener(ev, e => {
        e.preventDefault();
        vKeys[dir] = true;
      }, { passive: false })
    );
    ["mouseup", "mouseleave", "touchend", "touchcancel"].forEach(ev =>
      btn.addEventListener(ev, e => {
        e.preventDefault();
        vKeys[dir] = false;
      }, { passive: false })
    );
  });

  document.getElementById("restart-button").addEventListener("click", () => {
    location.reload();
  });
  document.getElementById("ending-title-btn").addEventListener("click", () => {
    location.reload();
  });
  document.getElementById("title-start").addEventListener("click", startGame);

  await loadQuizData();
  placePlayerAtCenter();
  updateStatusUI();
  requestAnimationFrame(gameLoop);
});

function setupTouchGuards() {
  document.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
  document.addEventListener("selectstart", e => e.preventDefault());
  document.addEventListener("dragstart", e => e.preventDefault());
  document.addEventListener("touchend", e => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, false);
}

function startGame() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try { navigator.vibrate(15); } catch (_) { /* ignore */ }
  }
  document.getElementById("title-container").classList.add("hidden");
  gameState.gameStarted = true;
  startFieldBgm();
  spawnEnemies();
}

function placePlayerAtCenter() {
  const area = document.getElementById("game-area");
  const playerEl = document.getElementById("player");
  gameState.player.x = Math.max(0, (area.clientWidth - PLAYER_SIZE) / 2);
  gameState.player.y = Math.max(0, (area.clientHeight - PLAYER_SIZE) / 2);
  playerEl.style.left = gameState.player.x + "px";
  playerEl.style.top = gameState.player.y + "px";
}

function updateStatusUI() {
  const hp = gameState.player.hp;
  document.getElementById("hp-hearts").textContent = "♥".repeat(Math.max(0, hp));
  document.getElementById("exp-fill").style.width = `${gameState.player.exp % 100}%`;
  document.getElementById("exp-text").textContent = `${gameState.player.exp % 100}/100`;
  document.getElementById("level-display").textContent = `Lv.${gameState.player.level}`;
  document.getElementById("combo-count").textContent = gameState.player.combo;

  const bossBox = document.getElementById("boss-hp-container");
  if (gameState.bossActive && !gameState.bossDefeated) {
    bossBox.classList.remove("hidden");
    document.getElementById("boss-hp-hearts").textContent =
      "♥".repeat(Math.max(0, gameState.bossHp));
  } else {
    bossBox.classList.add("hidden");
  }
  updatePlayerImage();
}

function getHeroImageName(level) {
  const imageLevel = Math.max(1, Math.min(HERO_IMAGE_MAX, level));
  return imageLevel === 1 ? "hero.png" : `hero${imageLevel}.png`;
}

function updatePlayerImage() {
  const playerEl = document.getElementById("player");
  playerEl.style.backgroundImage = `url('./images/${getHeroImageName(gameState.player.level)}')`;
}

function getUnlockText(newLevel) {
  return HERO_UNLOCK_TEXT[newLevel] || `Lv.${newLevel} に上がった！`;
}

function showLevelUpCeremony(fromLevel, toLevel) {
  return new Promise(resolve => {
    const container = document.getElementById("levelup-container");
    const fromEl = document.getElementById("levelup-hero-from");
    const toEl = document.getElementById("levelup-hero-to");
    const textEl = document.getElementById("levelup-text");

    fromEl.style.backgroundImage = `url('./images/${getHeroImageName(fromLevel)}')`;
    toEl.style.backgroundImage = `url('./images/${getHeroImageName(toLevel)}')`;
    textEl.textContent = getUnlockText(toLevel);

    container.classList.remove("hidden", "playing");
    requestAnimationFrame(() => container.classList.add("playing"));

    setTimeout(() => {
      container.classList.add("hidden");
      container.classList.remove("playing");
      resolve();
    }, LEVELUP_CEREMONY_MS);
  });
}

function getEnemyWaveFilter(wave) {
  return ENEMY_WAVE_FILTERS[(Math.max(1, wave) - 1) % ENEMY_WAVE_FILTERS.length];
}

function applyEnemyWaveLook(el, wave, withSpawnAnim) {
  el.style.setProperty("--enemy-filter", getEnemyWaveFilter(wave));
  if (!withSpawnAnim) return;
  el.classList.remove("wave-spawn");
  void el.offsetWidth;
  el.classList.add("wave-spawn");
}

function playNewWaveAppear() {
  return new Promise(resolve => setTimeout(resolve, WAVE_SPAWN_MS));
}

function rebuildFlatQuizzes() {
  const flat = [];
  Object.entries(gameState.quizData).forEach(([genre, list]) => {
    (list || []).forEach(q => {
      flat.push({
        genre,
        q: q.q,
        a: q.a,
        c: q.c,
        d: q.d || 1,
        key: `${genre}::${q.q}`
      });
    });
  });
  gameState.flatQuizzes = flat;
}

/** 未出題のみ。難易度→同ジャンル→全体の順で探す（重複なし） */
function pickUnusedQuiz(preferredGenre, preferHard) {
  const unused = gameState.flatQuizzes.filter(q => !gameState.usedQuizKeys.has(q.key));
  if (unused.length === 0) return null;

  const hardMatch = q => (preferHard ? q.d >= 2 : q.d < 2);
  const pools = [
    unused.filter(q => q.genre === preferredGenre && hardMatch(q)),
    unused.filter(q => q.genre === preferredGenre),
    unused.filter(hardMatch),
    unused
  ];

  for (const pool of pools) {
    if (pool.length > 0) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
  }
  return null;
}

function markQuizUsed(entry) {
  if (entry && entry.key) gameState.usedQuizKeys.add(entry.key);
}

async function loadQuizData() {
  try {
    const res = await fetch("./quizData.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    gameState.quizData = await res.json();
    if (Object.keys(gameState.quizData).length === 0) {
      throw new Error("quizData.jsonが空です");
    }
    rebuildFlatQuizzes();
  } catch (error) {
    gameState.quizData = {
      "テスト": [
        { q: "1+1は？", a: ["1", "2", "3", "4"], c: 1 },
        { q: "日本の首都は？", a: ["大阪", "東京", "京都", "福岡"], c: 1, d: 2 }
      ]
    };
    rebuildFlatQuizzes();
  }
}

function moveHero(dx, dy) {
  if (gameState.isPaused || !gameState.gameStarted || gameState.bossDefeated) return;

  const area = document.getElementById("game-area");
  const playerEl = document.getElementById("player");
  const newX = gameState.player.x + dx * gameState.player.speed;
  const newY = gameState.player.y + dy * gameState.player.speed;

  gameState.player.x = Math.max(0, Math.min(area.clientWidth - PLAYER_SIZE, newX));
  gameState.player.y = Math.max(0, Math.min(area.clientHeight - PLAYER_SIZE, newY));

  playerEl.style.left = gameState.player.x + "px";
  playerEl.style.top = gameState.player.y + "px";
}

function clearEnemies() {
  gameState.enemies.forEach(e => {
    if (e.el && e.el.parentNode) e.el.remove();
  });
  gameState.enemies = [];
}

function randomSafePosition(area, size, safeZone) {
  let x = 0;
  let y = 0;
  let valid = false;
  let attempts = 0;
  while (!valid && attempts < 50) {
    x = Math.random() * (area.clientWidth - size);
    y = Math.random() * (area.clientHeight - size);
    const pcx = gameState.player.x + PLAYER_SIZE / 2;
    const pcy = gameState.player.y + PLAYER_SIZE / 2;
    const ecx = x + size / 2;
    const ecy = y + size / 2;
    if (Math.hypot(pcx - ecx, pcy - ecy) > safeZone) valid = true;
    attempts++;
  }
  if (!valid) {
    x = Math.random() < 0.5 ? 0 : area.clientWidth - size;
    y = Math.random() * (area.clientHeight - size);
  }
  return { x, y };
}

function spawnEnemies() {
  const genres = Object.keys(gameState.quizData);
  const area = document.getElementById("game-area");
  clearEnemies();

  if (genres.length === 0) return;

  const numberOfEnemies = 8;
  for (let i = 0; i < numberOfEnemies; i++) {
    const el = document.createElement("div");
    el.className = "enemy";
    const enemyImageNum = (i % 10) + 1;
    el.style.backgroundImage = `url('./images/enemy${enemyImageNum}.png')`;

    const { x, y } = randomSafePosition(area, ENEMY_SIZE, 150);
    el.style.left = x + "px";
    el.style.top = y + "px";
    applyEnemyWaveLook(el, gameState.wave, gameState.wave >= 2);
    area.appendChild(el);

    const speedBoost = Math.min(1.2, (gameState.wave - 1) * 0.15);
    gameState.enemies.push({
      el, x, y,
      speed: 0.5 + Math.random() * 1.5 + speedBoost,
      angle: Math.random() * Math.PI * 2,
      genre: genres[i % genres.length],
      lastQuizTime: 0,
      isBoss: false,
      size: ENEMY_SIZE
    });
  }
}

function spawnBoss() {
  const area = document.getElementById("game-area");
  const genres = Object.keys(gameState.quizData);
  clearEnemies();

  gameState.bossActive = true;
  gameState.bossHp = BOSS_HP_MAX;

  const el = document.createElement("div");
  el.className = "enemy boss wave-spawn";
  el.style.backgroundImage = "url('./images/maou.png')";
  el.style.setProperty("--enemy-filter", "none");

  const { x, y } = randomSafePosition(area, BOSS_SIZE, 180);
  el.style.left = x + "px";
  el.style.top = y + "px";
  area.appendChild(el);

  gameState.enemies.push({
    el, x, y,
    speed: 0.7,
    angle: Math.random() * Math.PI * 2,
    genre: genres[Math.floor(Math.random() * genres.length)] || "魔王",
    lastQuizTime: 0,
    isBoss: true,
    size: BOSS_SIZE
  });

  updateStatusUI();
  startBossBgm();
}

function showBossBanner() {
  return new Promise(resolve => {
    const banner = document.getElementById("boss-banner");
    banner.classList.remove("hidden");
    setTimeout(() => {
      banner.classList.add("hidden");
      resolve();
    }, BOSS_BANNER_MS);
  });
}

async function startBossWave() {
  gameState.isPaused = true;
  await showBossBanner();
  spawnBoss();
  await playNewWaveAppear();
  gameState.isPaused = false;
}

function moveEnemies() {
  if (gameState.isPaused || !gameState.gameStarted) return;
  const area = document.getElementById("game-area");

  gameState.enemies.forEach(enemy => {
    if (!enemy.el || !enemy.el.parentNode) return;
    const size = enemy.size || ENEMY_SIZE;

    enemy.x += Math.cos(enemy.angle) * enemy.speed;
    enemy.y += Math.sin(enemy.angle) * enemy.speed;

    if (enemy.x <= 0 || enemy.x >= area.clientWidth - size) {
      enemy.angle = Math.PI - enemy.angle;
      enemy.x = Math.max(0, Math.min(area.clientWidth - size, enemy.x));
    }
    if (enemy.y <= 0 || enemy.y >= area.clientHeight - size) {
      enemy.angle = -enemy.angle;
      enemy.y = Math.max(0, Math.min(area.clientHeight - size, enemy.y));
    }

    enemy.el.style.left = enemy.x + "px";
    enemy.el.style.top = enemy.y + "px";
  });
}

function hitboxesOverlap(px, py, enemy) {
  const size = enemy.size || ENEMY_SIZE;
  const hitScale = enemy.isBoss ? BOSS_HIT_SCALE : ENEMY_HIT_SCALE;
  const pPad = PLAYER_SIZE * (1 - PLAYER_HIT_SCALE) / 2;
  const ePad = size * (1 - hitScale) / 2;
  const pLeft = px + pPad;
  const pRight = px + PLAYER_SIZE - pPad;
  const pTop = py + pPad;
  const pBottom = py + PLAYER_SIZE - pPad;
  const eLeft = enemy.x + ePad;
  const eRight = enemy.x + size - ePad;
  const eTop = enemy.y + ePad;
  const eBottom = enemy.y + size - ePad;
  return pLeft < eRight && pRight > eLeft && pTop < eBottom && pBottom > eTop;
}

function checkCollision() {
  if (gameState.isPaused || !gameState.gameStarted || gameState.bossDefeated) return;
  const now = Date.now();

  gameState.enemies.forEach(enemy => {
    if (!enemy.el || !enemy.el.parentNode) return;
    if (
      hitboxesOverlap(gameState.player.x, gameState.player.y, enemy) &&
      (now - enemy.lastQuizTime) > 1000
    ) {
      enemy.lastQuizTime = now;
      showQuiz(enemy);
    }
  });
}

function showQuiz(enemy) {
  gameState.isPaused = true;
  const preferHard = gameState.wave >= 2 || enemy.isBoss;
  const quiz = pickUnusedQuiz(enemy.genre, preferHard);

  if (!quiz) {
    // 全問出尽くし（理論上クリア前には起きにくい）— 緊急時のみリセット
    gameState.usedQuizKeys.clear();
    const retry = pickUnusedQuiz(enemy.genre, preferHard);
    if (!retry) {
      gameState.isPaused = false;
      return;
    }
    return showQuizWithData(enemy, retry);
  }
  showQuizWithData(enemy, quiz);
}

function showQuizWithData(enemy, quiz) {
  markQuizUsed(quiz);
  enemy.genre = quiz.genre;

  const isHard = quiz.d >= 2;
  const genreEl = document.getElementById("quiz-genre");
  if (enemy.isBoss) {
    genreEl.textContent = isHard ? `【魔王】むずかしい問題` : `【魔王】の問題`;
  } else {
    genreEl.textContent = isHard ? `【${quiz.genre}】むずかしい問題` : `【${quiz.genre}】の問題`;
  }
  genreEl.classList.toggle("quiz-hard", isHard);
  document.getElementById("quiz-question").textContent = quiz.q;

  const optionsEl = document.getElementById("quiz-options");
  optionsEl.replaceChildren();
  quiz.a.forEach((text, i) => {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.addEventListener("click", () => handleAnswer(i === quiz.c, enemy));
    optionsEl.appendChild(btn);
  });

  const quizEl = document.getElementById("quiz-container");
  quizEl.classList.remove("hidden");
  quizEl.style.display = "flex";
}

async function handleAnswer(correct, enemy) {
  const quizEl = document.getElementById("quiz-container");
  quizEl.classList.add("hidden");
  quizEl.style.display = "none";

  let leveledUpFrom = null;
  let waveCleared = false;
  let bossJustDefeated = false;

  if (correct) {
    playSe(seCorrect);
    gameState.player.combo++;

    if (enemy.isBoss) {
      gameState.bossHp -= 1;
      if (enemy.el) {
        enemy.el.classList.remove("hit-flash");
        void enemy.el.offsetWidth;
        enemy.el.classList.add("hit-flash");
      }
      if (gameState.bossHp <= 0) {
        bossJustDefeated = true;
        if (enemy.el && enemy.el.parentNode) enemy.el.remove();
        gameState.enemies = [];
        gameState.bossActive = false;
        gameState.bossDefeated = true;
      }
    } else {
      if (enemy.el && enemy.el.parentNode) enemy.el.remove();
      gameState.enemies = gameState.enemies.filter(e => e !== enemy);

      gameState.player.exp += 20;
      if (gameState.player.exp >= 100) {
        leveledUpFrom = gameState.player.level;
        gameState.player.level++;
        gameState.player.exp = 0;
        playSe(seLevelup);

        if (gameState.player.level >= HERO_IMAGE_MAX && !gameState.gearComplete) {
          gameState.gearComplete = true;
          gameState.bossPending = true;
        }
      }

      if (gameState.enemies.length === 0) waveCleared = true;
    }
  } else {
    playSe(seWrong);
    gameState.player.combo = 0;
    gameState.player.hp--;
  }

  updateStatusUI();

  if (leveledUpFrom !== null) {
    gameState.isPaused = true;
    await showLevelUpCeremony(leveledUpFrom, gameState.player.level);
  }

  if (bossJustDefeated) {
    gameState.isPaused = true;
    await showEnding();
    return;
  }

  if (waveCleared) {
    gameState.isPaused = true;
    gameState.wave += 1;
    if (gameState.bossPending && !gameState.bossDefeated && !gameState.bossActive) {
      gameState.bossPending = false;
      await startBossWave();
    } else {
      spawnEnemies();
      await playNewWaveAppear();
      gameState.isPaused = false;
    }
  } else {
    gameState.isPaused = false;
  }

  if (gameState.player.hp <= 0) {
    showGameOver();
  }
}

function showEnding() {
  return new Promise(resolve => {
    stopBgm(bgmField);
    stopBgm(bgmBoss);
    document.getElementById("controller").classList.add("hidden");
    document.getElementById("status-bar").classList.add("hidden");

    const ending = document.getElementById("ending-container");
    ending.classList.remove("hidden", "play", "ready");
    void ending.offsetWidth;
    ending.classList.add("play");

    setTimeout(() => {
      ending.classList.add("ready");
      resolve();
    }, 4500);
  });
}

function showGameOver() {
  gameState.isPaused = true;
  stopBgm(bgmField);
  stopBgm(bgmBoss);
  const gameoverContainer = document.getElementById("gameover-container");
  gameoverContainer.classList.remove("hidden");
  gameoverContainer.style.display = "flex";
}

function gameLoop() {
  if (!gameState.gameStarted || gameState.bossDefeated) {
    requestAnimationFrame(gameLoop);
    return;
  }

  const dx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0) +
            (vKeys.right ? 1 : 0) - (vKeys.left ? 1 : 0);
  const dy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0) +
            (vKeys.down ? 1 : 0) - (vKeys.up ? 1 : 0);

  if (dx !== 0 || dy !== 0) moveHero(dx, dy);
  moveEnemies();
  checkCollision();
  requestAnimationFrame(gameLoop);
}
