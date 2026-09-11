package connect4;

/** How hard the engine tries: search depth, thinking time, and how often it looks away. */
public enum Difficulty {

    EASY("Easy", 2, 200, 0.35),
    MEDIUM("Medium", 6, 800, 0.10),
    HARD("Hard", 14, 2_500, 0.0),
    BRUTAL("Brutal", Board.SIZE, 8_000, 0.0);

    private final String label;
    private final int maxDepth;
    private final int timeBudgetMillis;
    private final double blunderChance;

    Difficulty(String label, int maxDepth, int timeBudgetMillis, double blunderChance) {
        this.label = label;
        this.maxDepth = maxDepth;
        this.timeBudgetMillis = timeBudgetMillis;
        this.blunderChance = blunderChance;
    }

    /** The search budget this level hands the engine. */
    public Engine.Limits limits() { return new Engine.Limits(maxDepth, timeBudgetMillis, blunderChance); }

    public String label()          { return label; }
    public int maxDepth()          { return maxDepth; }
    public int timeBudgetMillis()  { return timeBudgetMillis; }
    public double blunderChance()  { return blunderChance; }

    @Override
    public String toString() { return label; }

    /** Accepts {@code easy}, {@code Hard}, {@code BRUTAL}… returns {@code null} if unknown. */
    public static Difficulty parse(String text) {
        if (text == null) return null;
        for (Difficulty difficulty : values()) {
            if (difficulty.name().equalsIgnoreCase(text.trim())) return difficulty;
        }
        return null;
    }
}
