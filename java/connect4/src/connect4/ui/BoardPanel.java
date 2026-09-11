package connect4.ui;

import connect4.Board;
import connect4.Game;

import javax.swing.JPanel;
import javax.swing.Timer;
import java.awt.AlphaComposite;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.GradientPaint;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RadialGradientPaint;
import java.awt.RenderingHints;
import java.awt.event.KeyAdapter;
import java.awt.event.KeyEvent;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.geom.Area;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Line2D;
import java.awt.geom.Point2D;
import java.awt.geom.RoundRectangle2D;
import java.util.function.IntConsumer;

/** Draws the grid, animates the falling stone, and turns clicks and keys into columns. */
public final class BoardPanel extends JPanel {

    private static final Color BACKGROUND = new Color(0x0F172A);
    private static final Color BOARD_TOP = new Color(0x2563EB);
    private static final Color BOARD_BOTTOM = new Color(0x1E3A8A);
    private static final Color HOLE = new Color(0x111C33);
    private static final Color RED = new Color(0xEF4444);
    private static final Color YELLOW = new Color(0xFACC15);
    private static final Color GHOST = new Color(255, 255, 255, 38);

    private static final int PREFERRED_CELL = 92;
    private static final long FALL_BASE_NANOS = 70_000_000L;
    private static final long FALL_PER_ROW_NANOS = 38_000_000L;
    private static final long BOUNCE_NANOS = 180_000_000L;

    private final Game game;
    private final Timer ticker;
    private IntConsumer columnListener = column -> { };

    private int hoverColumn = -1;
    private boolean inputEnabled = true;

    private int dropColumn = -1;
    private int dropRow = -1;
    private int dropSeat = Board.EMPTY;
    private long dropStarted;
    private long dropDuration;
    private Runnable dropFinished;

    private long winPulseStarted;

    public BoardPanel(Game game) {
        this.game = game;
        setBackground(BACKGROUND);
        setOpaque(true);
        setFocusable(true);
        setPreferredSize(new Dimension(Board.COLS * PREFERRED_CELL, (Board.ROWS + 1) * PREFERRED_CELL));

        ticker = new Timer(16, event -> {
            if (isAnimating()) {
                advanceAnimation();
                repaint();
            } else if (game.winningLine() != null) {
                repaint();
            }
        });
        ticker.start();

        addMouseListener(new MouseAdapter() {
            @Override public void mousePressed(MouseEvent e) {
                int column = columnAt(e.getX());
                if (column >= 0) chooseColumn(column);
            }
            @Override public void mouseExited(MouseEvent e) {
                hoverColumn = -1;
                repaint();
            }
        });
        addMouseMotionListener(new MouseAdapter() {
            @Override public void mouseMoved(MouseEvent e) {
                int column = columnAt(e.getX());
                if (column != hoverColumn) {
                    hoverColumn = column;
                    repaint();
                }
            }
        });
        addKeyListener(new KeyAdapter() {
            @Override public void keyPressed(KeyEvent e) {
                int code = e.getKeyCode();
                if (code >= KeyEvent.VK_1 && code <= KeyEvent.VK_7) {
                    chooseColumn(code - KeyEvent.VK_1);
                } else if (code == KeyEvent.VK_LEFT) {
                    hoverColumn = Math.max(0, (hoverColumn < 0 ? 4 : hoverColumn) - 1);
                    repaint();
                } else if (code == KeyEvent.VK_RIGHT) {
                    hoverColumn = Math.min(Board.COLS - 1, (hoverColumn < 0 ? 2 : hoverColumn) + 1);
                    repaint();
                } else if ((code == KeyEvent.VK_ENTER || code == KeyEvent.VK_SPACE) && hoverColumn >= 0) {
                    chooseColumn(hoverColumn);
                }
            }
        });
    }

    public void setColumnListener(IntConsumer listener) { this.columnListener = listener; }

    public void setInputEnabled(boolean enabled) {
        inputEnabled = enabled;
        repaint();
    }

    public boolean isAnimating() { return dropColumn >= 0; }

    private void chooseColumn(int column) {
        if (!inputEnabled || isAnimating()) return;
        columnListener.accept(column);
    }

    /** Animates a stone falling into {@code (row, column)}, then runs {@code whenDone}. */
    public void animateDrop(int row, int column, int seat, Runnable whenDone) {
        dropRow = row;
        dropColumn = column;
        dropSeat = seat;
        dropFinished = whenDone;
        dropStarted = System.nanoTime();
        dropDuration = FALL_BASE_NANOS + FALL_PER_ROW_NANOS * (row + 1) + BOUNCE_NANOS;
        repaint();
    }

