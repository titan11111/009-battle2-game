const keys = {};
const vKeys = { up:false, down:false, left:false, right:false };

const gameState = {
  player: { x:0, y:0, speed:4, hp:3, exp:0, level:1 },
  enemies: [],
  isPaused: false,
  quizData: {},
  gameStarted: false
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
  const playerWidth = 96;
  const playerHeight = 96;
  
  const newX = gameState.player.x + dx * gameState.player.speed;
  const newY = gameState.player.y + dy * gameState.player.speed;
  
  gameState.player.x = Math.max(0, Math.min(area.clientWidth - playerWidth, newX));
  gameState.player.y = Math.max(0, Math.min(area.clientHeight - playerHeight, newY));
  
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

  const playerSize = 96;
  const enemySize = 72;
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
    area.appendChild(el);

    const assignedGenre = genres[i % genres.length];
    const enemy = {
      el, x, y,
      speed: 0.5 + Math.random() * 1.5,
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
  const enemySize = 90;
  
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

function checkCollision() {
  if (gameState.isPaused || !gameState.gameStarted) return;
  
  const playerSize = 96;
  const enemySize = 72;
  const collisionDistance = 50;
  
  const playerCenterX = gameState.player.x + playerSize / 2;
  const playerCenterY = gameState.player.y + playerSize / 2;
  const currentTime = Date.now();

  gameState.enemies.forEach(enemy => {
    if (!enemy.el || !enemy.el.parentNode) return;

    const enemyCenterX = enemy.x + enemySize / 2;
    const enemyCenterY = enemy.y + enemySize / 2;
    const distance = Math.hypot(playerCenterX - enemyCenterX, playerCenterY - enemyCenterY);

    if (distance < collisionDistance && (currentTime - enemy.lastQuizTime) > 1000) {
      console.log("衝突検出！ジャンル:", enemy.genre, "距離:", Math.round(distance));
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

  const quiz = quizList[Math.floor(Math.random() * quizList.length)];

  document.getElementById("quiz-genre").textContent = `【${genre}】の問題`;
  document.getElementById("quiz-question").textContent = quiz.q;
  
  const optionsEl = document.getElementById("quiz-options");
  optionsEl.innerHTML = "";
  
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

function handleAnswer(correct, enemy) {
  const quizEl = document.getElementById("quiz-container");
  quizEl.classList.add("hidden");
  quizEl.style.display = "none";

  if (correct) {
    console.log("✓ 正解！");
    if (seCorrect) {
      seCorrect.play().catch(e => console.warn("効果音再生エラー:", e));
    }
    
    if (enemy.el && enemy.el.parentNode) {
      enemy.el.remove();
    }
    gameState.enemies = gameState.enemies.filter(e => e !== enemy);
    
    gameState.player.exp += 20;
    if (gameState.player.exp >= 100) {
      gameState.player.level++;
      gameState.player.exp = 0;
      if (seLevelup) {
        seLevelup.play().catch(e => console.warn("効果音再生エラー:", e));
      }
      console.log(`⬆ レベルアップ！ Lv.${gameState.player.level}`);
    }

    if (gameState.enemies.length === 0) {
      console.log("すべての敵を倒しました！新しい敵を出現させます。");
      spawnEnemies();
    }

  } else {
    console.log("不正解...");
    if (seWrong) {
      seWrong.play().catch(e => console.warn("効果音再生エラー:", e));
    }
    gameState.player.hp--;
  }

  updateStatusUI();
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
