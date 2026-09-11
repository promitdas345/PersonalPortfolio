package connect4;

/**
 * Connect 4 position held as bitboards.
 *
 * <p>Layout: bit index {@code col * 7 + row}, row 0 is the bottom cell. Each column owns
 * 7 bits — 6 playable cells plus one sentinel bit that stops carries and shifted
 * alignments from leaking into the neighbouring column. The whole board therefore fits
 * in 49 bits of a single {@code long}.</p>
 *
 * <pre>
 *   .  .  .  .  .  .  .     sentinel row (bit 6 of each column)
 *   5 12 19 26 33 40 47
 *   4 11 18 25 32 39 46
 *   3 10 17 24 31 38 45
 *   2  9 16 23 30 37 44
 *   1  8 15 22 29 36 43
 *   0  7 14 21 28 35 42
 * </pre>
 *
 * <p>{@link #current()} always holds the stones of the player <em>to move</em>; playing a
 * move flips that perspective, which is what negamax wants.</p>
 */
public final class Board {

    public static final int ROWS = 6;
    public static final int COLS = 7;
    public static final int SIZE = ROWS * COLS;

    /** Cell states as seen from the outside (rendering, rules display). */
    public static final int EMPTY = 0;
    public static final int PLAYER_ONE = 1;
    public static final int PLAYER_TWO = 2;

    static final int H1 = ROWS + 1;  // 7 — one column
    static final int H2 = ROWS;      // 6 — diagonal "\"
    static final int H3 = ROWS + 2;  // 8 — diagonal "/"

    static final long BOTTOM_ROW = bottomRow();
    static final long BOARD_MASK = BOTTOM_ROW * ((1L << ROWS) - 1);

    private static long bottomRow() {
        long bits = 0L;
        for (int col = 0; col < COLS; col++) bits |= 1L << (col * H1);
        return bits;
    }

    private long current;                       // stones of the player to move
    private long mask;                          // every stone on the board
    private int moves;
    private final int[] history = new int[SIZE];

    public Board() { }

    private Board(long current, long mask, int moves) {
        this.current = current;
        this.mask = mask;
        this.moves = moves;
    }

    public Board copy() {
        Board b = new Board(current, mask, moves);
        System.arraycopy(history, 0, b.history, 0, moves);
        return b;
    }

    public void reset() {
        current = 0L;
        mask = 0L;
        moves = 0;
    }

    /* ── bit helpers ─────────────────────────────────────────────────── */

    static long bottomBit(int col) { return 1L << (col * H1); }
    static long topBit(int col)    { return 1L << (col * H1 + ROWS - 1); }
    static long columnMask(int col) { return ((1L << ROWS) - 1) << (col * H1); }

    /** Every cell a stone could land on right now, one bit per playable column. */
    static long playable(long mask) { return (mask + BOTTOM_ROW) & BOARD_MASK; }

    /**
     * Empty cells where {@code position} would complete four in a row — including cells
     * that are not reachable yet. Straight port of the classic four-direction trick.
     */
    static long winningSpots(long position, long mask) {
        // vertical
        long spots = (position << 1) & (position << 2) & (position << 3);

        // horizontal
        long pair = (position << H1) & (position << (2 * H1));
        spots |= pair & (position << (3 * H1));
        spots |= pair & (position >>> H1);
        pair = (position >>> H1) & (position >>> (2 * H1));
        spots |= pair & (position >>> (3 * H1));
        spots |= pair & (position << H1);

        // diagonal "\"
        pair = (position << H2) & (position << (2 * H2));
        spots |= pair & (position << (3 * H2));
        spots |= pair & (position >>> H2);
        pair = (position >>> H2) & (position >>> (2 * H2));
        spots |= pair & (position >>> (3 * H2));
        spots |= pair & (position << H2);

        // diagonal "/"
        pair = (position << H3) & (position << (2 * H3));
        spots |= pair & (position << (3 * H3));
        spots |= pair & (position >>> H3);
        pair = (position >>> H3) & (position >>> (2 * H3));
        spots |= pair & (position >>> (3 * H3));
        spots |= pair & (position << H3);

        return spots & (BOARD_MASK ^ mask);
    }

    static boolean hasFourInARow(long position) {
        int[] dirs = { 1, H1, H2, H3 };
        for (int dir : dirs) {
            long pair = position & (position >>> dir);
            if ((pair & (pair >>> (2 * dir))) != 0L) return true;
        }
        return false;
    }

    /* ── state ───────────────────────────────────────────────────────── */

    public long current() { return current; }
    public long mask()    { return mask; }
    public int moves()    { return moves; }