    public void cancelAnimation() {
        dropColumn = -1;
        dropRow = -1;
        dropFinished = null;
        repaint();
    }

    public void markGameOver() {
        winPulseStarted = System.nanoTime();
        repaint();
    }

    /* ── geometry ────────────────────────────────────────────────────── */

    private int cellSize() {
        return Math.max(24, Math.min(getWidth() / Board.COLS, getHeight() / (Board.ROWS + 1)));
    }

    private int boardWidth()  { return cellSize() * Board.COLS; }
    private int boardHeight() { return cellSize() * Board.ROWS; }
    private int boardLeft()   { return (getWidth() - boardWidth()) / 2; }
    private int boardTop()    { return getHeight() - boardHeight() - cellSize() / 2; }

    private int columnAt(int x) {
        int column = (x - boardLeft()) / cellSize();
        return column >= 0 && column < Board.COLS ? column : -1;
    }

    private Point2D centreOf(int row, int column) {
        int cell = cellSize();
        return new Point2D.Double(boardLeft() + column * cell + cell / 2.0,
                                  boardTop() + row * cell + cell / 2.0);
    }

    /* ── painting ────────────────────────────────────────────────────── */

    @Override
    protected void paintComponent(Graphics graphics) {
        super.paintComponent(graphics);
        Graphics2D g = (Graphics2D) graphics.create();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);

        int cell = cellSize();
        double radius = cell * 0.40;

        paintHoverColumn(g, cell);
        paintSettledStones(g, radius);
        paintFallingStone(g, radius);
        paintBoardFace(g, cell, radius);
        paintGhostStone(g, radius);
        paintWinningLine(g, radius);

