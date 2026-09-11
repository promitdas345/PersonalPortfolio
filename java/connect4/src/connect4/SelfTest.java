package connect4;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Dependency-free checks for the board representation and the search.
 *
 * <p>Run with {@code java -jar connect4.jar --selftest}. Exits non-zero on failure so it
 * can sit in a build script.</p>
 *
 * <p>Move strings use 1-based columns and alternate players, so {@code "1122334"} is
 * player one winning along the bottom row.</p>
 */
public final class SelfTest {

    private static final Engine.Limits FAST = new Engine.Limits(8, 400, 0);
    private static final Engine.Limits DEEP = new Engine.Limits(Board.SIZE, 4_000, 0);

    private static final List<String> failures = new ArrayList<>();
    private static int checks;

    private SelfTest() { }

    public static void main(String[] args) {
        long started = System.nanoTime();

        bitLayout();
        playUndoIsReversible();
        winDetection();
        theSentinelRowStopsWrapAround();
        winningLineIsReported();
        takesTheWin();
        blocksTheThreat();
        seesAForcedWin();
        seesAForcedLoss();
        neverHandsOverAnImmediateWin();
        neverReturnsAnIllegalColumn();
        beatsRandomPlay();

        long millis = (System.nanoTime() - started) / 1_000_000L;
        System.out.println();
        if (failures.isEmpty()) {
            System.out.printf("%d checks passed in %,d ms%n", checks, millis);
        } else {
            System.out.printf("%d of %d checks FAILED in %,d ms%n", failures.size(), checks, millis);
            failures.forEach(failure -> System.out.println("  - " + failure));
            System.exit(1);
        }
    }

    /* ── board representation ────────────────────────────────────────── */

    private static void bitLayout() {
        Board board = new Board();
        board.play(3);
        check("the first stone lands on the bottom row", board.cellAt(Board.ROWS - 1, 3) == Board.PLAYER_ONE);
        check("the cell above it stays empty", board.cellAt(Board.ROWS - 2, 3) == Board.EMPTY);
        check("the second player is now to move", board.sideToMove() == Board.PLAYER_TWO);

        board.play(3);
        check("the second stone stacks on top", board.cellAt(Board.ROWS - 2, 3) == Board.PLAYER_TWO);
        check("landingRow points at the next free cell", board.landingRow(3) == Board.ROWS - 3);

        Board full = new Board();
        for (int i = 0; i < Board.ROWS; i++) full.play(0);
        check("six stones fill a column", !full.canPlay(0));
        check("a full column leaves its neighbour alone", full.canPlay(1));
        check("a full column reports no landing row", full.landingRow(0) == -1);
    }

    private static void playUndoIsReversible() {
        Random random = new Random(12345);
        boolean allMatched = true;
        for (int game = 0; game < 200; game++) {
            Board board = new Board();
            List<Long> keys = new ArrayList<>();
            for (int ply = 0; ply < 20 && !board.isFull(); ply++) {
                int column = randomPlayableColumn(board, random);
                if (board.isWinningMove(column)) break;
                keys.add(board.key());
                board.play(column);
            }
            for (int ply = board.moves() - 1; ply >= 0; ply--) {
                board.undo();
                if (board.key() != keys.get(ply)) allMatched = false;
            }
            allMatched &= board.moves() == 0 && board.key() == Board.BOTTOM_ROW;
        }
        check("undo walks every position back to its exact key", allMatched);
    }

    private static void winDetection() {
        check("four stacked stones win", wins("1212121"));
        check("four along the bottom row win", wins("1122334"));
        check("a rising diagonal wins", wins("12234334744"));
        check("three in a row is not a win", !wins("121212"));
        check("an empty board is not a win", !new Board().lastMoveWon());
    }

    private static void theSentinelRowStopsWrapAround() {
        // Bits 4 and 5 are the top of column 0; bits 7 and 8 are the bottom of column 1.
        // Only the unused sentinel at bit 6 keeps those four from looking like a column.
        long split = (1L << 4) | (1L << 5) | (1L << 7) | (1L << 8);
        check("stones either side of a column break never win", !Board.hasFourInARow(split));

        long stacked = (1L << 0) | (1L << 1) | (1L << 2) | (1L << 3);
        check("four inside one column do win", Board.hasFourInARow(stacked));

        long edge = (1L << (6 * Board.H1)) | (1L << (6 * Board.H1 + 1)) | (1L << (6 * Board.H1 + 2));
        check("threats never land outside the board", (Board.winningSpots(edge, edge) & ~Board.BOARD_MASK) == 0L);
    }

    private static void winningLineIsReported() {
        Board board = Board.fromMoves("1122334");
        int[][] line = board.winningLine();
        check("a win reports four cells", line != null && line.length == 4);
        if (line != null) {
            boolean sameRow = true;
            for (int[] cell : line) sameRow &= cell[0] == line[0][0];
            check("a horizontal win reports a single row", sameRow);
        }
        check("an unfinished game reports no line", Board.fromMoves("112233").winningLine() == null);
    }

    /* ── search ──────────────────────────────────────────────────────── */

