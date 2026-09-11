package connect4;

import java.util.Random;

/**
 * Connect 4 search: negamax with alpha-beta, iterative deepening, a transposition
 * table, killer/history move ordering and a threat-based evaluation.
 *
 * <p>Scores are from the point of view of the side to move. A forced win is
 * {@code WIN_BASE - moveCount}, so winning sooner scores higher and losing later scores
 * higher; heuristic scores are clamped well inside that band so the two never collide.</p>
 */
public final class Engine {

    /** A decided game is worth this much, minus the move number it is decided on. */
    static final int WIN_BASE = 20_000;
    /** Anything above this magnitude is a proven win or loss rather than a guess. */
    public static final int MATE_THRESHOLD = 10_000;

    private static final int INFINITY = 30_000;
    private static final int EVAL_CAP = 4_000;
    private static final int MAX_PLY = 64;

    /** Centre-out column order; the centre column is worth the most tempo. */
    private static final int[] COLUMN_ORDER = { 3, 2, 4, 1, 5, 0, 6 };
    private static final int[] COLUMN_BONUS = { 0, 10, 20, 30, 20, 10, 0 };

    private static final long ODD_ROWS = (Board.BOTTOM_ROW) | (Board.BOTTOM_ROW << 2) | (Board.BOTTOM_ROW << 4);
    private static final long EVEN_ROWS = Board.BOARD_MASK ^ ODD_ROWS;

    /** How long and how deep one search may go, and how often it is allowed to look away. */
    public record Limits(int maxDepth, int timeBudgetMillis, double blunderChance) {
        public Limits {
            if (maxDepth < 1) throw new IllegalArgumentException("maxDepth must be at least 1");
            if (timeBudgetMillis < 1) throw new IllegalArgumentException("timeBudgetMillis must be at least 1");
        }
    }

    /** Outcome of one search. */
    public record Result(int column, int score, int depth, long nodes, long millis, int movesPlayed) {

        public boolean isProven() { return Math.abs(score) >= MATE_THRESHOLD; }

        /** Plies from now until the forced result, or {@code -1} when the score is heuristic. */
        public int movesToEnd() { return isProven() ? WIN_BASE - Math.abs(score) - movesPlayed : -1; }

        public String scoreText() {
            if (!isProven()) return String.format("eval %+d", score);
            return score > 0 ? "win in " + movesToEnd() : "loss in " + movesToEnd();
        }

        public String statsText() {
            double seconds = Math.max(millis, 1) / 1000.0;
            return String.format("depth %d · %,d nodes · %.2fs · %,.0f n/s · %s",
                    depth, nodes, seconds, nodes / seconds, scoreText());
        }
    }

    private final TranspositionTable table;
    private final Random random;
    private final int[][] killers = new int[MAX_PLY][2];
    private final int[] history = new int[Board.COLS];

    private long deadline;
    private long nodes;
    private boolean aborted;
    private volatile boolean cancelled;

    public Engine() { this(22, new Random()); }

    public Engine(int tableBits, Random random) {
        this.table = new TranspositionTable(tableBits);
        this.random = random;
    }

    /** Drops everything learned about the previous game. */
    public synchronized void newGame() {
        table.clear();
        for (int[] pair : killers) { pair[0] = -1; pair[1] = -1; }
        java.util.Arrays.fill(history, 0);
        cancelled = false;
    }

    /** Asks an in-flight search to stop as soon as it notices. */
    public void cancel() { cancelled = true; }

    public int tableCapacity() { return table.capacity(); }

    /* ── root search ─────────────────────────────────────────────────── */

    public Result search(Board position, Difficulty difficulty) {
        return search(position, difficulty.limits());
    }