        g.dispose();
    }

    private void paintHoverColumn(Graphics2D g, int cell) {
        if (hoverColumn < 0 || !inputEnabled || isAnimating() || !game.canPlay(hoverColumn)) return;
        g.setColor(GHOST);
        g.fillRoundRect(boardLeft() + hoverColumn * cell, boardTop() - cell / 2,
                cell, boardHeight() + cell / 2, cell / 4, cell / 4);
    }

    private void paintSettledStones(Graphics2D g, double radius) {
        Board board = game.board();
        for (int row = 0; row < Board.ROWS; row++) {
            for (int column = 0; column < Board.COLS; column++) {
                int seat = board.cellAt(row, column);
                if (seat == Board.EMPTY) continue;
                if (isAnimating() && row == dropRow && column == dropColumn) continue;
                Point2D centre = centreOf(row, column);
                paintStone(g, centre.getX(), centre.getY(), radius, seatColor(seat), 1f);
            }
        }
    }

    /** Ends the drop once its time is up; runs off the timer so paint stays side-effect free. */
    private void advanceAnimation() {
        if (System.nanoTime() - dropStarted < dropDuration) return;
        Runnable finished = dropFinished;
        cancelAnimation();
        if (finished != null) finished.run();
    }

    private void paintFallingStone(Graphics2D g, double radius) {
        if (!isAnimating()) return;
        long elapsed = Math.min(System.nanoTime() - dropStarted, dropDuration - 1);

        Point2D target = centreOf(dropRow, dropColumn);
        double startY = boardTop() - cellSize() * 0.6;
        double travel = target.getY() - startY;
        long fallTime = FALL_BASE_NANOS + FALL_PER_ROW_NANOS * (dropRow + 1);

        double y;
        double squash = 1.0;
        if (elapsed < fallTime) {
            double t = elapsed / (double) fallTime;
            y = startY + travel * t * t;                       // constant acceleration
        } else {
            double t = (elapsed - fallTime) / (double) BOUNCE_NANOS;
            double bounce = Math.abs(Math.sin(t * Math.PI * 2)) * (1 - t) * radius * 0.45;
            y = target.getY() - bounce;
            squash = 1 + 0.14 * (1 - t) * Math.cos(t * Math.PI * 4);
        }

        paintStone(g, target.getX(), y, radius / squash, seatColor(dropSeat), 1f);
    }

    /** The blue face with the holes punched out, drawn over the stones. */
    private void paintBoardFace(Graphics2D g, int cell, double radius) {
        RoundRectangle2D face = new RoundRectangle2D.Double(
                boardLeft(), boardTop(), boardWidth(), boardHeight(), cell * 0.35, cell * 0.35);
        Area plastic = new Area(face);
        for (int row = 0; row < Board.ROWS; row++) {
            for (int column = 0; column < Board.COLS; column++) {
                Point2D centre = centreOf(row, column);
                plastic.subtract(new Area(new Ellipse2D.Double(
                        centre.getX() - radius, centre.getY() - radius, radius * 2, radius * 2)));
            }
        }

        g.setPaint(new GradientPaint(0, boardTop(), BOARD_TOP, 0, boardTop() + boardHeight(), BOARD_BOTTOM));
        g.fill(plastic);

        // Recess shading inside every empty hole.
        Board board = game.board();
        for (int row = 0; row < Board.ROWS; row++) {
            for (int column = 0; column < Board.COLS; column++) {
                boolean hidden = isAnimating() && row == dropRow && column == dropColumn;
                if (board.cellAt(row, column) != Board.EMPTY && !hidden) continue;
                Point2D centre = centreOf(row, column);
                g.setPaint(new RadialGradientPaint(
                        new Point2D.Double(centre.getX() - radius * 0.3, centre.getY() - radius * 0.3),
                        (float) radius * 1.6f,
                        new float[] { 0f, 1f },
                        new Color[] { HOLE.brighter(), HOLE }));
                g.fill(new Ellipse2D.Double(centre.getX() - radius, centre.getY() - radius, radius * 2, radius * 2));
            }
        }

        g.setColor(new Color(255, 255, 255, 26));
        g.setStroke(new BasicStroke(Math.max(1f, cell * 0.02f)));
        g.draw(face);
    }

    /** Translucent preview of the stone the human is about to drop. */
    private void paintGhostStone(Graphics2D g, double radius) {
        if (hoverColumn < 0 || !inputEnabled || isAnimating() || !game.humanToMove()
                || !game.canPlay(hoverColumn)) {
            return;
        }
        Point2D centre = centreOf(0, hoverColumn);
        double y = boardTop() - cellSize() * 0.55;
        paintStone(g, centre.getX(), y, radius, seatColor(game.humanSeat()), 0.65f);
    }

    private void paintWinningLine(Graphics2D g, double radius) {
        int[][] line = game.winningLine();
        if (line == null) return;

        double pulse = 0.55 + 0.45 * Math.sin((System.nanoTime() - winPulseStarted) / 320_000_000.0);
        g.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, (float) pulse));
        g.setColor(Color.WHITE);
        g.setStroke(new BasicStroke((float) (radius * 0.18), BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        for (int[] cell : line) {
            Point2D centre = centreOf(cell[0], cell[1]);
            g.draw(new Ellipse2D.Double(centre.getX() - radius * 0.86, centre.getY() - radius * 0.86,
                    radius * 1.72, radius * 1.72));
        }
        Point2D first = centreOf(line[0][0], line[0][1]);
        Point2D last = centreOf(line[line.length - 1][0], line[line.length - 1][1]);
        g.draw(new Line2D.Double(first, last));
        g.setComposite(AlphaComposite.SrcOver);
    }

    private static void paintStone(Graphics2D g, double x, double y, double radius, Color base, float alpha) {
        if (alpha < 1f) g.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, alpha));

        g.setColor(new Color(0, 0, 0, 70));
        g.fill(new Ellipse2D.Double(x - radius, y - radius + radius * 0.12, radius * 2, radius * 2));

        g.setPaint(new RadialGradientPaint(
                new Point2D.Double(x - radius * 0.35, y - radius * 0.4),
                (float) radius * 1.45f,
                new float[] { 0f, 0.55f, 1f },
                new Color[] { base.brighter(), base, base.darker() }));
        g.fill(new Ellipse2D.Double(x - radius, y - radius, radius * 2, radius * 2));

        g.setColor(new Color(0, 0, 0, 60));
        g.setStroke(new BasicStroke((float) Math.max(1.0, radius * 0.07)));
        g.draw(new Ellipse2D.Double(x - radius, y - radius, radius * 2, radius * 2));

        if (alpha < 1f) g.setComposite(AlphaComposite.SrcOver);
    }

    private Color seatColor(int seat) {
        return seat == game.humanSeat() ? RED : YELLOW;
    }

    public static Color colorForHuman() { return RED; }
    public static Color colorForEngine() { return YELLOW; }
}
