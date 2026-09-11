package connect4;

import java.util.Arrays;

/**
 * Fixed-size, open-addressed transposition table.
 *
 * <p>Two flat arrays instead of a {@code HashMap}: no boxing, no per-entry object, and
 * the whole table stays in a couple of contiguous allocations. Each slot packs score,
 * depth, bound flag and the best column into one {@code int}; slot value {@code 0} means
 * empty, because every stored entry sets the valid bit.</p>
 *
 * <pre>
 *   bit  0      valid
 *   bits 1..16  score + 32768
 *   bits 17..22 depth (0..63)
 *   bits 23..24 bound flag
 *   bits 25..28 best column + 1 (0 = unknown)
 * </pre>
 */
final class TranspositionTable {

    static final int EXACT = 0;
    static final int LOWER = 1;   // score is a lower bound (fail-high)
    static final int UPPER = 2;   // score is an upper bound (fail-low)

    static final int MISS = 0;

    private static final int SCORE_OFFSET = 32768;
    private static final long MIX = 0x9E3779B97F4A7C15L;

    private final long[] keys;
    private final int[] entries;
    private final int indexShift;

    private long hits;
    private long stores;

    /** @param bits table holds {@code 2^bits} slots (22 ≈ 4M slots ≈ 48 MB). */
    TranspositionTable(int bits) {
        if (bits < 8 || bits > 28) throw new IllegalArgumentException("bits out of range: " + bits);
        keys = new long[1 << bits];
        entries = new int[1 << bits];
        indexShift = 64 - bits;
    }

    void clear() {
        Arrays.fill(keys, 0L);
        Arrays.fill(entries, 0);
        hits = 0;
        stores = 0;
    }

    private int slot(long key) {
        return (int) ((key * MIX) >>> indexShift);
    }

    /** Packed entry for {@code key}, or {@link #MISS} when the position is not stored. */
    int probe(long key) {
        int i = slot(key);
        if (keys[i] != key) return MISS;
        hits++;
        return entries[i];
    }

    void store(long key, int score, int depth, int flag, int bestColumn) {
        int i = slot(key);
        int existing = entries[i];
        // Depth-preferred: keep the deeper search unless this is the same position.
        if (existing != MISS && keys[i] != key && depth(existing) > depth) return;
        keys[i] = key;
        entries[i] = 1
                | ((score + SCORE_OFFSET) & 0xFFFF) << 1
                | (Math.min(depth, 63) & 0x3F) << 17
                | (flag & 0x3) << 23
                | ((bestColumn + 1) & 0xF) << 25;
        stores++;
    }

    static int score(int entry)  { return ((entry >>> 1) & 0xFFFF) - SCORE_OFFSET; }
    static int depth(int entry)  { return (entry >>> 17) & 0x3F; }
    static int flag(int entry)   { return (entry >>> 23) & 0x3; }
    static int column(int entry) { return ((entry >>> 25) & 0xF) - 1; }

    long hits()     { return hits; }
    long stores()   { return stores; }
    int capacity()  { return keys.length; }
}