    public synchronized Result search(Board position, Limits limits) {
        long started = System.nanoTime();
        Board board = position.copy();
        nodes = 0;
        aborted = false;
        cancelled = false;
        for (int[] pair : killers) { pair[0] = -1; pair[1] = -1; }

        int[] legal = legalColumns(board);
        if (legal.length == 0) throw new IllegalStateException("no legal move — the board is full");

        // Weaker levels are allowed to simply not see the position.
        if (limits.blunderChance() > 0 && random.nextDouble() < limits.blunderChance()) {
            int column = legal[random.nextInt(legal.length)];
            return new Result(column, 0, 0, 0, elapsedMillis(started), board.moves());
        }

        // Opening book of exactly one move.
        if (board.moves() == 0) return new Result(3, 0, 0, 0, elapsedMillis(started), 0);

        // Take a win, then stop a loss — no search can improve on either.
        for (int column : COLUMN_ORDER) {
            if (board.canPlay(column) && board.isWinningMove(column)) {
                return new Result(column, WIN_BASE - (board.moves() + 1), 1, 0, elapsedMillis(started), board.moves());
            }
        }
        // One threat has exactly one answer. Two threats are lost, so let the search run and
        // report the loss honestly instead of blocking at random and claiming an even game.
        long opponentWins = Board.winningSpots(board.current() ^ board.mask(), board.mask());
        long threats = opponentWins & Board.playable(board.mask());
        if (Long.bitCount(threats) == 1) {
            for (int column : COLUMN_ORDER) {
                long bit = board.moveBit(column);
                if (bit != 0L && (bit & threats) != 0L) {
                    return new Result(column, 0, 1, 0, elapsedMillis(started), board.moves());
                }
            }
        }

        deadline = System.nanoTime() + limits.timeBudgetMillis() * 1_000_000L;
        int maxDepth = Math.min(limits.maxDepth(), Board.SIZE - board.moves());

        int bestColumn = legal[0];
        int bestScore = 0;
        int reachedDepth = 0;

        for (int depth = 1; depth <= maxDepth; depth++) {
            int alpha = -INFINITY;
            int iterationColumn = -1;
            int iterationScore = -INFINITY;

            for (int column : rootOrder(legal, bestColumn)) {
                board.play(column);
                int score = -negamax(board, -INFINITY, -alpha, depth - 1, 1);
                board.undo();
                if (aborted) break;

                if (score > iterationScore) {
                    iterationScore = score;
                    iterationColumn = column;
                }
                if (score > alpha) alpha = score;
            }

            if (aborted || iterationColumn < 0) break;

            bestColumn = iterationColumn;
            bestScore = iterationScore;
            reachedDepth = depth;

            // A proven result cannot be improved by looking further.
            if (Math.abs(bestScore) >= MATE_THRESHOLD) break;
            if (System.nanoTime() >= deadline) break;
        }

        return new Result(bestColumn, bestScore, reachedDepth, nodes, elapsedMillis(started), board.moves());
    }

    /** Convenience wrapper for callers that only want the column. */
    public int bestMove(Board position, Difficulty difficulty) {
        return search(position, difficulty).column();
    }

    private static long elapsedMillis(long startedNanos) {
        return (System.nanoTime() - startedNanos) / 1_000_000L;
    }

    private static int[] legalColumns(Board board) {
        int[] columns = new int[Board.COLS];
        int count = 0;
        for (int column : COLUMN_ORDER) {
            if (board.canPlay(column)) columns[count++] = column;
        }
        return java.util.Arrays.copyOf(columns, count);
    }

    private static int[] rootOrder(int[] legal, int first) {
        int[] ordered = new int[legal.length];
        int at = 0;
        for (int column : legal) {
            if (column == first) ordered[at++] = column;
        }
        for (int column : legal) {
            if (column != first) ordered[at++] = column;
        }
        return ordered;
    }

    /* ── negamax ─────────────────────────────────────────────────────── */

    private int negamax(Board board, int alpha, int beta, int depth, int ply) {
        nodes++;
        if ((nodes & 1023) == 0 && (cancelled || System.nanoTime() >= deadline)) {
            aborted = true;
            return 0;
        }

        if (board.isFull()) return 0;

        long current = board.current();
        long mask = board.mask();
        long playable = Board.playable(mask);
        int moveCount = board.moves();

        // Win on this move.
        if ((Board.winningSpots(current, mask) & playable) != 0L) return WIN_BASE - (moveCount + 1);

        // Moves that do not hand the opponent an immediate win.
        long opponentWins = Board.winningSpots(current ^ mask, mask);
        long candidates = playable;
        long forced = playable & opponentWins;
        if (forced != 0L) {
            if ((forced & (forced - 1)) != 0L) return -(WIN_BASE - (moveCount + 2)); // two threats, unstoppable
            candidates = forced;
        }
        candidates &= ~(opponentWins >>> 1);
        if (candidates == 0L) return -(WIN_BASE - (moveCount + 2));

        // The earliest win left is two plies away; the earliest loss three.
        int ceiling = WIN_BASE - (moveCount + 3);
        if (beta > ceiling) {
            beta = ceiling;
            if (alpha >= beta) return beta;
        }
        int floor = -(WIN_BASE - (moveCount + 4));
        if (alpha < floor) {
            alpha = floor;
            if (alpha >= beta) return alpha;
        }

        long key = board.key();
        int entry = table.probe(key);
        int tableColumn = -1;
        if (entry != TranspositionTable.MISS) {
            tableColumn = TranspositionTable.column(entry);
            if (TranspositionTable.depth(entry) >= depth) {
                int score = TranspositionTable.score(entry);
                switch (TranspositionTable.flag(entry)) {
                    case TranspositionTable.EXACT -> { return score; }
                    case TranspositionTable.LOWER -> { if (score > alpha) alpha = score; }
                    case TranspositionTable.UPPER -> { if (score < beta) beta = score; }
                    default -> { }
                }
                if (alpha >= beta) return score;
            }
        }

        if (depth <= 0) return evaluate(board);

        int originalAlpha = alpha;
        int best = -INFINITY;
        int bestColumn = -1;

        int[] moves = orderMoves(board, candidates, tableColumn, ply);
        for (int i = 0; i < moves.length; i++) {
            int column = moves[i] & 0xF;
            board.play(column);
            int score = -negamax(board, -beta, -alpha, depth - 1, ply + 1);
            board.undo();
            if (aborted) return 0;

            if (score > best) {
                best = score;
                bestColumn = column;
            }
            if (score > alpha) alpha = score;
            if (alpha >= beta) {
                rememberKiller(ply, column);
                history[column] += depth * depth;
                break;
            }
        }

        int flag = best <= originalAlpha ? TranspositionTable.UPPER
                 : best >= beta ? TranspositionTable.LOWER
                 : TranspositionTable.EXACT;
        table.store(key, best, depth, flag, bestColumn);
        return best;
    }

