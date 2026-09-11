package connect4.ui;

import connect4.Board;
import connect4.Difficulty;
import connect4.Engine;
import connect4.Game;

import javax.swing.AbstractAction;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.DefaultListCellRenderer;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JComponent;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JList;
import javax.swing.JPanel;
import javax.swing.KeyStroke;
import javax.swing.SwingUtilities;
import javax.swing.SwingWorker;
import javax.swing.UIManager;
import javax.swing.plaf.ColorUIResource;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.event.ActionEvent;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;

/** The desktop front end: board, controls and the background search. */
public final class GameWindow extends JFrame {

    private static final Color BACKGROUND = new Color(0x0F172A);
    private static final Color SURFACE = new Color(0x16213B);
    private static final Color TEXT = new Color(0xE2E8F0);
    private static final Color MUTED = new Color(0x94A3B8);
    private static final Color ACCENT = new Color(0x38BDF8);
    private static final Color CONTROL = new Color(0x243154);
    private static final Color CONTROL_HOVER = new Color(0x33456F);

    static {
        applyDarkTheme();
    }

    /**
     * The cross-platform look and feel paints combo boxes and button shadows from these
     * defaults, so they have to be in place before any control is constructed.
     */
    private static void applyDarkTheme() {
        java.util.Map<String, Color> defaults = new java.util.LinkedHashMap<>();
        defaults.put("ComboBox.background", CONTROL);
        defaults.put("ComboBox.foreground", TEXT);
        defaults.put("ComboBox.selectionBackground", CONTROL_HOVER);
        defaults.put("ComboBox.selectionForeground", TEXT);
        defaults.put("ComboBox.buttonBackground", CONTROL);
        defaults.put("ComboBox.buttonShadow", CONTROL);
        defaults.put("ComboBox.buttonDarkShadow", CONTROL);
        defaults.put("ComboBox.buttonHighlight", CONTROL_HOVER);
        defaults.put("ComboBox.disabledBackground", CONTROL);
        defaults.put("ComboBox.disabledForeground", MUTED);
        defaults.put("Button.select", CONTROL_HOVER);
        defaults.put("controlShadow", CONTROL_HOVER);
        defaults.put("controlDkShadow", CONTROL_HOVER);
        defaults.put("controlHighlight", CONTROL_HOVER);
        defaults.put("controlLtHighlight", CONTROL_HOVER);
        defaults.put("Button.disabledText", MUTED);
        defaults.forEach((key, colour) -> UIManager.put(key, new ColorUIResource(colour)));
    }

    private final Game game = new Game();
    private final Engine engine = new Engine();
    private final BoardPanel boardPanel;

    private final JLabel statusLabel = new JLabel();
    private final JLabel statsLabel = new JLabel(" ");
    private final TurnDot turnDot = new TurnDot();
    private final JComboBox<Difficulty> difficultyBox = new JComboBox<>(Difficulty.values());
    private final JComboBox<String> firstMoveBox = new JComboBox<>(new String[] { "You start", "Engine starts" });
    private final JButton undoButton = new JButton("Undo");

    private SwingWorker<Engine.Result, Void> thinker;

    public GameWindow(Difficulty difficulty, boolean humanMovesFirst) {
        super("Connect 4 — bitboard engine");
        game.restart(humanMovesFirst);
        difficultyBox.setSelectedItem(difficulty);
        firstMoveBox.setSelectedIndex(humanMovesFirst ? 0 : 1);

        boardPanel = new BoardPanel(game);
        boardPanel.setColumnListener(this::humanMove);

        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLayout(new BorderLayout());
        getContentPane().setBackground(BACKGROUND);
        add(buildHeader(), BorderLayout.NORTH);
        add(boardPanel, BorderLayout.CENTER);
        add(buildControls(), BorderLayout.SOUTH);

        registerShortcut("control Z", "undo", this::undo);
        registerShortcut("control N", "new-game", this::newGame);

        pack();
        setMinimumSize(new Dimension(560, 620));
        setLocationRelativeTo(null);

        refresh();
        SwingUtilities.invokeLater(boardPanel::requestFocusInWindow);
        if (!game.humanToMove()) startEngineTurn();
    }

