// Vanilla JS Pac-Man clone rendered on the HTML canvas

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('pacmanCanvas');
  if (!canvas) return; // Only run on the Pac-Man page

  const ctx = canvas.getContext('2d');
  const ui = {
    score: document.getElementById('pacmanScore'),
    lives: document.getElementById('pacmanLives'),
    level: document.getElementById('pacmanLevel'),
    status: document.getElementById('pacmanStatus'),
    startButton: document.getElementById('pacmanStart'),
    pauseButton: document.getElementById('pacmanPause'),
  };

  ui.pauseButton.disabled = true;

  const game = createPacmanGame(canvas, ctx, ui);

  ui.startButton.addEventListener('click', () => game.start());
  ui.pauseButton.addEventListener('click', () => game.togglePause());

  const handledKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', ' ']);
  window.addEventListener('keydown', evt => {
    if (!handledKeys.has(evt.key)) return;
    const direction = mapKeyToDirection(evt.key);
    if (direction) {
      evt.preventDefault();
      game.setPacmanDirection(direction);
    } else if (evt.key === ' ') {
      evt.preventDefault();
      game.togglePause();
    }
  });
});

function mapKeyToDirection(key) {
  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return { dx: 0, dy: -1 };
    case 'ArrowDown':
    case 's':
    case 'S':
      return { dx: 0, dy: 1 };
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return { dx: -1, dy: 0 };
    case 'ArrowRight':
    case 'd':
    case 'D':
      return { dx: 1, dy: 0 };
    default:
      return null;
  }
}

