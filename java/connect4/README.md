# Connect 4 — Java

A Java rewrite of the Connect 4 engine that powers the browser demo in
[`public/connect4.js`](../../public/connect4.js). Same ideas — bitboards, negamax with
alpha-beta, iterative deepening, a transposition table — but on `long` arithmetic instead
of JavaScript `BigInt`, which is worth roughly an order of magnitude in search speed.

Ships with a Swing front end, a terminal front end, a self-test and a benchmark. No
dependencies, no build tool: a JDK is all it needs.

## Running it

```powershell
.\build.ps1          # compile, self-test, package out/connect4.jar
.\build.ps1 -Run     # ...and launch the game
```

```bash
./build.sh --run     # same, from bash
```

```
java -jar out/connect4.jar [options]

  --cli               play in the terminal instead of a window
  --level=NAME        easy | medium | hard | brutal   (default: hard)
  --engine-first      the engine takes the first move
  --no-color          plain terminal output
  --selftest          run the engine checks and exit
  --bench             time the search on a few positions and exit
```

In the window: click or press `1`-`7` to drop, arrow keys to aim, `Ctrl+Z` to take a move
back, `Ctrl+N` for a new game.

## How the search works

**Board.** The grid is two `long`s — one for the stones of the player to move, one for
every stone on the board. Bit `col * 7 + row` holds a cell, row 0 at the bottom. Each
column gets seven bits for six cells; the spare sentinel bit stops a carry, or a shifted
alignment, from leaking into the next column. Detecting four in a row is four shift-and
pairs over the whole board at once rather than a scan.

Playing a move is `current ^= mask; mask |= mask + bottomBit(col)`, which both drops the
stone and swaps whose stones `current` names — exactly the perspective flip negamax wants.
`undo()` reverses it in two operations, so the search needs no copies.

**Search.** Negamax with alpha-beta over a move list that is already filtered:

- a move that wins now ends the node immediately;
- if the opponent threatens two squares at once the node is a proven loss;
- moves that fill the square beneath an opponent's winning square are never generated.

What is left is ordered by the transposition table's best move, then killer moves, then
the threats a move creates, then centre bias. Iterative deepening runs until the time
budget expires, keeping only completed iterations, and stops early once the score proves a
forced result.

**Scores.** A decided game scores `20000 - moveCount`, so a faster win beats a slower one
and a later loss beats an earlier one. Heuristic scores are clamped to ±4000, well inside
that band, so a guess can never be mistaken for a proof — the flaw in the JavaScript
version, where the depth-0 heuristic shared a scale with the mate scores.

**Table.** Open-addressed, two flat arrays (`long[]` keys, `int[]` packed values), 4M slots
by default. Score, depth, bound flag and best column pack into one `int`; slot value `0`
means empty. Depth-preferred replacement. It persists between moves within a game and is
cleared by `newGame()`.

## Layout

| File | What it holds |
| --- | --- |
| `Board.java` | bitboard position, move/undo, win detection, the views the UI needs |
| `Engine.java` | root search, negamax, move ordering, evaluation |
| `TranspositionTable.java` | open-addressed table and its bit packing |
| `Difficulty.java` | depth, time budget and blunder rate per level |
| `Game.java` | turn order, game status, taking a move back |
| `ConsoleGame.java` | terminal front end |
| `ui/BoardPanel.java` | painting, hover, drop animation, input |
| `ui/GameWindow.java` | frame, controls, background search |
| `SelfTest.java` | board and search checks, exits non-zero on failure |
| `Benchmark.java` | node counts and nodes/second on fixed positions |

## Numbers

`--bench` on a JDK 25 desktop, three seconds per position:

```
position         stones   depth        nodes         ms   best
4                     1      19   13,984,768      3,001   column 4 (eval +30)
4453                  4      20   13,995,008      3,000   column 3 (eval -21)
444444                6      21   14,369,792      3,000   column 3 (eval +66)
4443332               7      22   14,086,144      3,000   column 4 (eval -48)
445336277             9      22   14,157,824      3,000   column 4 (eval -15)

total 70,593,536 nodes in 15.00s - 4,705,922 nodes/s
```

`--selftest` covers the bit layout, that `undo` restores every earlier position key, win
detection in all four directions, the sentinel row blocking wrap-around alignments,
taking a win, blocking a threat, scoring a forced win and a forced loss at the right
distance, never handing the opponent an immediate win, never returning a full column, and
winning every game against random play.
