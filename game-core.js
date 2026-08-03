(function exposeEvenOddCore(root, factory) {
  "use strict";

  const core = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = core;
  }

  root.EvenOddCore = core;
})(typeof globalThis !== "undefined" ? globalThis : this, function createEvenOddCore() {
  "use strict";

  const LINE_DEFS = Object.freeze([
    Object.freeze({ name: "Top row", cells: Object.freeze([0, 1, 2]) }),
    Object.freeze({ name: "Middle row", cells: Object.freeze([3, 4, 5]) }),
    Object.freeze({ name: "Bottom row", cells: Object.freeze([6, 7, 8]) }),
    Object.freeze({ name: "Left column", cells: Object.freeze([0, 3, 6]) }),
    Object.freeze({ name: "Middle column", cells: Object.freeze([1, 4, 7]) }),
    Object.freeze({ name: "Right column", cells: Object.freeze([2, 5, 8]) }),
    Object.freeze({ name: "Diagonal", cells: Object.freeze([0, 4, 8]) }),
    Object.freeze({ name: "Other diagonal", cells: Object.freeze([2, 4, 6]) })
  ]);

  const MATCH_PRESETS = Object.freeze([
    Object.freeze({ id: "quick", label: "Quick", goal: 8, duration: "5–10 min" }),
    Object.freeze({ id: "standard", label: "Standard", goal: 24, duration: "15–25 min" }),
    Object.freeze({ id: "long", label: "Long", goal: 40, duration: "30–45 min" })
  ]);

  function assertBoard(board) {
    if (!Array.isArray(board) || board.length !== 9) {
      throw new TypeError("board must be an array of nine cells");
    }
  }

  function dieValue(die) {
    if (die === null || die === undefined) return null;
    const value = typeof die === "number" ? die : die.value;
    return Number.isFinite(value) ? value : null;
  }

  function completedLines(board) {
    assertBoard(board);

    return LINE_DEFS.flatMap((line) => {
      const values = line.cells.map((cell) => dieValue(board[cell]));
      if (values.some((value) => value === null)) return [];

      const total = values.reduce((sum, value) => sum + value, 0);
      const parity = total % 2 === 0 ? "even" : "odd";
      const winner = parity === "even" ? "white" : "black";
      const equation = `${values.join(" + ")} = ${total}`;
      const outcome = `${equation} · ${parity === "even" ? "Even" : "Odd"} → ${winner === "white" ? "White" : "Black"} +1`;

      return [{
        name: line.name,
        cells: line.cells.slice(),
        values,
        total,
        parity,
        winner,
        equation,
        outcome
      }];
    });
  }

  function scoreBoard(board) {
    return completedLines(board).reduce((score, line) => {
      score[line.winner] += 1;
      return score;
    }, { black: 0, white: 0 });
  }

  function legalMoves(board, dice) {
    assertBoard(board);
    if (!Array.isArray(dice)) {
      throw new TypeError("dice must be an array");
    }

    const openCells = board
      .map((die, cell) => die === null || die === undefined ? cell : null)
      .filter((cell) => cell !== null);

    return dice
      .filter((die) => die && !die.used && dieValue(die) !== null)
      .flatMap((die) => openCells.map((cell) => ({ die, cell })));
  }

  function chooseBestMove(board, dice, color) {
    if (color !== "black" && color !== "white") {
      throw new TypeError('color must be either "black" or "white"');
    }

    const moves = legalMoves(board, dice);
    let bestMove = null;

    moves.forEach((move) => {
      const candidateBoard = board.slice();
      candidateBoard[move.cell] = { color, value: dieValue(move.die) };
      const score = scoreBoard(candidateBoard);
      const differential = color === "white"
        ? score.white - score.black
        : score.black - score.white;

      if (!bestMove || differential > bestMove.score) {
        bestMove = { die: move.die, cell: move.cell, score: differential };
      }
    });

    return bestMove;
  }

  return Object.freeze({
    LINE_DEFS,
    MATCH_PRESETS,
    completedLines,
    scoreBoard,
    legalMoves,
    chooseBestMove
  });
});