function createPacmanGame(canvas, ctx, ui) {
  const TILE_SIZE = 24;
  const LEVEL_BLUEPRINT = [
    '###################',
    '#o....#.....#....o#',
    '#.##.#.###.#.##.#.#',
    '#.................#',
    '#.##.#.#####.#.##.#',
    '#....#...#...#....#',
    '####.#.#.#.#.#.####',
    '#....#.#.#.#.#....#',
    '#.##.#.#.#.#.#.##.#',
    '#.#..#.......#..#.#',
    '#.#.###.###.###.#.#',
    '#.#...#GG.#...#.#.#',
    '#.###.#####.###.#.#',
    '#.#...#GG.#...#.#.#',
    '#.#.###.###.###.#.#',
    '#.#..#.......#..#.#',
    '#.##.#.#.#.#.#.##.#',
    '#....#...P...#....#',
    '#.##.#.#####.#.##.#',
    '#o...............o#',
    '###################',
  ];

  const COLORS = {
    background: '#030712',
    wall: '#0f172a',
    pellet: '#fde68a',
    power: '#fbbf24',
    pacman: '#facc15',
    frightened: '#3b82f6',
    frightenedBlink: '#f472b6',
  };

  const ghostColors = ['#ef4444', '#34d399', '#60a5fa', '#f97316'];
  const MAX_GHOSTS = 4;
  const directions = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
  ];
  const START_DELAY = 1.5;
  const BASE_GHOST_RELEASE = 1.25;
  const GHOST_RELEASE_STEP = 0.5;

  const state = {
    running: false,
    paused: false,
    gameOver: false,
    score: 0,
    lives: 3,
    level: 1,
    pelletsLeft: 0,
    grid: [],
    pacman: null,
    ghosts: [],
    pacmanSpawn: { row: 17, col: 9 },
    ghostSpawns: [],
    frightenedTimer: 0,
    freezeTimer: 0,
    lastTime: 0,
    animationFrame: null,
    mouthClock: 0,
  };

  canvas.width = LEVEL_BLUEPRINT[0].length * TILE_SIZE;
  canvas.height = LEVEL_BLUEPRINT.length * TILE_SIZE;

  function start() {
    cancelAnimationFrame(state.animationFrame);
    state.running = true;
    state.paused = false;
    state.gameOver = false;
    state.score = 0;
    state.level = 1;
    state.lives = 3;
    ui.pauseButton.disabled = false;
    ui.pauseButton.textContent = 'Pause';
    resetLevelGrid();
    spawnActors();
    syncHud();
    setStatus('Ready! Use arrow keys or WASD to queue your first move.');
    state.lastTime = performance.now();
    state.animationFrame = requestAnimationFrame(loop);
  }

  function togglePause() {
    if (!state.running || state.gameOver) return;
    state.paused = !state.paused;
    ui.pauseButton.textContent = state.paused ? 'Resume' : 'Pause';
    setStatus(state.paused ? 'Paused' : 'Game on! Keep going.');
  }

  function isRunning() {
    return state.running && !state.gameOver;
  }

  function setPacmanDirection(dir) {
    if (!isRunning()) return;
    if (!state.pacman) return;
    state.pacman.pendingDirection = dir;
  }

  function loop(timestamp) {
    if (!state.running) return;
    const delta = Math.min((timestamp - state.lastTime) / 1000, 0.05);
    state.lastTime = timestamp;

    if (!state.paused) {
      if (state.freezeTimer > 0) {
        state.freezeTimer = Math.max(0, state.freezeTimer - delta);
      } else {
        updateGame(delta);
      }
    }

    drawGame();
    if (state.running) {
      state.animationFrame = requestAnimationFrame(loop);
    }
  }

  function updateGame(delta) {
    state.mouthClock += delta * 6;
    updatePacman(delta);
    state.ghosts.forEach(ghost => updateGhost(ghost, delta));
    updateFrightened(delta);
    checkCollisions();
  }

  function updatePacman(delta) {
    const actor = state.pacman;
    if (!actor) return;

    if (!actor.moving) {
      if (actor.pendingDirection && beginMove(actor, actor.pendingDirection)) {
        actor.pendingDirection = null;
      } else if (actor.direction && beginMove(actor, actor.direction)) {
        // continue straight
      }
    }

    advanceActor(actor, delta);

    if (!actor.moving) {
      consumeTile(actor.row, actor.col);
    }
  }

  function updateGhost(ghost, delta) {
    if (ghost.waitTimer > 0) {
      ghost.waitTimer = Math.max(0, ghost.waitTimer - delta);
      return;
    }
    if (!ghost.moving) {
      const dir = chooseGhostDirection(ghost);
      if (dir) {
        beginMove(ghost, dir);
      }
    }
    const speedFactor = ghost.frightened ? 0.65 : 1;
    advanceActor(ghost, delta, speedFactor);
  }

  function updateFrightened(delta) {
    if (state.frightenedTimer <= 0) return;
    state.frightenedTimer -= delta;
    if (state.frightenedTimer <= 0) {
      state.ghosts.forEach(g => (g.frightened = false));
      state.frightenedTimer = 0;
    }
  }

  function consumeTile(row, col) {
    const tile = state.grid[row][col];
    if (tile === 'pellet') {
      state.grid[row][col] = 'empty';
      state.score += 10;
      state.pelletsLeft -= 1;
      syncHud();
      if (state.pelletsLeft <= 0) {
        nextLevel();
      }
    } else if (tile === 'power') {
      state.grid[row][col] = 'empty';
      state.score += 50;
      state.pelletsLeft -= 1;
      syncHud();
      triggerPowerPellet();
      if (state.pelletsLeft <= 0) {
        nextLevel();
      }
    }
  }

  function triggerPowerPellet() {
    state.frightenedTimer = 8;
    state.ghosts.forEach(ghost => {
      ghost.frightened = true;
    });
    setStatus('Power up! Ghosts are frightened.');
  }

  function nextLevel() {
    state.level += 1;
    setStatus(`Level ${state.level}! The ghosts move faster.`);
    resetLevelGrid();
    spawnActors();
    syncHud();
    state.freezeTimer = START_DELAY;
  }

  function checkCollisions() {
    const pac = state.pacman;
    if (!pac) return;
    const pacPos = getActorPosition(pac);
    const pacRadius = TILE_SIZE * 0.4;
    for (const ghost of state.ghosts) {
      const ghostPos = getActorPosition(ghost);
      const distance = Math.hypot(pacPos.x - ghostPos.x, pacPos.y - ghostPos.y);
      if (distance < pacRadius) {
        if (ghost.frightened) {
          state.score += 200;
          syncHud();
          setStatus('Nice! Ghost eaten for 200 pts.');
          respawnGhost(ghost);
        } else {
          loseLife();
          break;
        }
      }
    }
  }

  function loseLife() {
    state.lives -= 1;
    syncHud();
    if (state.lives <= 0) {
      gameOver();
      return;
    }
    setStatus(`Careful! ${state.lives} ${state.lives === 1 ? 'life' : 'lives'} remaining.`);
    spawnActorsOnly();
    state.freezeTimer = START_DELAY;
  }

  function gameOver() {
    state.gameOver = true;
    state.running = false;
    setStatus('Game over! Press Start / Reset to try again.');
    ui.pauseButton.disabled = true;
  }

  function beginMove(actor, dir) {
    const nextRow = actor.row + dir.dy;
    let nextCol = actor.col + dir.dx;
    if (dir.dx !== 0) {
      nextCol = wrapCol(nextCol);
    }
    if (!isWithinRows(nextRow) || !isWalkable(nextRow, nextCol)) {
      return false;
    }
    actor.startRow = actor.row;
    actor.startCol = actor.col;
    actor.targetRow = nextRow;
    actor.targetCol = nextCol;
    actor.direction = dir;
    actor.moving = true;
    actor.progress = 0;
    return true;
  }

  function advanceActor(actor, delta, speedFactor = 1) {
    if (!actor.moving) return;
    actor.progress += actor.speed * speedFactor * delta;
    if (actor.progress >= 1) {
      actor.row = actor.targetRow;
      actor.col = actor.targetCol;
      actor.moving = false;
      actor.progress = 0;
    }
  }

  function chooseGhostDirection(ghost) {
    const choices = [];
    const availablePaths = countWalkableNeighbors(ghost.row, ghost.col);
    for (const dir of directions) {
      const nextRow = ghost.row + dir.dy;
      let nextCol = ghost.col + dir.dx;
      if (dir.dx !== 0) nextCol = wrapCol(nextCol);
      if (!isWithinRows(nextRow) || !isWalkable(nextRow, nextCol)) continue;
      const isOpposite =
        ghost.direction && dir.dx === -ghost.direction.dx && dir.dy === -ghost.direction.dy;
      if (isOpposite && availablePaths > 1) continue;
      const distance = distanceToPacman(nextRow, nextCol);
      choices.push({ dir, distance });
    }
    if (!choices.length) return null;
    if (ghost.frightened) {
      choices.sort((a, b) => b.distance - a.distance);
      return choices[0].dir;
    }
    choices.sort((a, b) => a.distance - b.distance);
    if (Math.random() < 0.2) {
      return choices[Math.floor(Math.random() * choices.length)].dir;
    }
    return choices[0].dir;
  }

  function respawnGhost(ghost) {
    ghost.row = ghost.spawn.row;
    ghost.col = ghost.spawn.col;
    ghost.startRow = ghost.row;
    ghost.startCol = ghost.col;
    ghost.targetRow = ghost.row;
    ghost.targetCol = ghost.col;
    ghost.direction = null;
    ghost.moving = false;
    ghost.progress = 0;
    ghost.frightened = false;
    ghost.waitTimer = 2;
  }

  function spawnActors() {
    spawnActorsOnly();
    state.freezeTimer = START_DELAY;
  }

  function spawnActorsOnly() {
    state.pacman = createPacman(state.pacmanSpawn);
    const spawns = state.ghostSpawns.slice(0, MAX_GHOSTS);
    state.ghosts = spawns.map((spawn, idx) =>
      createGhost(spawn, ghostColors[idx % ghostColors.length], idx)
    );
    state.frightenedTimer = 0;
  }

  function resetLevelGrid() {
    const parsed = parseBlueprint();
    state.grid = parsed.grid;
    state.pelletsLeft = parsed.pelletCount;
    state.pacmanSpawn = parsed.pacmanSpawn;
    state.ghostSpawns = parsed.ghostSpawns;
  }

  function parseBlueprint() {
    const grid = [];
    const ghostSpawns = [];
    let pacmanSpawn = { row: 17, col: 9 };
    let pelletCount = 0;
    LEVEL_BLUEPRINT.forEach((rowStr, rowIdx) => {
      const row = [];
      [...rowStr].forEach((char, colIdx) => {
        let cell = 'empty';
        switch (char) {
          case '#':
            cell = 'wall';
            break;
          case '.':
            cell = 'pellet';
            pelletCount += 1;
            break;
          case 'o':
            cell = 'power';
            pelletCount += 1;
            break;
          case '-':
          case ' ':
            cell = 'empty';
            break;
          case 'P':
            pacmanSpawn = { row: rowIdx, col: colIdx };
            cell = 'empty';
            break;
          case 'G':
            ghostSpawns.push({ row: rowIdx, col: colIdx });
            cell = 'empty';
            break;
          default:
            cell = 'pellet';
            pelletCount += 1;
        }
        row.push(cell);
      });
      grid.push(row);
    });
    return { grid, ghostSpawns, pacmanSpawn, pelletCount };
  }

  function createPacman(spawn) {
    return {
      row: spawn.row,
      col: spawn.col,
      startRow: spawn.row,
      startCol: spawn.col,
      targetRow: spawn.row,
      targetCol: spawn.col,
      direction: { dx: 0, dy: 0 },
      pendingDirection: null,
      moving: false,
      progress: 0,
      speed: 7.5,
    };
  }

  function createGhost(spawn, color, order) {
    return {
      row: spawn.row,
      col: spawn.col,
      startRow: spawn.row,
      startCol: spawn.col,
      targetRow: spawn.row,
      targetCol: spawn.col,
      direction: null,
      moving: false,
      progress: 0,
      speed: 4.3 + (state.level - 1) * 0.2,
      frightened: false,
      color,
      spawn,
      waitTimer: BASE_GHOST_RELEASE + order * GHOST_RELEASE_STEP,
    };
  }

  function isWalkable(row, col) {
    return state.grid[row] && state.grid[row][col] !== 'wall';
  }

  function isWithinRows(row) {
    return row >= 0 && row < state.grid.length;
  }

  function wrapCol(col) {
    const cols = state.grid[0].length;
    if (col < 0) return cols - 1;
    if (col >= cols) return 0;
    return col;
  }

  function countWalkableNeighbors(row, col) {
    let count = 0;
    for (const dir of directions) {
      const nextRow = row + dir.dy;
      let nextCol = col + dir.dx;
      if (dir.dx !== 0) nextCol = wrapCol(nextCol);
      if (isWithinRows(nextRow) && isWalkable(nextRow, nextCol)) {
        count += 1;
      }
    }
    return count;
  }

  function distanceToPacman(row, col) {
    const pac = state.pacman;
    if (!pac) return Infinity;
    const pacRow = pac.moving ? pac.targetRow : pac.row;
    const pacCol = pac.moving ? pac.targetCol : pac.col;
    return Math.abs(pacRow - row) + Math.abs(pacCol - col);
  }

  function getActorPosition(actor) {
    let row = actor.row;
    let col = actor.col;
    if (actor.moving) {
      row = actor.startRow + actor.direction.dy * actor.progress;
      col = actor.startCol + actor.direction.dx * actor.progress;
    }
    return {
      x: (col + 0.5) * TILE_SIZE,
      y: (row + 0.5) * TILE_SIZE,
    };
  }

  function drawGame() {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();
    drawPellets();
    drawGhosts();
    drawPacman();
  }

  function drawGrid() {
    for (let row = 0; row < state.grid.length; row += 1) {
      for (let col = 0; col < state.grid[row].length; col += 1) {
        if (state.grid[row][col] === 'wall') {
          ctx.fillStyle = COLORS.wall;
          ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  function drawPellets() {
    for (let row = 0; row < state.grid.length; row += 1) {
      for (let col = 0; col < state.grid[row].length; col += 1) {
        const tile = state.grid[row][col];
        if (tile === 'pellet' || tile === 'power') {
          const x = col * TILE_SIZE + TILE_SIZE / 2;
          const y = row * TILE_SIZE + TILE_SIZE / 2;
          ctx.beginPath();
          const radius = tile === 'power' ? TILE_SIZE * 0.25 : TILE_SIZE * 0.1;
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = tile === 'power' ? COLORS.power : COLORS.pellet;
          ctx.fill();
        }
      }
    }
  }

  function drawPacman() {
    const pac = state.pacman;
    if (!pac) return;
    const pos = getActorPosition(pac);
    const radius = TILE_SIZE * 0.45;
    const mouthOpen = 0.2 + Math.abs(Math.sin(state.mouthClock)) * 0.25;
    const dir = pac.direction && (pac.direction.dx !== 0 || pac.direction.dy !== 0) ? pac.direction : { dx: 1, dy: 0 };
    const angle = Math.atan2(dir.dy, dir.dx);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.arc(pos.x, pos.y, radius, angle + mouthOpen, angle - mouthOpen, false);
    ctx.closePath();
    ctx.fillStyle = COLORS.pacman;
    ctx.fill();
  }

  function drawGhosts() {
    const blink = state.frightenedTimer > 0 && state.frightenedTimer < 2 && Math.floor(state.frightenedTimer * 6) % 2 === 0;
    for (const ghost of state.ghosts) {
      const pos = getActorPosition(ghost);
      const bodyWidth = TILE_SIZE * 0.85;
      const bodyHeight = TILE_SIZE * 0.9;
      const x = pos.x - bodyWidth / 2;
      const y = pos.y - bodyHeight / 2;
      ctx.beginPath();
      ctx.moveTo(x, y + bodyHeight);
      ctx.lineTo(x, y + bodyHeight * 0.3);
      ctx.quadraticCurveTo(x, y, x + bodyWidth / 2, y);
      ctx.quadraticCurveTo(x + bodyWidth, y, x + bodyWidth, y + bodyHeight * 0.3);
      ctx.lineTo(x + bodyWidth, y + bodyHeight);
      ctx.fillStyle = ghost.frightened ? (blink ? COLORS.frightenedBlink : COLORS.frightened) : ghost.color;
      ctx.fill();

      // eyes
      ctx.fillStyle = '#fff';
      const eyeOffsetX = TILE_SIZE * 0.15;
      const eyeOffsetY = TILE_SIZE * 0.05;
      ctx.beginPath();
      ctx.arc(pos.x - eyeOffsetX, pos.y - eyeOffsetY, TILE_SIZE * 0.12, 0, Math.PI * 2);
      ctx.arc(pos.x + eyeOffsetX, pos.y - eyeOffsetY, TILE_SIZE * 0.12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(pos.x - eyeOffsetX, pos.y - eyeOffsetY, TILE_SIZE * 0.05, 0, Math.PI * 2);
      ctx.arc(pos.x + eyeOffsetX, pos.y - eyeOffsetY, TILE_SIZE * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function syncHud() {
    ui.score.textContent = state.score.toString().padStart(1, '0');
    ui.lives.textContent = state.lives.toString();
    ui.level.textContent = state.level.toString();
  }

  function setStatus(text) {
    ui.status.textContent = text;
  }

  return {
    start,
    togglePause,
    isRunning,
    setPacmanDirection,
  };
}
