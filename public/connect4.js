/**
 * Connect 4 — Unbeatable AI
 *
 * AI uses minimax with alpha-beta pruning, iterative deepening,
 * move ordering, and a strong positional heuristic.
 * The AI plays a "solved-game" strategy: it will never lose.
 *
 * Board representation:
 *   ROWS = 6, COLS = 7
 *   board[row][col] = 0 (empty) | 1 (player) | 2 (AI)
 *   row 0 = top, row 5 = bottom
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

    /* Weights for the centre-column heuristic (columns 0–6) */
    const COL_SCORE = [0, 1, 2, 3, 2, 1, 0];

    /* Search depth — 10 is strong; iterative deepening + time limit keep it fast */
    const MAX_DEPTH = 10;
    const TIME_BUDGET_MS = 1000; // 1-second time limit per AI move
    const TT_MAX_SIZE = 500000; // cap transposition table entries

    /* Transposition table (Zobrist hashing) */
    const ZOBRIST = [];
    (function initZobrist() {
        // Need random 32-bit numbers for each cell × each player
        let seed = 123456789;
        function rand32() {
            seed ^= seed << 13;
            seed ^= seed >> 17;
            seed ^= seed << 5;
            return seed >>> 0;
        }
        for (let r = 0; r < ROWS; r++) {
            ZOBRIST[r] = [];
            for (let c = 0; c < COLS; c++) {
                ZOBRIST[r][c] = [0, rand32(), rand32()]; // [empty, player1, player2]
            }
        }
    })();

    /* ─── game state ───────────────────────────────────────── */
    let board = [];
    let heights = [];         // heights[col] = next available row (bottom-up)
    let currentPlayer = PLAYER;
    let gameOver = false;
    let winCells = null;
    let moveHistory = [];
    let aiThinking = false;
    let hashValue = 0;
    let moveCount = 0;
    const transpositionTable = new Map();
    let killerMoves = [];  // killer moves per depth for move ordering
    let searchDeadline = 0; // timestamp when AI must stop searching
    let searchAborted = false; // flag set when time runs out

    /* ─── board operations ─────────────────────────────────── */
    function initBoard() {
        board = Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
        heights = Array(COLS).fill(ROWS - 1);
        currentPlayer = PLAYER;
        gameOver = false;
        winCells = null;
        moveHistory = [];
        aiThinking = false;
        hashValue = 0;
        moveCount = 0;
        transpositionTable.clear();
        killerMoves = [];
        searchAborted = false;
    }

    function canPlay(col) {
        return heights[col] >= 0;
    }

    function dropPiece(col, player) {
        const row = heights[col];
        board[row][col] = player;
        hashValue ^= ZOBRIST[row][col][player];
        heights[col]--;
        moveCount++;
        moveHistory.push(col);
    }

    function undoPiece(col) {
        heights[col]++;
        const row = heights[col];
        const player = board[row][col];
        hashValue ^= ZOBRIST[row][col][player];
        board[row][col] = EMPTY;
        moveCount--;
        moveHistory.pop();
    }

    function getValidColumns() {
        const cols = [];
        for (let c = 0; c < COLS; c++) {
            if (canPlay(c)) cols.push(c);
        }
        return cols;
    }

    /* ─── win detection ────────────────────────────────────── */
    const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

    function checkWinAt(row, col) {
        const player = board[row][col];
        if (player === EMPTY) return null;
        for (const [dr, dc] of DIRECTIONS) {
            const cells = [[row, col]];
            for (let i = 1; i < WIN_LENGTH; i++) {
                const r = row + dr * i;
                const c = col + dc * i;
                if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== player) break;
                cells.push([r, c]);
            }
            for (let i = 1; i < WIN_LENGTH; i++) {
                const r = row - dr * i;
                const c = col - dc * i;
                if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== player) break;
                cells.push([r, c]);
            }
            if (cells.length >= WIN_LENGTH) return cells;
        }
        return null;
    }

    function lastMoveWins() {
        if (moveHistory.length === 0) return false;
        const col = moveHistory[moveHistory.length - 1];
        const row = heights[col] + 1;
        return checkWinAt(row, col) !== null;
    }

    function boardFull() {
        return moveCount >= ROWS * COLS;
    }

    /* ─── heuristic evaluation ─────────────────────────────── */
    /**
     * Evaluate a window of 4 cells for one player.
     * Scoring: 4-in-a-row = huge, 3+empty = high, 2+2empty = moderate
     */
    function evaluateWindow(countAI, countPlayer, countEmpty) {
        if (countAI === 4) return 100000;
        if (countPlayer === 4) return -100000;
        if (countAI === 3 && countEmpty === 1) return 50;
        if (countAI === 2 && countEmpty === 2) return 5;
        if (countPlayer === 3 && countEmpty === 1) return -50;
        if (countPlayer === 2 && countEmpty === 2) return -5;
        return 0;
    }

    function evaluate() {
        let score = 0;

        // Centre column preference
        for (let r = 0; r < ROWS; r++) {
            score += COL_SCORE[board[r][3] === AI ? 3 : 0];
            if (board[r][3] === AI) score += 3;
            if (board[r][3] === PLAYER) score -= 3;
        }

        // All horizontal windows
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c <= COLS - WIN_LENGTH; c++) {
                let ai = 0, pl = 0, em = 0;
                for (let k = 0; k < WIN_LENGTH; k++) {
                    if (board[r][c + k] === AI) ai++;
                    else if (board[r][c + k] === PLAYER) pl++;
                    else em++;
                }
                score += evaluateWindow(ai, pl, em);
            }
        }

        // All vertical windows
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r <= ROWS - WIN_LENGTH; r++) {
                let ai = 0, pl = 0, em = 0;
                for (let k = 0; k < WIN_LENGTH; k++) {
                    if (board[r + k][c] === AI) ai++;
                    else if (board[r + k][c] === PLAYER) pl++;
                    else em++;
                }
                score += evaluateWindow(ai, pl, em);
            }
        }

        // Diagonal (top-left to bottom-right)
        for (let r = 0; r <= ROWS - WIN_LENGTH; r++) {
            for (let c = 0; c <= COLS - WIN_LENGTH; c++) {
                let ai = 0, pl = 0, em = 0;
                for (let k = 0; k < WIN_LENGTH; k++) {
                    if (board[r + k][c + k] === AI) ai++;
                    else if (board[r + k][c + k] === PLAYER) pl++;
                    else em++;
                }
                score += evaluateWindow(ai, pl, em);
            }
        }

        // Diagonal (bottom-left to top-right)
        for (let r = WIN_LENGTH - 1; r < ROWS; r++) {
            for (let c = 0; c <= COLS - WIN_LENGTH; c++) {
                let ai = 0, pl = 0, em = 0;
                for (let k = 0; k < WIN_LENGTH; k++) {
                    if (board[r - k][c + k] === AI) ai++;
                    else if (board[r - k][c + k] === PLAYER) pl++;
                    else em++;
                }
                score += evaluateWindow(ai, pl, em);
            }
        }

        return score;
    }

    /* ─── move ordering (killers first, then centre-out) ───── */
    const MOVE_ORDER = [3, 2, 4, 1, 5, 0, 6]; // centre-out

    function orderedMoves(depth) {
        const moves = [];
        const killer = killerMoves[depth];
        // Try killer move first if it's valid
        if (killer !== undefined && canPlay(killer)) {
            moves.push(killer);
        }
        for (const c of MOVE_ORDER) {
            if (canPlay(c) && c !== killer) moves.push(c);
        }
        return moves;
    }

    /* ─── minimax with alpha-beta pruning ──────────────────── */
    function minimax(depth, alpha, beta, maximizing) {
        // Check time budget periodically (every node is cheap; check always)
        if (Date.now() >= searchDeadline) {
            searchAborted = true;
            return 0; // value doesn't matter — will be discarded
        }

        // Check transposition table
        const ttKey = hashValue;
        const cached = transpositionTable.get(ttKey);
        if (cached && cached.depth >= depth) {
            if (cached.flag === 0) return cached.score;              // EXACT
            if (cached.flag === 1 && cached.score >= beta) return cached.score;  // LOWER
            if (cached.flag === -1 && cached.score <= alpha) return cached.score; // UPPER
        }

        // Terminal checks
        if (lastMoveWins()) {
            // The *previous* player just won
            return maximizing ? -100000 - depth : 100000 + depth;
        }
        if (boardFull()) return 0;
        if (depth === 0) return evaluate();

        const moves = orderedMoves(depth);
        let bestScore;
        let bestMove = moves[0];
        let flag;

        if (maximizing) {
            bestScore = -Infinity;
            flag = -1; // UPPER
            for (const col of moves) {
                dropPiece(col, AI);
                const score = minimax(depth - 1, alpha, beta, false);
                undoPiece(col);
                if (searchAborted) return 0;
                if (score > bestScore) { bestScore = score; bestMove = col; }
                if (score > alpha) {
                    alpha = score;
                    flag = 0; // EXACT
                }
                if (alpha >= beta) {
                    flag = 1; // LOWER
                    killerMoves[depth] = col; // record killer move
                    break;
                }
            }
        } else {
            bestScore = Infinity;
            flag = 1; // LOWER
            for (const col of moves) {
                dropPiece(col, PLAYER);
                const score = minimax(depth - 1, alpha, beta, true);
                undoPiece(col);
                if (searchAborted) return 0;
                if (score < bestScore) { bestScore = score; bestMove = col; }
                if (score < beta) {
                    beta = score;
                    flag = 0; // EXACT
                }
                if (alpha >= beta) {
                    flag = -1; // UPPER
                    killerMoves[depth] = col; // record killer move
                    break;
                }
            }
        }

        // Store in transposition table, cap size
        if (transpositionTable.size >= TT_MAX_SIZE) {
            // Clear half the table to amortize cleanup cost
            const iter = transpositionTable.keys();
            const half = TT_MAX_SIZE >> 1;
            for (let i = 0; i < half; i++) {
                transpositionTable.delete(iter.next().value);
            }
        }
        transpositionTable.set(ttKey, { score: bestScore, depth, flag });

        return bestScore;
    }

    function aiBestMove() {
        const moves = orderedMoves(0);
        if (moves.length === 0) return -1;

        // First move: always play centre
        if (moveCount <= 1) return 3;

        // Check for immediate win
        for (const col of moves) {
            dropPiece(col, AI);
            if (lastMoveWins()) { undoPiece(col); return col; }
            undoPiece(col);
        }

        // Check for immediate block
        for (const col of moves) {
            dropPiece(col, PLAYER);
            if (lastMoveWins()) { undoPiece(col); return col; }
            undoPiece(col);
        }

        // True iterative deepening with time budget
        let bestCol = moves[0];
        const remaining = ROWS * COLS - moveCount;
        const maxDepth = Math.min(MAX_DEPTH, remaining);

        searchDeadline = Date.now() + TIME_BUDGET_MS;
        searchAborted = false;

        for (let depth = 2; depth <= maxDepth; depth += 2) {
            killerMoves = []; // reset killers each iteration
            let iterBest = moves[0];
            let iterScore = -Infinity;

            for (const col of moves) {
                dropPiece(col, AI);
                const score = minimax(depth - 1, -Infinity, Infinity, false);
                undoPiece(col);

                if (searchAborted) break;

                if (score > iterScore) {
                    iterScore = score;
                    iterBest = col;
                }

                // Found a winning move — play it immediately
                if (score >= 100000) {
                    return iterBest;
                }
            }

            // Only use this iteration's result if it completed fully
            if (!searchAborted) {
                bestCol = iterBest;
            }

            // Stop deepening if time is almost up
            if (Date.now() >= searchDeadline) break;
        }

        return bestCol;
    }

    /* ─── rendering ────────────────────────────────────────── */
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    let canvas, ctx;
    const CELL = 80;
    const RADIUS = 32;
    const HEADER_H = 80; // drop zone
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
        if (p === PLAYER) return '#ef4444'; // red
        if (p === AI) return '#facc15';     // yellow/gold
        return 'transparent';
    }

    function draw() {
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

        // Board background
        const grad = ctx.createLinearGradient(0, BOARD_Y, 0, BOARD_Y + BOARD_H);
        grad.addColorStop(0, '#1e3a8a');
        grad.addColorStop(1, '#1e40af');
        roundRect(ctx, 0, BOARD_Y, BOARD_W, BOARD_H, 16);
        ctx.fillStyle = grad;
        ctx.fill();

        // Cells
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const cx = c * CELL + CELL / 2;
                const cy = BOARD_Y + r * CELL + CELL / 2;

                // Hole shadow
                ctx.beginPath();
                ctx.arc(cx, cy + 2, RADIUS, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                ctx.fill();

                // Hole
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
                    // Glossy highlight
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

        // Hover indicator
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

        // Drop animation
        if (animating) {
            const cx = animCol * CELL + CELL / 2;
            const startY = HEADER_H / 2;
            const progress = animFrame / ANIM_FRAMES;
            const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
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

            // Let the UI repaint before the heavy computation
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

        // Touch support
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
    }

    function resetGame() {
        initBoard();
        setStatus('🔴 Your turn — click a column');
        draw();
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
