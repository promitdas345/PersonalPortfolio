package connect4;

/**
 * One human-versus-engine game: whose turn it is, whether it is over, and the rules for
 * taking a move back. Both the Swing and the console front ends drive this class.
 */
public final class Game {

    public enum Status { PLAYING, HUMAN_WON, ENGINE_WON, DRAW }

    private final Board board = new Board();
    private int humanSeat = Board.PLAYER_ONE;
    private Status status = Status.PLAYING;
    private int[][] winningLine;

    public Game() { }

    public Game(boolean humanMovesFirst) { restart(humanMovesFirst); }

    public void restart(boolean humanMovesFirst) {
        board.reset();
        humanSeat = humanMovesFirst ? Board.PLAYER_ONE : Board.PLAYER_TWO;
        status = Status.PLAYING;
        winningLine = null;
    }

    public Board board()          { return board; }
    public Status status()        { return status; }
    public boolean isOver()       { return status != Status.PLAYING; }
    public int humanSeat()        { return humanSeat; }
    public int engineSeat()       { return humanSeat == Board.PLAYER_ONE ? Board.PLAYER_TWO : Board.PLAYER_ONE; }
    public boolean humanToMove()  { return !isOver() && board.sideToMove() == humanSeat; }
    public int[][] winningLine()  { return winningLine; }

    public boolean canPlay(int column) { return !isOver() && board.canPlay(column); }

    /** Drops a stone for whoever is to move and updates the status. Returns the row it landed on. */
    public int play(int column) {
        if (isOver()) throw new IllegalStateException("the game is over");
        int row = board.landingRow(column);
        boolean winning = board.isWinningMove(column);
        int mover = board.sideToMove();
        board.play(column);

        if (winning) {
            status = mover == humanSeat ? Status.HUMAN_WON : Status.ENGINE_WON;
            winningLine = board.winningLine();
        } else if (board.isFull()) {
            status = Status.DRAW;
        }
        return row;
    }

    /**
     * Takes back moves until it is the human's turn again on a live board — one ply after
     * an engine reply, two after the human moved. Returns how many plies came off.
     */
    public int undoTurn() {
        int undone = 0;
        while (board.moves() > 0) {
            board.undo();
            undone++;
            status = Status.PLAYING;
            winningLine = null;
            if (board.sideToMove() == humanSeat) break;
        }
        return undone;
    }

    public String statusText() {
        return switch (status) {
            case HUMAN_WON -> "You win.";
            case ENGINE_WON -> "The engine wins.";
            case DRAW -> "Draw — the board is full.";
            case PLAYING -> humanToMove() ? "Your move." : "Engine is thinking…";
        };
    }
}
