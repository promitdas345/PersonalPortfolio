package connect4;

import java.io.BufferedReader;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

/** Terminal front end: same engine, no window. */
public final class ConsoleGame {

    private static final String RESET = "[0m";
    private static final String DIM = "[2m";
    private static final String BOLD = "[1m";
    private static final String BLUE = "[34m";
    private static final String RED = "[91m";
    private static final String YELLOW = "[93m";

    /** Board glyphs, with an ASCII fallback for consoles that cannot encode them. */
    private static final String[] FANCY = { "·", "●", "◉", "│", "└", "─", "┘" };
    private static final String[] PLAIN = { ".", "O", "@", "|", "+", "-", "+" };

    private final Game game = new Game();
    private final Engine engine = new Engine();
    private final Difficulty difficulty;
    private final boolean colour;
    private final PrintStream out;
    private final String[] glyphs;

    public ConsoleGame(Difficulty difficulty, boolean humanMovesFirst, boolean colour) {
        this.difficulty = difficulty;
        this.colour = colour;
        Charset charset = System.console() != null ? System.console().charset() : Charset.defaultCharset();
        this.out = new PrintStream(new FileOutputStream(FileDescriptor.out), true, charset);
        this.glyphs = charset.newEncoder().canEncode(String.join("", FANCY)) ? FANCY : PLAIN;
        game.restart(humanMovesFirst);
    }

    private String glyph(int index) { return glyphs[index]; }

    public void run() {
        BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        out.println();
        out.println(paint(BOLD, "Connect 4") + paint(DIM, "  -  level " + difficulty.label()));
        out.println(paint(DIM, "1-7 drop | u undo | n new game | h hint | q quit"));

        while (true) {
            if (!game.humanToMove() && !game.isOver()) {
                engineTurn();
                continue;
            }
            render();
            if (game.isOver()) {
                out.println("  " + paint(BOLD, game.statusText()));
                out.print(paint(DIM, "  play again? [y/n] "));
                String answer = readLine(input);
                if (answer == null || !answer.trim().toLowerCase().startsWith("y")) return;
                restart();
                continue;
            }

            out.print("  your move > ");
            String line = readLine(input);
            if (line == null) return;
            String command = line.trim().toLowerCase();

            switch (command) {
                case "", "\n" -> { }
                case "q", "quit", "exit" -> { return; }
                case "n", "new" -> restart();
                case "u", "undo" -> {
                    if (game.board().moves() == 0) out.println(paint(DIM, "  nothing to undo"));
                    else game.undoTurn();
                }
                case "h", "hint" -> hint();
                default -> {
                    int column = parseColumn(command);
                    if (column < 0) out.println(paint(DIM, "  enter a column from 1 to 7"));
                    else if (!game.canPlay(column)) out.println(paint(DIM, "  column " + (column + 1) + " is full"));
                    else game.play(column);
                }
            }
        }
    }

    private void restart() {
        engine.newGame();
        game.restart(game.humanSeat() == Board.PLAYER_ONE);
    }

    private void engineTurn() {
        render();
        out.print(paint(DIM, "  engine is thinking..."));
        Engine.Result result = engine.search(game.board(), difficulty);
        out.print(colour ? "\r[2K" : "\n");
        out.println(paint(DIM, "  engine plays " + (result.column() + 1) + "  (" + result.statsText() + ")"));
        game.play(result.column());
    }

    private void hint() {
        Engine.Result result = engine.search(game.board(), difficulty);
        out.println(paint(DIM, "  try column " + (result.column() + 1) + "  (" + result.scoreText() + ")"));
    }

    private static int parseColumn(String command) {
        if (command.length() != 1) return -1;
        char c = command.charAt(0);
        return c >= '1' && c <= '7' ? c - '1' : -1;
    }

    private static String readLine(BufferedReader input) {
        try {
            return input.readLine();
        } catch (IOException e) {
            return null;
        }
    }

    private void render() {
        Board board = game.board();
        int[][] line = game.winningLine();
        out.println();
        for (int row = 0; row < Board.ROWS; row++) {
            StringBuilder sb = new StringBuilder("  " + paint(BLUE, glyph(3)));
            for (int column = 0; column < Board.COLS; column++) {
                int seat = board.cellAt(row, column);
                String disc = seat == Board.EMPTY ? paint(DIM, glyph(0))
                        : paint(seat == game.humanSeat() ? RED : YELLOW, glyph(onLine(line, row, column) ? 2 : 1));
                sb.append(' ').append(disc).append(' ');
            }
            sb.append(paint(BLUE, glyph(3)));
            out.println(sb);
        }
        out.println("  " + paint(BLUE, glyph(4) + glyph(5).repeat(Board.COLS * 3) + glyph(6)));
        StringBuilder numbers = new StringBuilder("   ");
        for (int column = 0; column < Board.COLS; column++) numbers.append(' ').append(column + 1).append(' ');
        out.println(paint(DIM, numbers.toString()));
        out.println();
    }

    private static boolean onLine(int[][] line, int row, int column) {
        if (line == null) return false;
        for (int[] cell : line) {
            if (cell[0] == row && cell[1] == column) return true;
        }
        return false;
    }

    private String paint(String code, String text) {
        return colour ? code + text + RESET : text;
    }
}
