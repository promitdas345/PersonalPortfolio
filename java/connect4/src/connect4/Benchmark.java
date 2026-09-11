package connect4;

/**
 * Times the search on a handful of positions so changes to move ordering or the
 * evaluation can be compared. Run with {@code java -jar connect4.jar --bench}.
 */
public final class Benchmark {

    /** Move strings (1-based columns) covering an opening, a middlegame and a tactic. */
    private static final String[] POSITIONS = {
        "4",
        "4453",
        "444444",
        "4443332",
        "445336277",
    };

    private Benchmark() { }

    public static void main(String[] args) {
        Engine.Limits limits = new Engine.Limits(Board.SIZE, 3_000, 0);
        long totalNodes = 0;
        long totalMillis = 0;

        System.out.printf("%-16s %6s %7s %12s %10s   %s%n",
                "position", "stones", "depth", "nodes", "ms", "best");
        for (String moves : POSITIONS) {
            Board board = Board.fromMoves(moves);
            Engine engine = new Engine();
            Engine.Result result = engine.search(board, limits);
            totalNodes += result.nodes();
            totalMillis += result.millis();
            System.out.printf("%-16s %6d %7d %,12d %,10d   column %d (%s)%n",
                    moves, board.moves(), result.depth(), result.nodes(), result.millis(),
                    result.column() + 1, result.scoreText());
        }

        double seconds = Math.max(totalMillis, 1) / 1000.0;
        System.out.printf("%ntotal %,d nodes in %.2fs - %,.0f nodes/s%n",
                totalNodes, seconds, totalNodes / seconds);
    }
}
