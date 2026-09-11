package connect4;

import connect4.ui.GameWindow;

import javax.swing.SwingUtilities;
import java.awt.GraphicsEnvironment;

/** Entry point: Swing window by default, terminal or self-test on request. */
public final class Main {

    private Main() { }

    public static void main(String[] args) {
        Difficulty difficulty = Difficulty.HARD;
        boolean humanMovesFirst = true;
        boolean console = false;
        boolean colour = true;

        for (String arg : args) {
            switch (arg) {
                case "--cli", "--console" -> console = true;
                case "--no-color", "--no-colour" -> colour = false;
                case "--engine-first" -> humanMovesFirst = false;
                case "--selftest" -> { SelfTest.main(new String[0]); return; }
                case "--bench" -> { Benchmark.main(new String[0]); return; }
                case "--help", "-h" -> { printUsage(); return; }
                default -> {
                    if (arg.startsWith("--level=")) {
                        Difficulty parsed = Difficulty.parse(arg.substring("--level=".length()));
                        if (parsed == null) {
                            System.err.println("unknown level: " + arg.substring("--level=".length()));
                            printUsage();
                            System.exit(2);
                        }
                        difficulty = parsed;
                    } else {
                        System.err.println("unknown option: " + arg);
                        printUsage();
                        System.exit(2);
                    }
                }
            }
        }

        if (console || GraphicsEnvironment.isHeadless()) {
            if (!console) System.out.println("no display available — falling back to the terminal front end");
            new ConsoleGame(difficulty, humanMovesFirst, colour).run();
            return;
        }

        Difficulty startingDifficulty = difficulty;
        boolean startingSeat = humanMovesFirst;
        // The cross-platform look and feel honours the colours the window sets; the native
        // one repaints buttons and combo boxes in system chrome and the dark theme breaks.
        SwingUtilities.invokeLater(() -> new GameWindow(startingDifficulty, startingSeat).setVisible(true));
    }

    private static void printUsage() {
        System.out.println("""
                Connect 4 - bitboard engine

                  java -jar connect4.jar [options]

                  --cli               play in the terminal instead of a window
                  --level=NAME        easy | medium | hard | brutal   (default: hard)
                  --engine-first      the engine takes the first move
                  --no-color          plain terminal output
                  --selftest          run the engine checks and exit
                  --bench             time the search on a few positions and exit
                  --help              show this message
                """);
    }
}