    private void rememberKiller(int ply, int column) {
        if (ply >= MAX_PLY || killers[ply][0] == column) return;
        killers[ply][1] = killers[ply][0];
        killers[ply][0] = column;
    }

    /**
     * Candidate columns sorted best-first, packed as {@code score << 4 | column} so the
     * sort needs no allocation beyond the array itself.
     */
    private int[] orderMoves(Board board, long candidates, int tableColumn, int ply) {
        int[] scored = new int[Board.COLS];
        int count = 0;
        long mask = board.mask();
        long current = board.current();

        for (int column : COLUMN_ORDER) {
            long bit = board.moveBit(column);
            if (bit == 0L || (bit & candidates) == 0L) continue;

            int score = COLUMN_BONUS[column] + Math.min(history[column], 400);
            long nextMask = mask | bit;
            score += 100 * Long.bitCount(Board.winningSpots(current | bit, nextMask) & Board.playable(nextMask));
            if (column == tableColumn) score += 100_000;
            if (ply < MAX_PLY) {
                if (column == killers[ply][0]) score += 8_000;
                else if (column == killers[ply][1]) score += 4_000;
            }
            scored[count++] = (score << 4) | column;
        }

        int[] moves = java.util.Arrays.copyOf(scored, count);
        for (int i = 1; i < count; i++) {                       // insertion sort, descending
            int value = moves[i];
            int j = i - 1;
            while (j >= 0 && moves[j] < value) {
                moves[j + 1] = moves[j];
                j--;
            }
            moves[j + 1] = value;
        }
        return moves;
    }

    /* ── evaluation ──────────────────────────────────────────────────── */

    /**
     * Heuristic score for the side to move. Counts threats — squares that would complete
     * a four — weighting the immediately reachable ones heavily, then adds centre control
     * and the odd/even row parity that decides most endgames.
     */
    private static int evaluate(Board board) {
        long mask = board.mask();
        long me = board.current();
        long opponent = me ^ mask;
        long playable = Board.playable(mask);

        long myThreats = Board.winningSpots(me, mask);
        long theirThreats = Board.winningSpots(opponent, mask);

        int score = 60 * (Long.bitCount(myThreats & playable) - Long.bitCount(theirThreats & playable));
        score += 12 * (Long.bitCount(myThreats) - Long.bitCount(theirThreats));
        score += 6 * (centreControl(me) - centreControl(opponent));

        // The player who moved first profits from odd rows, the second player from even ones.
        boolean movingFirstPlayer = board.sideToMove() == Board.PLAYER_ONE;
        long myRows = movingFirstPlayer ? ODD_ROWS : EVEN_ROWS;
        long theirRows = movingFirstPlayer ? EVEN_ROWS : ODD_ROWS;
        score += 15 * (Long.bitCount(myThreats & myRows) - Long.bitCount(theirThreats & theirRows));

        return Math.max(-EVAL_CAP, Math.min(EVAL_CAP, score));
    }

    private static int centreControl(long stones) {
        return 3 * Long.bitCount(stones & Board.columnMask(3))
             + 2 * Long.bitCount(stones & (Board.columnMask(2) | Board.columnMask(4)))
             + Long.bitCount(stones & (Board.columnMask(1) | Board.columnMask(5)));
    }
}
