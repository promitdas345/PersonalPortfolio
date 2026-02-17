/**
 * Connect 4 — Unbeatable AI (Bitboard Engine)
 *
 * AI uses negamax with alpha-beta pruning, iterative deepening,
 * bitboard representation, transposition table, and threat analysis.
 * Bitboard gives O(1) win detection for massive speedup.
 *
 * Board representation:
 *   ROWS = 6, COLS = 7
 *   board[row][col] = 0 (empty) | 1 (player) | 2 (AI)   (for UI)
 *   Bitboard: 49-bit BigInt, column-major, 7 bits/col (6 rows + sentinel)
 */
(function () {
    'use strict';

    /* ─── constants ────────────────────────────────────────── */
    const ROWS = 6;
    const COLS = 7;
    const EMPTY = 0;
    const PLAYER = 1;
    const AI = 2;
    const WIN_LENGTH = 4;
    const TOTAL_CELLS = ROWS * COLS; // 42

    const COL_SCORE = [0, 1, 2, 3, 2, 1, 0];
    const MAX_DEPTH = 30;
    const TIME_BUDGET_MS = 3000;

    /* ─── bitboard constants ───────────────────────────────── */
    const BB_H = ROWS + 1;           // 7 bits per column
    const BB_H1 = BigInt(BB_H);       // 7n — horizontal shift
    const BB_H2 = BigInt(BB_H - 1);   // 6n — diagonal \ shift
    const BB_H3 = BigInt(BB_H + 1);   // 8n — diagonal / shift
    const BB_DIRS = [1n, BB_H1, BB_H2, BB_H3]; // vert, horiz, diag\, diag/

    // Precomputed column masks
    const BB_COL_BOT = new Array(COLS);
    const BB_COL_TOP = new Array(COLS);
    let BB_BOARD = 0n;      // all playable positions
    let BB_BOT_ROW = 0n;    // bottom bit of every column
    for (let c = 0; c < COLS; c++) {
        BB_COL_BOT[c] = 1n << BigInt(c * BB_H);
        BB_COL_TOP[c] = 1n << BigInt(c * BB_H + ROWS);
        BB_BOT_ROW |= BB_COL_BOT[c];
        for (let r = 0; r < ROWS; r++) BB_BOARD |= 1n << BigInt(c * BB_H + r);
    }

    /* ─── game state (UI) ──────────────────────────────────── */
    let board = [];
    let heights = [];
    let currentPlayer = PLAYER;
    let firstPlayer = PLAYER;
    let gameOver = false;
    let winCells = null;
    let moveHistory = [];
    let aiThinking = false;
    let moveCount = 0;
    let searchDeadline = 0;
    let searchAborted = false;

    /* ─── board operations (UI) ────────────────────────────── */
    function initBoard() {
        board = Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
        heights = Array(COLS).fill(ROWS - 1);
        currentPlayer = PLAYER;
        gameOver = false;
        winCells = null;
        moveHistory = [];
        aiThinking = false;
        moveCount = 0;
        searchAborted = false;
    }

    function canPlay(col) { return heights[col] >= 0; }

    function dropPiece(col, player) {
        const row = heights[col];
        board[row][col] = player;
        heights[col]--;
        moveCount++;
        moveHistory.push(col);
    }

    function undoPiece(col) {
        heights[col]++;
        const row = heights[col];
        board[row][col] = EMPTY;
        moveCount--;
        moveHistory.pop();
    }

    /* ─── win detection (UI — for highlighting cells) ──────── */
    const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

    function checkWinAt(row, col) {
        const player = board[row][col];
        if (player === EMPTY) return null;
        for (const [dr, dc] of DIRECTIONS) {
            const cells = [[row, col]];
            for (let i = 1; i < WIN_LENGTH; i++) {
                const r = row + dr * i, c = col + dc * i;
                if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== player) break;
                cells.push([r, c]);
            }
            for (let i = 1; i < WIN_LENGTH; i++) {
                const r = row - dr * i, c = col - dc * i;
                if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== player) break;
                cells.push([r, c]);
            }
            if (cells.length >= WIN_LENGTH) return cells;
        }
        return null;
    }

    function boardFull() { return moveCount >= TOTAL_CELLS; }

    /* ═══ BITBOARD AI ENGINE ═══════════════════════════════ */

    function bbHasWon(pos) {
        for (const d of BB_DIRS) {
            const m = pos & (pos >> d);
            if ((m & (m >> (d + d))) !== 0n) return true;
        }
        return false;
    }

    function bbPossible(mask) {
        return (mask + BB_BOT_ROW) & BB_BOARD;
    }

    function bbCanPlay(mask, col) {
        // Check if the column has any possible move (a bit in bbPossible within the column)
        const base = BigInt(col * BB_H);
        for (let r = 0; r < ROWS; r++) {
            const bit = 1n << (base + BigInt(r));
            if ((mask & bit) === 0n) return true; // found empty cell
        }
        return false; // all rows filled
    }

    /** Compute all squares where `pos` player would complete 4-in-a-row */
    function bbWinSpots(pos, mask) {
        let r = 0n;
        // Vertical
        r |= (pos << 1n) & (pos << 2n) & (pos << 3n);
        // Horizontal
        let p = (pos << BB_H1) & (pos << (BB_H1 + BB_H1));
        r |= p & (pos << (BB_H1 * 3n));
        r |= p & (pos >> BB_H1);
        p = (pos >> BB_H1) & (pos >> (BB_H1 + BB_H1));
        r |= p & (pos >> (BB_H1 * 3n));
        r |= p & (pos << BB_H1);
        // Diagonal /
        p = (pos << BB_H3) & (pos << (BB_H3 + BB_H3));
        r |= p & (pos << (BB_H3 * 3n));
        r |= p & (pos >> BB_H3);
        p = (pos >> BB_H3) & (pos >> (BB_H3 + BB_H3));
        r |= p & (pos >> (BB_H3 * 3n));
        r |= p & (pos << BB_H3);
        // Diagonal \
        p = (pos << BB_H2) & (pos << (BB_H2 + BB_H2));
        r |= p & (pos << (BB_H2 * 3n));
        r |= p & (pos >> BB_H2);
        p = (pos >> BB_H2) & (pos >> (BB_H2 + BB_H2));
        r |= p & (pos >> (BB_H2 * 3n));
        r |= p & (pos << BB_H2);
        return r & (BB_BOARD ^ mask);
    }

    function bbPopcount(x) {
        let c = 0;
        while (x) { x &= x - 1n; c++; }
        return c;
    }

    /** Convert current UI board → bitboard (AI's perspective for negamax) */
    function boardToBB() {
        let aiPos = 0n, plPos = 0n;
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                const bit = 1n << BigInt(c * BB_H + (ROWS - 1 - r));
                if (board[r][c] === AI) aiPos |= bit;
                else if (board[r][c] === PLAYER) plPos |= bit;
            }
        }
        return { aiPos, plPos, mask: aiPos | plPos };
    }

    /* ─── transposition table ──────────────────────────────── */
    const TT = new Map();
    const TT_MAX = 4000000;
    const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = -1;

    function ttStore(key, score, depth, flag) {
        if (TT.size >= TT_MAX) {
            const it = TT.keys();
            for (let i = 0; i < (TT_MAX >> 1); i++) TT.delete(it.next().value);
        }
        TT.set(key, { score, depth, flag });
    }

    /* ─── negamax with alpha-beta ──────────────────────────── */
    const MOVE_ORDER = [3, 2, 4, 1, 5, 0, 6]; // centre-out
    let nodeCount = 0;

    function negamax(position, mask, depth, alpha, beta, numMoves) {
        nodeCount++;
        // Time check every 4096 nodes
        if ((nodeCount & 4095) === 0 && Date.now() >= searchDeadline) {
            searchAborted = true;
            return 0;
        }

        // Draw
        if (numMoves >= TOTAL_CELLS) return 0;

        const possible = bbPossible(mask);

        // Can current player win immediately?
        const myWins = bbWinSpots(position, mask);
        if ((myWins & possible) !== 0n) return (TOTAL_CELLS + 1 - numMoves) >> 1;

        // Upper bound: best possible score
        let max = (TOTAL_CELLS - 1 - numMoves) >> 1;
        if (max <= alpha) return max; // can't improve
        if (beta > max) beta = max;

        // TT lookup
        const key = position + mask + BB_BOT_ROW;
        const cached = TT.get(key);
        if (cached && cached.depth >= depth) {
            if (cached.flag === TT_EXACT) return cached.score;
            if (cached.flag === TT_LOWER && cached.score >= beta) return cached.score;
            if (cached.flag === TT_UPPER && cached.score <= alpha) return cached.score;
            // Tighten bounds
            if (cached.flag === TT_LOWER && cached.score > alpha) alpha = cached.score;
            if (cached.flag === TT_UPPER && cached.score < beta) beta = cached.score;
        }

        // Opponent's threats
        const opponent = position ^ mask;
        const oppWins = bbWinSpots(opponent, mask);
        const forcedMoves = oppWins & possible;

        if (forcedMoves !== 0n) {
            // Must block. 2+ threats = loss
            if ((forcedMoves & (forcedMoves - 1n)) !== 0n) {
                const lossScore = -((TOTAL_CELLS - numMoves) >> 1);
                ttStore(key, lossScore, depth, TT_EXACT);
                return lossScore;
            }
        }

        // Don't play moves that let opponent win next turn (cell above is opp's win spot)
        let safeMoves = possible;
        for (let c = 0; c < COLS; c++) {
            if (!bbCanPlay(mask, c)) continue;
            const moveBase = BigInt(c * BB_H);
            // Find the row this piece would land in
            let moveBit = 0n;
            for (let r = 0; r < ROWS; r++) {
                const bit = 1n << (moveBase + BigInt(r));
                if ((mask & bit) === 0n) { moveBit = bit; break; }
            }
            if (moveBit === 0n) continue;
            // Cell directly above
            const aboveBit = moveBit << 1n;
            if ((aboveBit & oppWins) !== 0n) {
                safeMoves &= ~moveBit;
            }
        }

        // If forced move, only play that
        if (forcedMoves !== 0n) safeMoves = forcedMoves;

        if (safeMoves === 0n) {
            const lossScore = -((TOTAL_CELLS - numMoves) >> 1);
            ttStore(key, lossScore, depth, TT_EXACT);
            return lossScore;
        }

        if (depth === 0) {
            // Simple eval: count available winning spots
            const mySpotCount = bbPopcount(bbWinSpots(position, mask));
            const oppSpotCount = bbPopcount(bbWinSpots(opponent, mask));
            return mySpotCount - oppSpotCount;
        }

        let bestScore = -Infinity;
        const origAlpha = alpha;

        for (const c of MOVE_ORDER) {
            if (!bbCanPlay(mask, c)) continue;
            // Check this column is in safeMoves
            let moveBit = 0n;
            const moveBase = BigInt(c * BB_H);
            for (let r = 0; r < ROWS; r++) {
                const bit = 1n << (moveBase + BigInt(r));
                if ((mask & bit) === 0n) { moveBit = bit; break; }
            }
            if (moveBit === 0n || (moveBit & safeMoves) === 0n) continue;

            // Make move (flip perspective for negamax)
            const newMask = mask | moveBit;
            const newPos = opponent; // opponent becomes current player
            const score = -negamax(newPos, newMask, depth - 1, -beta, -alpha, numMoves + 1);

            if (searchAborted) return 0;

            if (score > bestScore) bestScore = score;
            if (score > alpha) alpha = score;
            if (alpha >= beta) break;
        }

        if (bestScore !== -Infinity) {
            let flag = TT_EXACT;
            if (bestScore <= origAlpha) flag = TT_UPPER;
            else if (bestScore >= beta) flag = TT_LOWER;
            ttStore(key, bestScore, depth, flag);
        }

        return bestScore;
    }

    /* ─── aiBestMove ───────────────────────────────────────── */
    function aiBestMove() {
        if (moveCount === 0) return 3; // first move: centre

        const { aiPos, plPos, mask } = boardToBB();

        // Check for immediate win
        const possible = bbPossible(mask);
        const aiWins = bbWinSpots(aiPos, mask);
        for (const c of MOVE_ORDER) {
            if (!bbCanPlay(mask, c)) continue;
            const base = BigInt(c * BB_H);
            for (let r = 0; r < ROWS; r++) {
                const bit = 1n << (base + BigInt(r));
                if ((mask & bit) === 0n) {
                    if ((bit & aiWins & possible) !== 0n) return c;
                    break;
                }
            }
        }

        // Check for immediate block
        const plWins = bbWinSpots(plPos, mask);
        for (const c of MOVE_ORDER) {
            if (!bbCanPlay(mask, c)) continue;
            const base = BigInt(c * BB_H);
            for (let r = 0; r < ROWS; r++) {
                const bit = 1n << (base + BigInt(r));
                if ((mask & bit) === 0n) {
                    if ((bit & plWins & possible) !== 0n) return c;
                    break;
                }
            }
        }

        // Iterative deepening negamax
        // In negamax, AI is the "current player" — position = aiPos
        let bestCol = 3;
        const remaining = TOTAL_CELLS - moveCount;
        const maxD = Math.min(MAX_DEPTH, remaining);

        // Adaptive time: more time for early critical moves
        const timeBudget = moveCount <= 6 ? 5000 : TIME_BUDGET_MS;
        searchDeadline = Date.now() + timeBudget;
        searchAborted = false;
        TT.clear();

        for (let d = 1; d <= maxD; d++) {
            nodeCount = 0;
            let iterBest = -1;
            let iterScore = -Infinity;

            for (const c of MOVE_ORDER) {
                if (!bbCanPlay(mask, c)) continue;

                // Find the move bit for this column
                const base = BigInt(c * BB_H);
                let moveBit = 0n;
                for (let r = 0; r < ROWS; r++) {
                    const bit = 1n << (base + BigInt(r));
                    if ((mask & bit) === 0n) { moveBit = bit; break; }
                }
                if (moveBit === 0n) continue;

                const newMask = mask | moveBit;
                const newPos = plPos; // opponent (player) becomes current
                const score = -negamax(newPos, newMask, d - 1, -Infinity, -iterScore, moveCount + 1);

                if (searchAborted) break;

                if (score > iterScore) {
                    iterScore = score;
                    iterBest = c;
                }
            }

            if (!searchAborted && iterBest >= 0) {
                bestCol = iterBest;
            }
            if (searchAborted || Date.now() >= searchDeadline) break;
        }

        return bestCol;
    }

    /* ─── rendering ────────────────────────────────────────── */
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    let canvas, ctx;
    const CELL = 80;
    const RADIUS = 32;
    const HEADER_H = 80;
    const BOARD_Y = HEADER_H;
    const BOARD_W = COLS * CELL;
    const BOARD_H = ROWS * CELL;
    const ANIM_FRAMES = 18;

    let hoverCol = -1;
    let animating = false;
    let animCol = -1;
    let animRow = -1;
    let animPlayer = 0;
    let animFrame = 0;
    let animTargetY = 0;

    function playerColor(p) {
        if (p === PLAYER) return '#ef4444';
        if (p === AI) return '#facc15';
        return 'transparent';
    }

    function draw() {
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

        const grad = ctx.createLinearGradient(0, BOARD_Y, 0, BOARD_Y + BOARD_H);
        grad.addColorStop(0, '#1e3a8a');
        grad.addColorStop(1, '#1e40af');
        roundRect(ctx, 0, BOARD_Y, BOARD_W, BOARD_H, 16);
        ctx.fillStyle = grad;
        ctx.fill();

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const cx = c * CELL + CELL / 2;
                const cy = BOARD_Y + r * CELL + CELL / 2;

                ctx.beginPath();
                ctx.arc(cx, cy + 2, RADIUS, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
                if (board[r][c] !== EMPTY && !(animating && r === animRow && c === animCol)) {
                    const isWin = winCells && winCells.some(([wr, wc]) => wr === r && wc === c);
                    ctx.fillStyle = playerColor(board[r][c]);
                    ctx.fill();
                    if (isWin) {
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 3;
                        ctx.stroke();
                    }
                    const glossGrad = ctx.createRadialGradient(cx - 8, cy - 10, 4, cx, cy, RADIUS);
                    glossGrad.addColorStop(0, 'rgba(255,255,255,0.5)');
                    glossGrad.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = glossGrad;
                    ctx.fill();
                } else {
                    ctx.fillStyle = '#0f172a';
                    ctx.fill();
                }
            }
        }

        if (hoverCol >= 0 && !gameOver && !aiThinking && !animating && currentPlayer === PLAYER) {
            const cx = hoverCol * CELL + CELL / 2;
            ctx.beginPath();
            ctx.arc(cx, HEADER_H / 2, RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(239,68,68,0.7)';
            ctx.fill();
            const glossGrad = ctx.createRadialGradient(cx - 8, HEADER_H / 2 - 10, 4, cx, HEADER_H / 2, RADIUS);
            glossGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
            glossGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = glossGrad;
            ctx.fill();
        }

        if (animating) {
            const cx = animCol * CELL + CELL / 2;
            const startY = HEADER_H / 2;
            const progress = animFrame / ANIM_FRAMES;
            const ease = 1 - Math.pow(1 - progress, 3);
            const cy = startY + (animTargetY - startY) * ease;
            ctx.beginPath();
            ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = playerColor(animPlayer);
            ctx.fill();
            const glossGrad = ctx.createRadialGradient(cx - 8, cy - 10, 4, cx, cy, RADIUS);
            glossGrad.addColorStop(0, 'rgba(255,255,255,0.5)');
            glossGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = glossGrad;
            ctx.fill();
        }
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    /* ─── animation loop ───────────────────────────────────── */
    function animateDrop(col, row, player, callback) {
        animating = true;
        animCol = col;
        animRow = row;
        animPlayer = player;
        animFrame = 0;
        animTargetY = BOARD_Y + row * CELL + CELL / 2;

        function tick() {
            animFrame++;
            draw();
            if (animFrame < ANIM_FRAMES) {
                requestAnimationFrame(tick);
            } else {
                animating = false;
                draw();
                callback();
            }
        }
        requestAnimationFrame(tick);
    }

    /* ─── game logic ───────────────────────────────────────── */
    function handleColumnClick(col) {
        if (gameOver || aiThinking || animating || currentPlayer !== PLAYER) return;
        if (!canPlay(col)) return;

        const row = heights[col];
        dropPiece(col, PLAYER);

        animateDrop(col, row, PLAYER, () => {
            draw();

            const cells = checkWinAt(row, col);
            if (cells) {
                winCells = cells;
                gameOver = true;
                setStatus('🎉 You win! (Impossible… or is it?)');
                draw();
                return;
            }
            if (boardFull()) {
                gameOver = true;
                setStatus("🤝 It's a draw!");
                draw();
                return;
            }

            currentPlayer = AI;
            setStatus('🤔 AI is thinking…');
            aiThinking = true;
            draw();

            setTimeout(() => {
                const aiCol = aiBestMove();
                const aiRow = heights[aiCol];
                dropPiece(aiCol, AI);
                aiThinking = false;

                animateDrop(aiCol, aiRow, AI, () => {
                    draw();

                    const aiCells = checkWinAt(aiRow, aiCol);
                    if (aiCells) {
                        winCells = aiCells;
                        gameOver = true;
                        setStatus('🤖 AI wins! Better luck next time.');
                        draw();
                        return;
                    }
                    if (boardFull()) {
                        gameOver = true;
                        setStatus("🤝 It's a draw!");
                        draw();
                        return;
                    }

                    currentPlayer = PLAYER;
                    setStatus('🔴 Your turn — click a column');
                    draw();
                });
            }, 50);
        });
    }

    function setStatus(text) {
        const el = $('#c4-status');
        if (el) el.textContent = text;
    }

    /* ─── event handling ───────────────────────────────────── */
    function getColFromX(x) {
        const col = Math.floor(x / CELL);
        return col >= 0 && col < COLS ? col : -1;
    }

    function setupEvents() {
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = BOARD_W / rect.width;
            const x = (e.clientX - rect.left) * scaleX;
            hoverCol = getColFromX(x);
            if (!animating) draw();
        });

        canvas.addEventListener('mouseleave', () => {
            hoverCol = -1;
            if (!animating) draw();
        });

        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = BOARD_W / rect.width;
            const x = (e.clientX - rect.left) * scaleX;
            const col = getColFromX(x);
            if (col >= 0) handleColumnClick(col);
        });

        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const touch = e.changedTouches[0];
            const scaleX = BOARD_W / rect.width;
            const x = (touch.clientX - rect.left) * scaleX;
            const col = getColFromX(x);
            if (col >= 0) handleColumnClick(col);
        });

        const resetBtn = $('#c4-reset');
        if (resetBtn) resetBtn.addEventListener('click', resetGame);

        const toggle = $('#c4-first-toggle');
        if (toggle) {
            toggle.addEventListener('click', (e) => {
                const btn = e.target.closest('.c4-toggle-btn');
                if (!btn || btn.classList.contains('active')) return;
                toggle.querySelectorAll('.c4-toggle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                firstPlayer = btn.dataset.first === 'ai' ? AI : PLAYER;
                resetGame();
            });
        }
    }

    function triggerAiMove() {
        setStatus('🤔 AI is thinking…');
        aiThinking = true;
        draw();

        setTimeout(() => {
            const aiCol = aiBestMove();
            const aiRow = heights[aiCol];
            dropPiece(aiCol, AI);
            aiThinking = false;

            animateDrop(aiCol, aiRow, AI, () => {
                currentPlayer = PLAYER;
                setStatus('🔴 Your turn — click a column');
                draw();
            });
        }, 50);
    }

    function resetGame() {
        initBoard();
        if (firstPlayer === AI) {
            currentPlayer = AI;
            draw();
            triggerAiMove();
        } else {
            setStatus('🔴 Your turn — click a column');
            draw();
        }
    }

    /* ─── high DPI canvas setup ────────────────────────────── */
    function setupCanvas() {
        canvas = $('#c4-canvas');
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const totalH = HEADER_H + BOARD_H;
        canvas.width = BOARD_W * dpr;
        canvas.height = totalH * dpr;
        canvas.style.width = BOARD_W + 'px';
        canvas.style.height = totalH + 'px';
        ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
    }

    /* ─── init ─────────────────────────────────────────────── */
    function init() {
        setupCanvas();
        if (!canvas) return;
        initBoard();
        setupEvents();
        setStatus('🔴 Your turn — click a column');
        draw();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
