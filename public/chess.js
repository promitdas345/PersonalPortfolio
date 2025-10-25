// Lightweight UI wrapper around the chess.js rules engine.
// Provides local play, a simple bot, hints, and move history logging.

(function () {
  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];
  const PIECE_GLYPHS = {
    w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
    b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
  };
  const PIECE_NAMES = {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
  };
  const BOT_PRESETS = {
    'bot-easy': { skill: 4, movetime: 450 },
    'bot-medium': { skill: 10, movetime: 900 },
  };

  document.addEventListener('DOMContentLoaded', () => {
    const boardEl = document.getElementById('chessBoard');
    if (!boardEl) return;

    if (typeof Chess === 'undefined') {
      boardEl.textContent = 'Unable to load chess engine. Please refresh.';
      return;
    }

    const ui = {
      board: boardEl,
      turn: document.getElementById('chessTurn'),
      status: document.getElementById('chessStatus'),
      history: document.getElementById('chessHistory'),
      newGame: document.getElementById('chessNewGame'),
      undo: document.getElementById('chessUndo'),
      flip: document.getElementById('chessFlip'),
      hint: document.getElementById('chessHint'),
      mode: document.getElementById('chessMode'),
    };

    const game = new Chess();
    const state = {
      selectedSquare: null,
      legalMoves: [],
      legalTargets: new Set(),
      lastMove: null,
      flipped: false,
      botThinking: false,
      hintMove: null,
      mode: ui.mode ? ui.mode.value : 'bot-easy',
      engineStatus: 'loading',
      engineMessage: 'Downloading Stockfish engine…',
      engine: null,
      botJobId: 0,
      hintJobId: 0,
    };

    const engine = createStockfishEngine(status => {
      state.engineStatus = status.state;
      state.engineMessage = status.message || state.engineMessage;
      updateStatus();
    });

    if (engine) {
      state.engine = engine;
      window.addEventListener('beforeunload', () => engine.terminate());
    } else {
      state.engineStatus = 'error';
      state.engineMessage = 'Stockfish requires Web Worker support.';
    }

    function startNewGame() {
      cancelBotJob();
      state.hintJobId += 1;
      game.reset();
      state.selectedSquare = null;
      state.legalMoves = [];
      state.legalTargets = new Set();
      state.lastMove = null;
      state.hintMove = null;
      renderBoard();
      updateHistory();
      updateStatus();
    }

    function cancelBotJob() {
      state.botJobId += 1;
      state.botThinking = false;
      if (state.engine && typeof state.engine.stop === 'function') {
        state.engine.stop();
      }
    }

    function renderBoard() {
      const rankOrder = state.flipped ? [...RANKS].reverse() : [...RANKS];
      const fileOrder = state.flipped ? [...FILES].reverse() : [...FILES];
      const checkedSquare = getCheckedKingSquare();
      ui.board.innerHTML = '';

      const canInteract = !state.botThinking && !(state.mode !== 'human' && game.turn() === 'b');

      rankOrder.forEach((rank, rankIdx) => {
        fileOrder.forEach((file, fileIdx) => {
          const square = `${file}${rank}`;
          const piece = game.get(square);
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'chess-square';
          button.dataset.square = square;
          button.setAttribute('aria-label', buildAriaLabel(square, piece));
          button.tabIndex = 0;

          if ((rankIdx + fileIdx) % 2 === 1) {
            button.classList.add('is-dark');
          }
          if (state.lastMove && (square === state.lastMove.from || square === state.lastMove.to)) {
            button.classList.add('is-last-move');
          }
          if (state.selectedSquare === square) {
            button.classList.add('is-selected');
          }
          if (state.legalTargets.has(square)) {
            button.classList.add('is-legal-target');
          }
          if (state.hintMove && (square === state.hintMove.from || square === state.hintMove.to)) {
            button.classList.add('is-hint');
          }
          if (checkedSquare === square) {
            button.classList.add('is-checked');
          }

          if (piece) {
            button.textContent = PIECE_GLYPHS[piece.color][piece.type];
          }

          if (canInteract) {
            button.addEventListener('click', () => handleSquareClick(square));
          } else {
            button.disabled = true;
          }

          ui.board.appendChild(button);
        });
      });
    }

    function handleSquareClick(square) {
      if (state.botThinking) return;
      if (state.mode !== 'human' && game.turn() === 'b') return;

      const piece = game.get(square);
      const isSelected = state.selectedSquare === square;

      if (isSelected) {
        clearSelection();
        renderBoard();
        return;
      }

      const targetMove = state.legalMoves.find(move => move.to === square);
      if (state.selectedSquare && targetMove) {
        attemptMove(targetMove);
        return;
      }

      if (piece && piece.color === game.turn()) {
        state.selectedSquare = square;
        state.legalMoves = game.moves({ square, verbose: true });
        state.legalTargets = new Set(state.legalMoves.map(move => move.to));
        state.hintMove = null;
      } else {
        clearSelection();
      }
      renderBoard();
    }

    function clearSelection() {
      state.selectedSquare = null;
      state.legalMoves = [];
      state.legalTargets = new Set();
    }

    function attemptMove(move) {
      cancelBotJob();
      const promotion =
        move.promotion ||
        (move.piece === 'p' && (move.to.endsWith('8') || move.to.endsWith('1')) ? 'q' : undefined);
      const executed = game.move({
        from: move.from,
        to: move.to,
        promotion: promotion || 'q',
      });
      if (!executed) return;

      state.lastMove = { from: executed.from, to: executed.to };
      clearSelection();
      state.hintMove = null;
      renderBoard();
      updateHistory();
      updateStatus();
      maybeScheduleBot();
    }

    async function maybeScheduleBot() {
      if (state.mode === 'human') return;
      if (game.game_over()) return;
      if (game.turn() !== 'b') return;
      if (!state.engine) {
        state.engineMessage = 'Stockfish is unavailable in this browser.';
        updateStatus();
        return;
      }
      if (state.engineStatus !== 'ready') {
        state.engineMessage = 'Stockfish is still loading…';
        updateStatus();
        return;
      }

      const jobId = ++state.botJobId;
      state.botThinking = true;
      state.hintMove = null;
      updateStatus();

      const preset = BOT_PRESETS[state.mode] || BOT_PRESETS['bot-medium'];
      if (preset && state.engine.setSkill) {
        state.engine.setSkill(preset.skill);
      }

      try {
        const moveStr = await state.engine.getBestMove(game.fen(), { movetime: preset.movetime });
        if (jobId !== state.botJobId) return;
        if (moveStr) {
          const executed = applyEngineMove(moveStr);
          if (executed) {
            state.lastMove = { from: executed.from, to: executed.to };
          }
        }
      } catch (err) {
        state.engineStatus = 'error';
        state.engineMessage =
          'Stockfish error: ' + (err && err.message ? err.message : 'unable to evaluate position.');
      } finally {
        if (jobId === state.botJobId) {
          state.botThinking = false;
          clearSelection();
          renderBoard();
          updateHistory();
          updateStatus();
        }
      }
    }

    function applyEngineMove(notation) {
      if (!notation || notation === '(none)') return null;
      const from = notation.slice(0, 2);
      const to = notation.slice(2, 4);
      const promotion = notation.length > 4 ? notation.slice(4, 5) : undefined;
      return game.move({ from, to, promotion });
    }

    function updateStatus() {
      if (!ui.turn || !ui.status) return;
      const turnColor = game.turn() === 'w' ? 'White' : 'Black';
      ui.turn.textContent = `${turnColor} to move`;

      if (state.botThinking) {
        ui.status.textContent = 'Bot is thinking...';
        return;
      }

      if (game.in_checkmate()) {
        const winner = game.turn() === 'w' ? 'Black' : 'White';
        ui.status.textContent = `Checkmate! ${winner} wins.`;
      } else if (game.in_stalemate()) {
        ui.status.textContent = 'Stalemate. Neither side can move.';
      } else if (game.in_draw()) {
        ui.status.textContent = 'Drawn position.';
      } else if (game.in_check()) {
        ui.status.textContent = `${turnColor} is in check!`;
      } else {
        ui.status.textContent = 'Select a piece to highlight its legal moves.';
      }
    }

    function updateHistory() {
      if (!ui.history) return;
      const moves = game.history({ verbose: true });
      if (!moves.length) {
        ui.history.innerHTML = '<li class="chess-history-empty">No moves yet.</li>';
        return;
      }
      const rows = [];
      for (let i = 0; i < moves.length; i += 2) {
        const moveNumber = Math.floor(i / 2) + 1;
        const white = moves[i] ? moves[i].san : '';
        const black = moves[i + 1] ? moves[i + 1].san : '';
        rows.push(
          `<li><span class="chess-move-index">${moveNumber}.</span><span>${white || '—'}</span><span>${
            black || '—'
          }</span></li>`
        );
      }
      ui.history.innerHTML = rows.join('');
    }

    function getCheckedKingSquare() {
      if (!game.in_check()) return null;
      const targetColor = game.turn();
      const board = game.board();
      for (let rankIdx = 0; rankIdx < board.length; rankIdx += 1) {
        for (let fileIdx = 0; fileIdx < board[rankIdx].length; fileIdx += 1) {
          const piece = board[rankIdx][fileIdx];
          if (piece && piece.type === 'k' && piece.color === targetColor) {
            const file = FILES[fileIdx];
            const rank = 8 - rankIdx;
            return `${file}${rank}`;
          }
        }
      }
      return null;
    }

    function buildAriaLabel(square, piece) {
      if (!piece) return `Empty square ${square}`;
      const color = piece.color === 'w' ? 'white' : 'black';
      const name = PIECE_NAMES[piece.type] || 'piece';
      return `${color} ${name} on ${square}`;
    }

    function undoMove() {
      cancelBotJob();
      const moves = game.history({ verbose: true });
      if (!moves.length) return;
      const lastMoveColor = moves[moves.length - 1].color;
      game.undo();
      if (state.mode !== 'human' && lastMoveColor === 'b') {
        const remaining = game.history({ verbose: true });
        if (remaining.length) {
          game.undo();
        }
      }
      state.lastMove = null;
      state.hintMove = null;
      clearSelection();
      renderBoard();
      updateHistory();
      updateStatus();
    }

    function flipBoard() {
      state.flipped = !state.flipped;
      renderBoard();
    }

    async function provideHint() {
      if (game.game_over()) return;
      if (!state.engine) {
        state.engineMessage = 'Stockfish is unavailable for hints.';
        updateStatus();
        return;
      }
      if (state.engineStatus !== 'ready') {
        state.engineMessage = 'Stockfish is still loading…';
        updateStatus();
        return;
      }
      const jobId = ++state.hintJobId;
      state.hintMove = null;
      if (ui.status) {
        ui.status.textContent = 'Generating hint…';
      }
      try {
        const moveStr = await state.engine.getBestMove(game.fen(), { movetime: 300 });
        if (jobId !== state.hintJobId) return;
        if (!moveStr) return;
        state.hintMove = { from: moveStr.slice(0, 2), to: moveStr.slice(2, 4) };
        renderBoard();
      } catch (err) {
        state.engineMessage = err && err.message ? err.message : 'Unable to compute hint.';
      } finally {
        updateStatus();
      }
    }

    if (ui.newGame) {
      ui.newGame.addEventListener('click', startNewGame);
    }
    if (ui.undo) {
      ui.undo.addEventListener('click', undoMove);
    }
    if (ui.flip) {
      ui.flip.addEventListener('click', flipBoard);
    }
    if (ui.hint) {
      ui.hint.addEventListener('click', provideHint);
    }
    if (ui.mode) {
      ui.mode.addEventListener('change', evt => {
        state.mode = evt.target.value;
        startNewGame();
      });
    }

    startNewGame();
  });
})();
