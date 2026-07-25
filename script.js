const keys = {};
const vKeys = { up:false, down:false, left:false, right:false };

const HERO_IMAGE_MAX = 8; // hero.png〜hero8.png（レベルに応じて装備が充実）
const LEVELUP_CEREMONY_MS = 1200; // クロスフェード0.8s + 余韻
const WAVE_SPAWN_MS = 550;
const PLAYER_SIZE = Math.round(96 * 1.2); // 115px（従来96の1.2倍）
const ENEMY_SIZE = 72;
// スプライト余白を除いた実体サイズ比率（見た目どおり触れたときだけ当たる）
const PLAYER_HIT_SCALE = 0.38;
const ENEMY_HIT_SCALE = 0.40;
// 全滅後の新敵：色味だけ変えて「別種族」感を出す（景色は触らない）
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
  player: { x:0, y:0, speed:4, hp:3, exp:0, level:1, combo:0 },
  enemies: [],
  isPaused: false,
  quizData: {},
  gameStarted: false,
  wave: 1 // 1=通常問題、2以降=難問＋敵の色味変化
};

let bgmField, seCorrect, seWrong, seLevelup;

function setupAudio() {
  bgmField = document.getElementById("bgm-field");
  seCorrect = document.getElementById("se-correct");
  seWrong = document.getElementById("se-wrong");
  seLevelup = document.getElementById("se-levelup");

  bgmField.src = "./audio/field.mp3";
  seCorrect.src = "./audio/seikai2.mp3";
  seWrong.src = "./audio/fuseikai2.mp3";
  seLevelup.src = "./audio/levelup.mp3";

  bgmField.loop = true;
  bgmField.preload = "auto";
  seCorrect.preload = "auto";
  seWrong.preload = "auto";
  seLevelup.preload = "auto";
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("ゲーム初期化開始");
  
  const playerEl = document.getElementById("player");
  const areaEl = document.getElementById("game-area");

  await new Promise(resolve => {
    if (document.readyState === 'complete') {
      resolve();
    } else {
      window.addEventListener('load', resolve);
    }
  });

  setupAudio();
  
  document.addEventListener("keydown", e => { 
    keys[e.key] = true; 
    startBGM(); 
  });
  document.addEventListener("keyup", e => { 
    delete keys[e.key]; 
  });

  [["btn-up","up"],["btn-down","down"],["btn-left","left"],["btn-right","right"]].forEach(([id,dir]) => {
    const btn = document.getElementById(id);
    if (btn) {
      ["mousedown","touchstart"].forEach(ev => 
        btn.addEventListener(ev, e => { 
          e.preventDefault(); 
          vKeys[dir] = true; 
          startBGM(); 
        })
      );
      ["mouseup","mouseleave","touchend","touchcancel"].forEach(ev => 
        btn.addEventListener(ev, e => { 
          e.preventDefault(); 
          vKeys[dir] = false; 
        })
      );
    }
  });

  document.getElementById("restart-button").addEventListener("click", () => {
    location.reload();
  });

  await loadQuizData();

  placePlayerAtCenter();
  updateStatusUI();
  spawnEnemies();
  document.getElementById("tutorial-start").addEventListener("click", () => {
    document.getElementById("tutorial-container").classList.add("hidden");
    gameState.gameStarted = true;
    startBGM();
  });
  console.log("ゲーム初期化完了");

  requestAnimationFrame(gameLoop);
});

function placePlayerAtCenter() {
  const area = document.getElementById("game-area");
  const playerEl = document.getElementById("player");
  gameState.player.x = Math.max(0, (area.clientWidth - PLAYER_SIZE) / 2);
  gameState.player.y = Math.max(0, (area.clientHeight - PLAYER_SIZE) / 2);
  playerEl.style.left = gameState.player.x + "px";
  playerEl.style.top = gameState.player.y + "px";
}

function startBGM() {
  if (bgmField && bgmField.paused) {
    bgmField.volume = 0.3;
    bgmField.play().catch(error => {
      console.warn("BGMの自動再生がブロックされました:", error);
    });
  }
}