    private static void takesTheWin() {
        // Player one holds the bottom of columns 1-3 and is to move.
        Board board = Board.fromMoves("172637");
        check("player one is to move", board.sideToMove() == Board.PLAYER_ONE);
        Engine.Result result = new Engine().search(board, FAST);
        check("the engine completes the four", result.column() == 3);
        check("and calls it a win in one", result.isProven() && result.movesToEnd() == 1);
    }

    private static void blocksTheThreat() {
        // Same three stones, player two to move and nothing of its own to play for.
        Board board = Board.fromMoves("17263");
        check("player two is to move", board.sideToMove() == Board.PLAYER_TWO);
        check("the engine blocks the open three", new Engine().search(board, FAST).column() == 3);
    }

    private static void seesAForcedWin() {
        // Bottom row: player one on columns 3-5 with column 6 free — one move from four.
        Board board = Board.fromMoves("314152");
        Engine.Result result = new Engine().search(board, DEEP);
        check("a won position scores as won", result.isProven() && result.score() > 0);
        check("the win is one move away", result.movesToEnd() == 1);
    }

    private static void seesAForcedLoss() {
        // Player one has an open three with both ends free; player two can only block one.
        Board board = Board.fromMoves("31415");
        Engine.Result result = new Engine().search(board, DEEP);
        check("a double threat is scored as lost", result.isProven() && result.score() < 0);
        check("the loss is two moves away", result.movesToEnd() == 2);
        check("it still returns a playable column", board.canPlay(result.column()));
    }

    private static void neverHandsOverAnImmediateWin() {
        Engine engine = new Engine();
        Random random = new Random(7);
        int tested = 0;
        int safe = 0;
        for (int attempt = 0; attempt < 400 && tested < 15; attempt++) {
            Board board = randomPosition(random, 6 + random.nextInt(14));
            if (board == null || !hasSafeMove(board)) continue;
            tested++;
            if (isSafe(board, engine.search(board, FAST).column())) safe++;
        }
        check("the engine never gives away a win when it has a choice (" + safe + "/" + tested + ")",
                tested > 0 && safe == tested);
    }

    private static void neverReturnsAnIllegalColumn() {
        Engine engine = new Engine();
        Random random = new Random(99);
        boolean allLegal = true;
        int tested = 0;
        for (int attempt = 0; attempt < 200 && tested < 25; attempt++) {
            Board board = randomPosition(random, random.nextInt(38));
            if (board == null) continue;
            tested++;
            allLegal &= board.canPlay(engine.search(board, FAST).column());
        }
        check("every chosen column is playable (" + tested + " positions)", tested > 0 && allLegal);
    }

    private static void beatsRandomPlay() {
        Engine engine = new Engine();
        Random random = new Random(2024);
        int games = 6;
        int wins = 0;

        for (int game = 0; game < games; game++) {
            engine.newGame();
            Board board = new Board();
            boolean engineIsFirst = game % 2 == 0;
            boolean engineWon = false;

            while (!board.isFull()) {
                boolean engineToMove = (board.sideToMove() == Board.PLAYER_ONE) == engineIsFirst;
                int column = engineToMove
                        ? engine.search(board, FAST).column()
                        : randomPlayableColumn(board, random);
                boolean winning = board.isWinningMove(column);
                board.play(column);
                if (winning) {
                    engineWon = engineToMove;
                    break;
                }
            }
            if (engineWon) wins++;
        }
        check("the engine wins every game against random play (" + wins + "/" + games + ")", wins == games);
    }

    /* ── helpers ─────────────────────────────────────────────────────── */

    private static boolean wins(String moves) {
        return Board.fromMoves(moves).lastMoveWon();
    }

    private static int randomPlayableColumn(Board board, Random random) {
        int column;
        do {
            column = random.nextInt(Board.COLS);
        } while (!board.canPlay(column));
        return column;
    }

    /** A live position after {@code plies} random moves, or {@code null} if the game ended. */
    private static Board randomPosition(Random random, int plies) {
        Board board = new Board();
        for (int ply = 0; ply < plies; ply++) {
            if (board.isFull()) return null;
            int column = randomPlayableColumn(board, random);
            if (board.isWinningMove(column)) return null;
            board.play(column);
        }
        return board.isFull() ? null : board;
    }

    /** {@code true} when playing {@code column} does not let the opponent win straight back. */
    private static boolean isSafe(Board board, int column) {
        if (!board.canPlay(column)) return false;
        if (board.isWinningMove(column)) return true;
        Board after = board.copy();
        after.play(column);
        for (int reply = 0; reply < Board.COLS; reply++) {
            if (after.canPlay(reply) && after.isWinningMove(reply)) return false;
        }
        return true;
    }

    private static boolean hasSafeMove(Board board) {
        for (int column = 0; column < Board.COLS; column++) {
            if (board.canPlay(column) && isSafe(board, column)) return true;
        }
        return false;
    }

    private static void check(String description, boolean condition) {
        checks++;
        if (condition) {
            System.out.print(".");
        } else {
            System.out.print("F");
            failures.add(description);
        }
    }
}