    /* ── layout ──────────────────────────────────────────────────────── */

    private JComponent buildHeader() {
        JPanel header = new JPanel(new BorderLayout(12, 0));
        header.setBackground(BACKGROUND);
        header.setBorder(BorderFactory.createEmptyBorder(16, 20, 8, 20));

        JLabel title = new JLabel("Connect 4");
        title.setForeground(TEXT);
        title.setFont(title.getFont().deriveFont(Font.BOLD, 22f));

        statusLabel.setForeground(MUTED);
        statusLabel.setFont(statusLabel.getFont().deriveFont(Font.PLAIN, 14f));

        JPanel right = new JPanel();
        right.setOpaque(false);
        right.setLayout(new BoxLayout(right, BoxLayout.X_AXIS));
        right.add(turnDot);
        right.add(Box.createHorizontalStrut(8));
        right.add(statusLabel);

        header.add(title, BorderLayout.WEST);
        header.add(right, BorderLayout.EAST);
        return header;
    }

    private JComponent buildControls() {
        JPanel bar = new JPanel();
        bar.setBackground(SURFACE);
        bar.setBorder(BorderFactory.createEmptyBorder(12, 20, 12, 20));
        bar.setLayout(new BoxLayout(bar, BoxLayout.X_AXIS));

        JButton newGame = new JButton("New game");
        styleButton(newGame, true);
        newGame.addActionListener(e -> newGame());

        styleButton(undoButton, false);
        undoButton.addActionListener(e -> undo());

        difficultyBox.addActionListener(e -> refresh());
        firstMoveBox.addActionListener(e -> newGame());
        styleCombo(difficultyBox);
        styleCombo(firstMoveBox);

        statsLabel.setForeground(MUTED);
        statsLabel.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 12));
        statsLabel.setAlignmentY(Component.CENTER_ALIGNMENT);

        bar.add(newGame);
        bar.add(Box.createHorizontalStrut(8));
        bar.add(undoButton);
        bar.add(Box.createHorizontalStrut(16));
        bar.add(label("Level"));
        bar.add(Box.createHorizontalStrut(6));
        bar.add(difficultyBox);
        bar.add(Box.createHorizontalStrut(12));
        bar.add(firstMoveBox);
        bar.add(Box.createHorizontalGlue());
        bar.add(statsLabel);
        return bar;
    }

    private static JLabel label(String text) {
        JLabel created = new JLabel(text);
        created.setForeground(MUTED);
        return created;
    }

    private static void styleButton(JButton button, boolean primary) {
        button.setFocusPainted(false);
        button.setBorderPainted(false);
        button.setContentAreaFilled(false);
        button.setOpaque(true);
        button.setForeground(primary ? new Color(0x0B1220) : TEXT);
        button.setBackground(primary ? ACCENT : CONTROL);
        button.setFont(button.getFont().deriveFont(Font.BOLD, 13f));
        button.setBorder(BorderFactory.createEmptyBorder(9, 18, 9, 18));
        button.setCursor(java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR));
        button.setMaximumSize(new Dimension(180, 36));
    }

    private static void styleCombo(JComboBox<?> combo) {
        combo.setForeground(TEXT);
        combo.setBackground(CONTROL);
        combo.setFont(combo.getFont().deriveFont(Font.PLAIN, 13f));
        combo.setPreferredSize(new Dimension(140, 34));
        combo.setMaximumSize(new Dimension(140, 34));
        combo.setFocusable(false);
        combo.setBorder(BorderFactory.createLineBorder(CONTROL_HOVER));
        combo.setRenderer(new DefaultListCellRenderer() {
            @Override public Component getListCellRendererComponent(JList<?> list, Object value,
                    int index, boolean selected, boolean focused) {
                super.getListCellRendererComponent(list, value, index, selected, focused);
                setBackground(selected ? CONTROL_HOVER : CONTROL);
                setForeground(TEXT);
                setBorder(BorderFactory.createEmptyBorder(6, 10, 6, 10));
                return this;
            }
        });
    }

    private void registerShortcut(String keyStroke, String name, Runnable action) {
        JComponent root = getRootPane();
        root.getInputMap(JComponent.WHEN_IN_FOCUSED_WINDOW).put(KeyStroke.getKeyStroke(keyStroke), name);
        root.getActionMap().put(name, new AbstractAction() {
            @Override public void actionPerformed(ActionEvent e) { action.run(); }
        });
    }

    /* ── game flow ───────────────────────────────────────────────────── */

    private Difficulty difficulty() {
        return (Difficulty) difficultyBox.getSelectedItem();
    }

    private void humanMove(int column) {
        if (!game.humanToMove() || !game.canPlay(column)) return;
        statsLabel.setText(" ");
        playAndAnimate(column, this::afterMove);
    }

    private void playAndAnimate(int column, Runnable after) {
        int seat = game.board().sideToMove();
        int row = game.play(column);
        boardPanel.setInputEnabled(false);
        refresh();
        boardPanel.animateDrop(row, column, seat, () -> {
            boardPanel.setInputEnabled(true);
            after.run();
        });
    }

    private void afterMove() {
        refresh();
        if (game.isOver()) {
            boardPanel.markGameOver();
            return;
        }
        if (!game.humanToMove()) startEngineTurn();
    }

    private void startEngineTurn() {
        boardPanel.setInputEnabled(false);
        refresh();

        Board snapshot = game.board().copy();
        Difficulty level = difficulty();
        thinker = new SwingWorker<>() {
            @Override protected Engine.Result doInBackground() {
                return engine.search(snapshot, level);
            }
            @Override protected void done() {
                if (isCancelled()) return;
                try {
                    Engine.Result result = get();
                    if (game.isOver() || game.humanToMove() || !game.canPlay(result.column())) return;
                    statsLabel.setText(result.statsText());
                    playAndAnimate(result.column(), GameWindow.this::afterMove);
                } catch (CancellationException ignored) {
                    // a new game or an undo overtook this search
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } catch (ExecutionException e) {
                    statsLabel.setText("search failed: " + e.getCause());
                    boardPanel.setInputEnabled(true);
                }
            }
        };
        thinker.execute();
    }

    private void stopThinking() {
        if (thinker != null && !thinker.isDone()) {
            engine.cancel();
            thinker.cancel(true);
        }
        thinker = null;
    }

    private void newGame() {
        stopThinking();
        engine.newGame();
        boardPanel.cancelAnimation();
        game.restart(firstMoveBox.getSelectedIndex() == 0);
        statsLabel.setText(" ");
        boardPanel.setInputEnabled(true);
        refresh();
        boardPanel.requestFocusInWindow();
        if (!game.humanToMove()) startEngineTurn();
    }

    private void undo() {
        stopThinking();
        boardPanel.cancelAnimation();
        if (game.board().moves() == 0) return;
        game.undoTurn();
        statsLabel.setText(" ");
        boardPanel.setInputEnabled(true);
        refresh();
    }

    private void refresh() {
        statusLabel.setText(game.statusText());
        statusLabel.setForeground(game.isOver() ? TEXT : MUTED);
        turnDot.setColor(game.isOver() ? MUTED
                : game.humanToMove() ? BoardPanel.colorForHuman() : BoardPanel.colorForEngine());
        undoButton.setEnabled(game.board().moves() > 0);
        boardPanel.repaint();
    }

    /** Small coloured circle showing whose turn it is. */
    private static final class TurnDot extends JComponent {
        private Color color = MUTED;

        TurnDot() { setPreferredSize(new Dimension(14, 14)); setMaximumSize(new Dimension(14, 14)); }

        void setColor(Color color) {
            this.color = color;
            repaint();
        }

        @Override protected void paintComponent(Graphics graphics) {
            Graphics2D g = (Graphics2D) graphics.create();
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setColor(color);
            g.fillOval(0, 2, 12, 12);
            g.dispose();
        }

        @Override public Dimension getMaximumSize() { return getPreferredSize(); }
        @Override public float getAlignmentY() { return Component.CENTER_ALIGNMENT; }
    }
}