    /** Unique key for this position, used as the transposition table index. */
    public long key() { return current + mask + BOTTOM_ROW; }

    public boolean canPlay(int col) {
        return col >= 0 && col < COLS && (mask & topBit(col)) == 0L;
    }

    public boolean isFull() { return moves >= SIZE; }

    /** The bit a stone would occupy if dropped in {@code col}, or 0 when the column is full. */
    public long moveBit(int col) {
        if (!canPlay(col)) return 0L;
        return (mask + bottomBit(col)) & columnMask(col);
    }

    /** Row of the cell a stone would land on, counted from the top (0 = top row). */
    public int landingRow(int col) {
        long bit = moveBit(col);
        if (bit == 0L) return -1;
        int index = Long.numberOfTrailingZeros(bit) - col * H1;
        return ROWS - 1 - index;
    }

    public boolean isWinningMove(int col) {
        long bit = moveBit(col);
        return bit != 0L && hasFourInARow(current | bit);
    }

    public void play(int col) {
        if (!canPlay(col)) throw new IllegalArgumentException("column " + col + " is full");
        history[moves++] = col;
        current ^= mask;
        mask |= mask + bottomBit(col);
    }

    public void undo() {
        if (moves == 0) throw new IllegalStateException("nothing to undo");
        int col = history[--moves];
        mask ^= Long.highestOneBit(mask & columnMask(col));
        current ^= mask;
    }

    public int lastMove() { return moves == 0 ? -1 : history[moves - 1]; }

    public int[] moveList() {
        int[] out = new int[moves];
        System.arraycopy(history, 0, out, 0, moves);
        return out;
    }

    /* ── views for the UI ────────────────────────────────────────────── */

    /** Stones of the player who moved first. */
    public long firstPlayerStones()  { return (moves & 1) == 0 ? current : current ^ mask; }
    public long secondPlayerStones() { return mask ^ firstPlayerStones(); }

    /** {@code 1} when the first player is to move, {@code 2} otherwise. */
    public int sideToMove() { return (moves & 1) == 0 ? PLAYER_ONE : PLAYER_TWO; }

    /** {@link #EMPTY}, {@link #PLAYER_ONE} or {@link #PLAYER_TWO}; row 0 is the top row. */
    public int cellAt(int row, int col) {
        long bit = 1L << (col * H1 + (ROWS - 1 - row));
        if ((mask & bit) == 0L) return EMPTY;
        return (firstPlayerStones() & bit) != 0L ? PLAYER_ONE : PLAYER_TWO;
    }

    /** {@code true} when the player who just moved has four in a row. */
    public boolean lastMoveWon() {
        return moves > 0 && hasFourInARow(current ^ mask);
    }

    /**
     * The four cells of the winning line as {@code {row, col}} pairs, or {@code null}
     * when the last move did not win.
     */
    public int[][] winningLine() {
        if (!lastMoveWon()) return null;
        long winner = current ^ mask;
        int[][] dirs = { { 0, 1 }, { 1, 0 }, { 1, 1 }, { 1, -1 } };
        for (int row = 0; row < ROWS; row++) {
            for (int col = 0; col < COLS; col++) {
                if (!isSet(winner, row, col)) continue;
                for (int[] dir : dirs) {
                    int length = 1;
                    while (length < 4) {
                        int r = row + dir[0] * length;
                        int c = col + dir[1] * length;
                        if (r < 0 || r >= ROWS || c < 0 || c >= COLS || !isSet(winner, r, c)) break;
                        length++;
                    }
                    if (length < 4) continue;
                    int[][] cells = new int[4][];
                    for (int i = 0; i < 4; i++) cells[i] = new int[] { row + dir[0] * i, col + dir[1] * i };
                    return cells;
                }
            }
        }
        return null;
    }

    private static boolean isSet(long stones, int row, int col) {
        return (stones & (1L << (col * H1 + (ROWS - 1 - row)))) != 0L;
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        for (int row = 0; row < ROWS; row++) {
            for (int col = 0; col < COLS; col++) {
                sb.append(switch (cellAt(row, col)) {
                    case PLAYER_ONE -> 'X';
                    case PLAYER_TWO -> 'O';
                    default -> '.';
                });
                sb.append(col == COLS - 1 ? '\n' : ' ');
            }
        }
        return sb.toString();
    }

    /** Replays a move string such as {@code "4453"} (1-based columns) onto a fresh board. */
    public static Board fromMoves(String columns) {
        Board board = new Board();
        for (int i = 0; i < columns.length(); i++) {
            board.play(columns.charAt(i) - '1');
        }
        return board;
    }
}