function updateStatusUI() {
  const hp = gameState.player.hp;
  document.getElementById("hp-hearts").innerHTML = "♥".repeat(Math.max(0, hp));
  document.getElementById("exp-fill").style.width = `${(gameState.player.exp % 100)}%`;
  document.getElementById("exp-text").textContent = `${gameState.player.exp % 100}/100`;
  document.getElementById("level-display").textContent = `Lv.${gameState.player.level}`;
  document.getElementById("combo-count").textContent = gameState.player.combo;
  updatePlayerImage();
}

function getHeroImageName(level) {
  const imageLevel = Math.max(1, Math.min(HERO_IMAGE_MAX, level));
  return imageLevel === 1 ? "hero.png" : `hero${imageLevel}.png`;
}

function updatePlayerImage() {
  const imageName = getHeroImageName(gameState.player.level);
  const playerEl = document.getElementById("player");
  playerEl.style.backgroundImage = `url('./images/${imageName}')`;
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
    // 次フレームでアニメ開始（transition/animation を確実に発火）
    requestAnimationFrame(() => {
      container.classList.add("playing");
    });

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

/** 全滅後：新敵出現の短い演出（敵の色味変化のみ。景色は反転しない） */
function playNewWaveAppear() {
  return new Promise(resolve => {
    setTimeout(resolve, WAVE_SPAWN_MS);
  });
}

/** d未指定=かんたん(1)、d:2=むずかしい。ウェーブ2以降は難問を優先 */
function pickQuizForWave(quizList, wave) {
  if (!quizList || quizList.length === 0) return null;
  const hard = quizList.filter(q => (q.d || 1) >= 2);
  const easy = quizList.filter(q => (q.d || 1) < 2);
  let pool;
  if (wave >= 2) {
    pool = hard.length > 0 ? hard : quizList;
  } else {
    pool = easy.length > 0 ? easy : quizList;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

async function loadQuizData() {
  try {
    console.log("クイズデータ読み込み開始");
    const res = await fetch("./quizData.json");
    if (!res.ok) {
      throw new Error(`HTTP error! Status: ${res.status}`);
    }
    gameState.quizData = await res.json();

    if (Object.keys(gameState.quizData).length === 0) {
      throw new Error("quizData.jsonが空です");
    }
    console.log("✓ クイズデータ読み込み成功。ジャンル数:", Object.keys(gameState.quizData).length);
    console.log("ジャンル一覧:", Object.keys(gameState.quizData).join(", "));

  } catch (error) {
    console.error("クイズデータ読み込みエラー:", error);
    gameState.quizData = {
      "テスト": [
        { "q": "1+1は？", "a": ["1", "2", "3", "4"], "c": 1 },
        { "q": "日本の首都は？", "a": ["大阪", "東京", "京都", "福岡"], "c": 1 }
      ]
    };
    console.log("デフォルトクイズデータを使用します");
  }
}

function moveHero(dx, dy) {
  if (gameState.isPaused || !gameState.gameStarted) return;
  
  const area = document.getElementById("game-area");
  const playerEl = document.getElementById("player");
  
  const newX = gameState.player.x + dx * gameState.player.speed;
  const newY = gameState.player.y + dy * gameState.player.speed;
  
  gameState.player.x = Math.max(0, Math.min(area.clientWidth - PLAYER_SIZE, newX));
  gameState.player.y = Math.max(0, Math.min(area.clientHeight - PLAYER_SIZE, newY));
  
  playerEl.style.left = gameState.player.x + "px";
  playerEl.style.top = gameState.player.y + "px";
}

function spawnEnemies() {
  const genres = Object.keys(gameState.quizData);
  const area = document.getElementById("game-area");
  
  gameState.enemies.forEach(e => {
    if (e.el && e.el.parentNode) {
      e.el.remove();
    }
  });
  gameState.enemies = [];

  if (genres.length === 0) {
    console.error("クイズデータにジャンルがありません");
    return;
  }

  const playerSize = PLAYER_SIZE;
  const enemySize = ENEMY_SIZE;
  const safeZone = 150;
  const numberOfEnemies = 8;

  console.log("敵生成開始:", numberOfEnemies + "体");

  for (let i = 0; i < numberOfEnemies; i++) {
    const el = document.createElement("div");
    el.className = "enemy";
    
    const enemyImageNum = (i % 10) + 1;
    el.style.backgroundImage = `url('./images/enemy${enemyImageNum}.png')`;

    let x, y;
    let validPosition = false;
    let attempts = 0;
    const maxAttempts = 50;

    while (!validPosition && attempts < maxAttempts) {
      x = Math.random() * (area.clientWidth - enemySize);
      y = Math.random() * (area.clientHeight - enemySize);

      const playerCenterX = gameState.player.x + playerSize / 2;
      const playerCenterY = gameState.player.y + playerSize / 2;
      const enemyCenterX = x + enemySize / 2;
      const enemyCenterY = y + enemySize / 2;

      const distance = Math.hypot(playerCenterX - enemyCenterX, playerCenterY - enemyCenterY);

      if (distance > safeZone) {
        validPosition = true;
      }
      attempts++;
    }

    if (!validPosition) {
      x = Math.random() < 0.5 ? 0 : area.clientWidth - enemySize;
      y = Math.random() * (area.clientHeight - enemySize);
    }

    el.style.left = x + "px";
    el.style.top = y + "px";
    applyEnemyWaveLook(el, gameState.wave, gameState.wave >= 2);
    area.appendChild(el);

    const assignedGenre = genres[i % genres.length];
    // ウェーブが進むほど少し速く
    const speedBoost = Math.min(1.2, (gameState.wave - 1) * 0.15);
    const enemy = {
      el, x, y,
      speed: 0.5 + Math.random() * 1.5 + speedBoost,
      angle: Math.random() * Math.PI * 2,
      hasHit: false,
      genre: assignedGenre,
      lastQuizTime: 0
    };
    
    gameState.enemies.push(enemy);
    console.log(`敵${i + 1}生成: ジャンル=${assignedGenre}, 位置=(${Math.round(x)},${Math.round(y)})`);
  }
}

function moveEnemies() {
  if (gameState.isPaused || !gameState.gameStarted) return;
  
  const area = document.getElementById("game-area");
  const enemySize = ENEMY_SIZE;
  
  gameState.enemies.forEach(enemy => {
    if (!enemy.el || !enemy.el.parentNode) return;
    
    enemy.x += Math.cos(enemy.angle) * enemy.speed;
    enemy.y += Math.sin(enemy.angle) * enemy.speed;
    
    if (enemy.x <= 0 || enemy.x >= area.clientWidth - enemySize) {
      enemy.angle = Math.PI - enemy.angle;
      enemy.x = Math.max(0, Math.min(area.clientWidth - enemySize, enemy.x));
    }
    if (enemy.y <= 0 || enemy.y >= area.clientHeight - enemySize) {
      enemy.angle = -enemy.angle;
      enemy.y = Math.max(0, Math.min(area.clientHeight - enemySize, enemy.y));
    }
    
    enemy.el.style.left = enemy.x + "px";
    enemy.el.style.top = enemy.y + "px";
  });
}

function hitboxesOverlap(px, py, ex, ey) {
  const pPad = PLAYER_SIZE * (1 - PLAYER_HIT_SCALE) / 2;
  const ePad = ENEMY_SIZE * (1 - ENEMY_HIT_SCALE) / 2;
  const pLeft = px + pPad;
  const pRight = px + PLAYER_SIZE - pPad;
  const pTop = py + pPad;
  const pBottom = py + PLAYER_SIZE - pPad;
  const eLeft = ex + ePad;
  const eRight = ex + ENEMY_SIZE - ePad;
  const eTop = ey + ePad;
  const eBottom = ey + ENEMY_SIZE - ePad;
  return pLeft < eRight && pRight > eLeft && pTop < eBottom && pBottom > eTop;
}

function checkCollision() {
  if (gameState.isPaused || !gameState.gameStarted) return;
  
  const currentTime = Date.now();

  gameState.enemies.forEach(enemy => {
    if (!enemy.el || !enemy.el.parentNode) return;

    if (
      hitboxesOverlap(gameState.player.x, gameState.player.y, enemy.x, enemy.y) &&
      (currentTime - enemy.lastQuizTime) > 1000
    ) {
      console.log("衝突検出！ジャンル:", enemy.genre);
      enemy.lastQuizTime = currentTime;
      showQuiz(enemy);
    }
  });
}

function showQuiz(enemy) {
  gameState.isPaused = true;
  const genre = enemy.genre;
  const quizList = gameState.quizData[genre];

  console.log("クイズ表示:", genre);

  if (!quizList || quizList.length === 0) {
    console.error(`ジャンル '${genre}' のクイズが見つかりません`);
    
    gameState.player.hp--;
    if (seWrong) {
      seWrong.play().catch(e => console.warn("効果音再生エラー:", e));
    }
    updateStatusUI();
    
    setTimeout(() => {
      gameState.isPaused = false;
      if (gameState.player.hp <= 0) {
        showGameOver();
      }
    }, 1000);
    return;
  }

  const quiz = pickQuizForWave(quizList, gameState.wave);
  if (!quiz) {
    gameState.isPaused = false;
    return;
  }

  const isHard = (quiz.d || 1) >= 2;
  const genreEl = document.getElementById("quiz-genre");
  genreEl.textContent = isHard ? `【${genre}】むずかしい問題` : `【${genre}】の問題`;
  genreEl.classList.toggle("quiz-hard", isHard);
  document.getElementById("quiz-question").textContent = quiz.q;
  
  const optionsEl = document.getElementById("quiz-options");
  optionsEl.replaceChildren();
  
  quiz.a.forEach((text, i) => {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.addEventListener("click", () => {
      handleAnswer(i === quiz.c, enemy);
    });
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

  if (correct) {
    console.log("✓ 正解！");
    if (seCorrect) {
      seCorrect.play().catch(e => console.warn("効果音再生エラー:", e));
    }
    
    gameState.player.combo++;

    if (enemy.el && enemy.el.parentNode) {
      enemy.el.remove();
    }
    gameState.enemies = gameState.enemies.filter(e => e !== enemy);
    
    gameState.player.exp += 20;
    if (gameState.player.exp >= 100) {
      leveledUpFrom = gameState.player.level;
      gameState.player.level++;
      gameState.player.exp = 0;
      if (seLevelup) {
        seLevelup.play().catch(e => console.warn("効果音再生エラー:", e));
      }
    }

    if (gameState.enemies.length === 0) {
      waveCleared = true;
    }

  } else {
    console.log("不正解...");
    if (seWrong) {
      seWrong.play().catch(e => console.warn("効果音再生エラー:", e));
    }
    gameState.player.combo = 0;
    gameState.player.hp--;
  }

  updateStatusUI();

  if (leveledUpFrom !== null) {
    gameState.isPaused = true;
    await showLevelUpCeremony(leveledUpFrom, gameState.player.level);
  }

  if (waveCleared) {
    gameState.isPaused = true;
    gameState.wave += 1;
    spawnEnemies();
    await playNewWaveAppear();
  }

  gameState.isPaused = false;
  
  if (gameState.player.hp <= 0) {
    showGameOver();
  }
}

function showGameOver() {
  console.log("ゲームオーバー");
  gameState.isPaused = true;
  
  if (bgmField && !bgmField.paused) {
    bgmField.pause();
  }
  
  const gameoverContainer = document.getElementById("gameover-container");
  gameoverContainer.classList.remove("hidden");
  gameoverContainer.style.display = "flex";
}

function gameLoop() {
  if (!gameState.gameStarted) {
    requestAnimationFrame(gameLoop);
    return;
  }

  const dx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0) + 
            (vKeys.right ? 1 : 0) - (vKeys.left ? 1 : 0);
  const dy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0) + 
            (vKeys.down ? 1 : 0) - (vKeys.up ? 1 : 0);

  if (dx !== 0 || dy !== 0) {
    moveHero(dx, dy);
  }

  moveEnemies();
  checkCollision();
  requestAnimationFrame(gameLoop);
}
