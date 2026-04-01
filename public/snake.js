// Google-style Snake game — Canvas-based, vanilla JS
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('snake-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // ─── Constants ───
    const COLS = 17;
    const ROWS = 15;
    const CELL = Math.floor(canvas.width / COLS); // ~30px
    canvas.width = COLS * CELL;
    canvas.height = ROWS * CELL;

    const SPEED_MAP = { slow: 160, normal: 105, fast: 65 };
    const COLORS = {
        boardLight: '#aad751',
        boardDark: '#a2d149',
        snake: '#4674e9',
        snakeOutline: '#3b63c7',
        snakeHead: '#4674e9',
        snakeEye: '#fff',
        snakePupil: '#1a1a2e',
        apple: '#e53935',
        appleHighlight: '#ff6f61',
        appleStem: '#33691e',
        appleLeaf: '#7cb342',
    };

    // ─── State ───
    const state = {
        phase: 'menu', // menu | playing | gameover | settings
        snake: [],
        dir: { dx: 1, dy: 0 },
        nextDir: null,
        food: null,
        score: 0,
        highScore: parseInt(localStorage.getItem('snakeHighScore') || '0', 10),
        totalApples: parseInt(localStorage.getItem('snakeTotalApples') || '0', 10),
        speed: 'normal',
        soundOn: true,
        wallsOn: true,
        dailyMode: false,
        lastTick: 0,
        tickInterval: SPEED_MAP.normal,
        animFrame: null,
    };

    // ─── DOM refs ───
    const $score = document.getElementById('snake-score');
    const $menu = document.getElementById('snake-menu');
    const $settings = document.getElementById('snake-settings');
    const $gameover = document.getElementById('snake-gameover');
    const $finalScore = document.getElementById('snake-final-score');
    const $menuApples = document.getElementById('snake-menu-apples');
    const $menuHigh = document.getElementById('snake-menu-highscore');
    const $playBtn = document.getElementById('snake-play-btn');
    const $settingsBtn = document.getElementById('snake-settings-btn');
    const $dailyBtn = document.getElementById('snake-daily-btn');
    const $settingsClose = document.getElementById('snake-settings-close');
    const $retryBtn = document.getElementById('snake-retry-btn');
    const $speedToggle = document.getElementById('snake-speed-toggle');
    const $soundToggle = document.getElementById('snake-sound-setting');
    const $wallsToggle = document.getElementById('snake-walls-setting');
    const $soundBtn = document.getElementById('snake-sound-btn');
    const $closeBtn = document.getElementById('snake-close-btn');
    const $previewCanvas = document.getElementById('snake-preview-canvas');

    // ─── Audio ───
    const audio = createSnakeAudio();

    // ─── Preview canvas ───
    function drawPreview() {
        if (!$previewCanvas) return;
        const pCtx = $previewCanvas.getContext('2d');
        const w = $previewCanvas.parentElement.offsetWidth;
        const h = $previewCanvas.parentElement.offsetHeight;
        $previewCanvas.width = w;
        $previewCanvas.height = h;

        // Sky
        pCtx.fillStyle = '#87ceeb';
        pCtx.fillRect(0, 0, w, h * 0.65);

        // Ground checkered
        const groundY = Math.floor(h * 0.65);
        const cs = 20;
        for (let gy = groundY; gy < h; gy += cs) {
            for (let gx = 0; gx < w; gx += cs) {
                const even = ((Math.floor((gx) / cs) + Math.floor((gy - groundY) / cs)) % 2 === 0);
                pCtx.fillStyle = even ? '#aad751' : '#a2d149';
                pCtx.fillRect(gx, gy, cs, cs);
            }
        }

        // Draw a cute snake on the ground
        const snakeY = groundY - 8;
        const segments = [
            { x: w * 0.58, y: snakeY },
            { x: w * 0.52, y: snakeY },
            { x: w * 0.46, y: snakeY },
            { x: w * 0.40, y: snakeY },
            { x: w * 0.34, y: snakeY },
        ];

        // Body
        segments.forEach((seg, i) => {
            pCtx.beginPath();
            const radius = i === 0 ? 14 : 11;
            pCtx.arc(seg.x, seg.y, radius, 0, Math.PI * 2);
            pCtx.fillStyle = i === 0 ? '#4674e9' : '#5a85ed';
            pCtx.fill();
            pCtx.strokeStyle = '#3b63c7';
            pCtx.lineWidth = 1.5;
            pCtx.stroke();
        });

        // Eyes on head
        const head = segments[0];
        pCtx.fillStyle = '#fff';
        pCtx.beginPath();
        pCtx.arc(head.x + 4, head.y - 5, 5, 0, Math.PI * 2);
        pCtx.arc(head.x + 12, head.y - 5, 5, 0, Math.PI * 2);
        pCtx.fill();
        pCtx.fillStyle = '#1a1a2e';
        pCtx.beginPath();
        pCtx.arc(head.x + 6, head.y - 5, 2.5, 0, Math.PI * 2);
        pCtx.arc(head.x + 14, head.y - 5, 2.5, 0, Math.PI * 2);
        pCtx.fill();

        // Draw an apple in the sky area
        drawAppleAt(pCtx, w * 0.30, h * 0.30, 14);
        // Trophy
        pCtx.font = 'bold 28px sans-serif';
        pCtx.fillStyle = '#f9a825';
        pCtx.fillText('🏆', w * 0.58, h * 0.38);
    }

    // ─── Init ───
    syncMenuStats();
    drawPreview();
    drawBoard();

    // ─── Event bindings ───
    $playBtn.addEventListener('click', () => startGame(false));
    $dailyBtn.addEventListener('click', () => startGame(true));
    $settingsBtn.addEventListener('click', () => showSettings());
    $settingsClose.addEventListener('click', () => hideSettings());
    $retryBtn.addEventListener('click', () => startGame(state.dailyMode));
    $closeBtn.addEventListener('click', () => backToMenu());
    $soundBtn.addEventListener('click', () => {
        state.soundOn = !state.soundOn;
        $soundToggle.classList.toggle('on', state.soundOn);
        $soundBtn.style.opacity = state.soundOn ? '1' : '0.4';
    });

    $soundToggle.addEventListener('click', () => {
        state.soundOn = !state.soundOn;
        $soundToggle.classList.toggle('on', state.soundOn);
        $soundBtn.style.opacity = state.soundOn ? '1' : '0.4';
    });

    $wallsToggle.addEventListener('click', () => {
        state.wallsOn = !state.wallsOn;
        $wallsToggle.classList.toggle('on', state.wallsOn);
    });

    $speedToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-speed]');
        if (!btn) return;
        const speed = btn.dataset.speed;
        state.speed = speed;
        state.tickInterval = SPEED_MAP[speed];
        $speedToggle.querySelectorAll('.snake-speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });

    // Keyboard
    const KEY_MAP = {
        ArrowUp: { dx: 0, dy: -1 }, w: { dx: 0, dy: -1 }, W: { dx: 0, dy: -1 },
        ArrowDown: { dx: 0, dy: 1 }, s: { dx: 0, dy: 1 }, S: { dx: 0, dy: 1 },
        ArrowLeft: { dx: -1, dy: 0 }, a: { dx: -1, dy: 0 }, A: { dx: -1, dy: 0 },
        ArrowRight: { dx: 1, dy: 0 }, d: { dx: 1, dy: 0 }, D: { dx: 1, dy: 0 },
    };

    window.addEventListener('keydown', (e) => {
        const mapped = KEY_MAP[e.key];
        if (!mapped) return;
        e.preventDefault();
        audio.unlock();
        if (state.phase === 'menu') {
            startGame(false);
            state.nextDir = mapped;
            return;
        }
        if (state.phase !== 'playing') return;
        // Prevent reversing
        if (mapped.dx === -state.dir.dx && mapped.dy === -state.dir.dy) return;
        state.nextDir = mapped;
    });

    // Touch / swipe
    let touchStart = null;
    canvas.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
        if (!touchStart) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStart.x;
        const dy = t.clientY - touchStart.y;
        touchStart = null;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;

        let dir;
        if (Math.abs(dx) > Math.abs(dy)) {
            dir = dx > 0 ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 };
        } else {
            dir = dy > 0 ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 };
        }

        audio.unlock();
        if (state.phase === 'menu') {
            startGame(false);
            state.nextDir = dir;
            return;
        }
        if (state.phase !== 'playing') return;
        if (dir.dx === -state.dir.dx && dir.dy === -state.dir.dy) return;
        state.nextDir = dir;
    }, { passive: true });

    // ─── Game flow ───
    function startGame(daily) {
        state.dailyMode = daily;
        state.score = 0;
        state.dir = { dx: 1, dy: 0 };
        state.nextDir = null;
        state.lastTick = 0;
        state.tickInterval = SPEED_MAP[state.speed];

        // Place snake in center
        const startRow = Math.floor(ROWS / 2);
        const startCol = Math.floor(COLS / 2) - 2;
        state.snake = [
            { x: startCol + 2, y: startRow },
            { x: startCol + 1, y: startRow },
            { x: startCol, y: startRow },
        ];

        if (daily) {
            // Seeded random for daily
            const today = new Date();
            const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
            state._dailySeed = seed;
            state._dailyRng = mulberry32(seed);
        } else {
            state._dailySeed = 0;
            state._dailyRng = null;
        }

        spawnFood();
        state.phase = 'playing';
        $score.textContent = '0';
        hideAllOverlays();

        cancelAnimationFrame(state.animFrame);
        state.animFrame = requestAnimationFrame(gameLoop);
    }

    function gameLoop(timestamp) {
        if (state.phase !== 'playing') return;

        if (!state.lastTick) state.lastTick = timestamp;
        if (timestamp - state.lastTick >= state.tickInterval) {
            state.lastTick = timestamp;
            tick();
        }

        drawBoard();
        drawFood();
        drawSnake();

        state.animFrame = requestAnimationFrame(gameLoop);
    }

    function tick() {
        if (state.nextDir) {
            state.dir = state.nextDir;
            state.nextDir = null;
        }

        const head = state.snake[0];
        let nx = head.x + state.dir.dx;
        let ny = head.y + state.dir.dy;

        // Wall handling
        if (state.wallsOn) {
            if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
                endGame();
                return;
            }
        } else {
            // Wrap
            if (nx < 0) nx = COLS - 1;
            if (nx >= COLS) nx = 0;
            if (ny < 0) ny = ROWS - 1;
            if (ny >= ROWS) ny = 0;
        }

        // Self collision
        for (let i = 0; i < state.snake.length; i++) {
            if (state.snake[i].x === nx && state.snake[i].y === ny) {
                endGame();
                return;
            }
        }

        const newHead = { x: nx, y: ny };
        state.snake.unshift(newHead);

        // Eat food?
        if (state.food && nx === state.food.x && ny === state.food.y) {
            state.score++;
            state.totalApples++;
            localStorage.setItem('snakeTotalApples', String(state.totalApples));
            $score.textContent = String(state.score);
            if (state.soundOn) audio.eat();
            spawnFood();
        } else {
            state.snake.pop();
        }
    }

    function endGame() {
        state.phase = 'gameover';
        cancelAnimationFrame(state.animFrame);

        if (state.score > state.highScore) {
            state.highScore = state.score;
            localStorage.setItem('snakeHighScore', String(state.highScore));
        }

        if (state.soundOn) audio.die();

        // Final draw
        drawBoard();
        drawFood();
        drawSnake();

        $finalScore.textContent = String(state.score);
        $gameover.classList.add('visible');
    }

    function backToMenu() {
        state.phase = 'menu';
        cancelAnimationFrame(state.animFrame);
        hideAllOverlays();
        syncMenuStats();
        $menu.classList.add('visible');
        drawBoard();
    }

    function showSettings() {
        $settings.classList.add('visible');
    }

    function hideSettings() {
        $settings.classList.remove('visible');
    }

    function hideAllOverlays() {
        $menu.classList.remove('visible');
        $settings.classList.remove('visible');
        $gameover.classList.remove('visible');
    }

    function syncMenuStats() {
        $menuApples.textContent = String(state.totalApples);
        $menuHigh.textContent = String(state.highScore);
    }

    // ─── Food spawning ───
    function spawnFood() {
        const occupied = new Set(state.snake.map(s => `${s.x},${s.y}`));
        const free = [];
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                if (!occupied.has(`${x},${y}`)) free.push({ x, y });
            }
        }
        if (!free.length) {
            // Player filled the whole board — win!
            endGame();
            return;
        }
        if (state._dailyRng) {
            const idx = Math.floor(state._dailyRng() * free.length);
            state.food = free[idx];
        } else {
            state.food = free[Math.floor(Math.random() * free.length)];
        }
    }

    // ─── Drawing ───
    function drawBoard() {
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const even = (row + col) % 2 === 0;
                ctx.fillStyle = even ? COLORS.boardLight : COLORS.boardDark;
                ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
            }
        }
    }

    function drawFood() {
        if (!state.food) return;
        const cx = state.food.x * CELL + CELL / 2;
        const cy = state.food.y * CELL + CELL / 2;
        drawAppleAt(ctx, cx, cy, CELL * 0.42);
    }

    function drawAppleAt(c, cx, cy, r) {
        // Main body
        c.beginPath();
        c.arc(cx, cy + r * 0.08, r, 0, Math.PI * 2);
        c.fillStyle = COLORS.apple;
        c.fill();

        // Highlight
        c.beginPath();
        c.arc(cx - r * 0.25, cy - r * 0.2, r * 0.35, 0, Math.PI * 2);
        c.fillStyle = COLORS.appleHighlight;
        c.globalAlpha = 0.35;
        c.fill();
        c.globalAlpha = 1;

        // Stem
        c.beginPath();
        c.moveTo(cx, cy - r * 0.7);
        c.quadraticCurveTo(cx + r * 0.15, cy - r * 1.2, cx + r * 0.1, cy - r * 1.35);
        c.strokeStyle = COLORS.appleStem;
        c.lineWidth = 2;
        c.lineCap = 'round';
        c.stroke();

        // Leaf
        c.beginPath();
        c.ellipse(cx + r * 0.35, cy - r * 1.05, r * 0.35, r * 0.18, -0.4, 0, Math.PI * 2);
        c.fillStyle = COLORS.appleLeaf;
        c.fill();
    }

    function drawSnake() {
        const snake = state.snake;
        if (!snake.length) return;

        // Draw body segments (tail to head)
        for (let i = snake.length - 1; i >= 0; i--) {
            const seg = snake[i];
            const cx = seg.x * CELL + CELL / 2;
            const cy = seg.y * CELL + CELL / 2;

            // Rounded rectangle body segment
            const inset = 1;
            const size = CELL - inset * 2;
            const radius = size * 0.35;

            // Gradient color from tail to head
            const t = snake.length > 1 ? i / (snake.length - 1) : 1;
            const r = Math.round(70 + t * 0);
            const g = Math.round(116 + t * 10);
            const b = Math.round(233 + t * 10);
            const bodyColor = `rgb(${r}, ${g}, ${b})`;

            ctx.fillStyle = bodyColor;
            drawRoundRect(ctx, seg.x * CELL + inset, seg.y * CELL + inset, size, size, radius);
            ctx.fill();

            // Subtle outline
            ctx.strokeStyle = COLORS.snakeOutline;
            ctx.lineWidth = 1;
            drawRoundRect(ctx, seg.x * CELL + inset, seg.y * CELL + inset, size, size, radius);
            ctx.stroke();

            // Connect segments (fill gaps between)
            if (i < snake.length - 1) {
                const next = snake[i + 1];
                const mx = (seg.x + next.x) / 2 * CELL + CELL / 2;
                const my = (seg.y + next.y) / 2 * CELL + CELL / 2;

                // Handle wrapping — don't draw connector if segments are far apart
                const distX = Math.abs(seg.x - next.x);
                const distY = Math.abs(seg.y - next.y);
                if (distX <= 1 && distY <= 1) {
                    ctx.fillStyle = bodyColor;
                    if (seg.x !== next.x) {
                        // Horizontal connector
                        const minX = Math.min(seg.x, next.x) * CELL + CELL / 2;
                        ctx.fillRect(minX, seg.y * CELL + inset, CELL, size);
                    } else if (seg.y !== next.y) {
                        // Vertical connector
                        const minY = Math.min(seg.y, next.y) * CELL + CELL / 2;
                        ctx.fillRect(seg.x * CELL + inset, minY, size, CELL);
                    }
                }
            }
        }

        // Redraw head on top
        const head = snake[0];
        const hx = head.x * CELL + CELL / 2;
        const hy = head.y * CELL + CELL / 2;
        const headSize = CELL - 2;
        const headRadius = headSize * 0.38;

        ctx.fillStyle = COLORS.snakeHead;
        drawRoundRect(ctx, head.x * CELL + 1, head.y * CELL + 1, headSize, headSize, headRadius);
        ctx.fill();
        ctx.strokeStyle = COLORS.snakeOutline;
        ctx.lineWidth = 1;
        drawRoundRect(ctx, head.x * CELL + 1, head.y * CELL + 1, headSize, headSize, headRadius);
        ctx.stroke();

        // Eyes
        const eyeR = CELL * 0.14;
        const pupilR = CELL * 0.07;
        let ex1, ey1, ex2, ey2;

        if (state.dir.dx === 1) {
            // Right
            ex1 = hx + CELL * 0.12; ey1 = hy - CELL * 0.15;
            ex2 = hx + CELL * 0.12; ey2 = hy + CELL * 0.15;
        } else if (state.dir.dx === -1) {
            // Left
            ex1 = hx - CELL * 0.12; ey1 = hy - CELL * 0.15;
            ex2 = hx - CELL * 0.12; ey2 = hy + CELL * 0.15;
        } else if (state.dir.dy === -1) {
            // Up
            ex1 = hx - CELL * 0.15; ey1 = hy - CELL * 0.12;
            ex2 = hx + CELL * 0.15; ey2 = hy - CELL * 0.12;
        } else {
            // Down
            ex1 = hx - CELL * 0.15; ey1 = hy + CELL * 0.12;
            ex2 = hx + CELL * 0.15; ey2 = hy + CELL * 0.12;
        }

        // White of eyes
        ctx.fillStyle = COLORS.snakeEye;
        ctx.beginPath();
        ctx.arc(ex1, ey1, eyeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex2, ey2, eyeR, 0, Math.PI * 2);
        ctx.fill();

        // Pupils — shifted toward direction
        const pOff = CELL * 0.03;
        const px = state.dir.dx * pOff;
        const py = state.dir.dy * pOff;
        ctx.fillStyle = COLORS.snakePupil;
        ctx.beginPath();
        ctx.arc(ex1 + px, ey1 + py, pupilR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex2 + px, ey2 + py, pupilR, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawRoundRect(c, x, y, w, h, r) {
        c.beginPath();
        c.moveTo(x + r, y);
        c.lineTo(x + w - r, y);
        c.quadraticCurveTo(x + w, y, x + w, y + r);
        c.lineTo(x + w, y + h - r);
        c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        c.lineTo(x + r, y + h);
        c.quadraticCurveTo(x, y + h, x, y + h - r);
        c.lineTo(x, y + r);
        c.quadraticCurveTo(x, y, x + r, y);
        c.closePath();
    }

    // ─── Seeded RNG (Mulberry32) ───
    function mulberry32(a) {
        return function () {
            a |= 0;
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ─── Audio (Web Audio API) ───
    function createSnakeAudio() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return { unlock() { }, eat() { }, die() { } };

        let actx = null;
        let unlocked = false;

        function ensureCtx() {
            if (!actx) {
                actx = new AudioCtx();
            }
            if (actx.state === 'suspended') {
                actx.resume();
            }
        }

        function unlock() {
            if (unlocked) return;
            ensureCtx();
            unlocked = true;
        }

        function playTone(freq, duration, type, vol) {
            if (!state.soundOn) return;
            ensureCtx();
            const osc = actx.createOscillator();
            const gain = actx.createGain();
            osc.type = type || 'square';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(vol || 0.15, actx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + duration);
            osc.connect(gain);
            gain.connect(actx.destination);
            osc.start();
            osc.stop(actx.currentTime + duration);
        }

        return {
            unlock,
            eat() {
                playTone(587, 0.08, 'square', 0.12);
                setTimeout(() => playTone(784, 0.1, 'square', 0.1), 60);
            },
            die() {
                playTone(300, 0.15, 'sawtooth', 0.15);
                setTimeout(() => playTone(200, 0.2, 'sawtooth', 0.12), 120);
                setTimeout(() => playTone(120, 0.3, 'sawtooth', 0.1), 250);
            },
        };
    }
});
