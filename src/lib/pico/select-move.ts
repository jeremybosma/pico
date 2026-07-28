import { Chess, type Square } from "chess.js";
import { indexToSquare } from "./features";
import type { PicoMoveScores } from "./client";

export function selectHighestLegalMove(
  chess: Chess,
  scores: PicoMoveScores,
): { from: Square; to: Square; promotion?: "q" } | null {
  const flip = chess.turn() === "b";
  let best: { from: Square; to: Square; promotion?: "q"; score: number } | null =
    null;

  for (const move of chess.moves({ verbose: true })) {
    const fromIndex = squareToIndex(move.from, flip);
    const toIndex = squareToIndex(move.to, flip);
    const score =
      scores.fromLogits[fromIndex]! + scores.toLogits[toIndex]!;
    if (!best || score > best.score) {
      best = {
        from: move.from,
        to: move.to,
        promotion: move.promotion ? "q" : undefined,
        score,
      };
    }
  }

  if (!best) return null;
  return { from: best.from, to: best.to, promotion: best.promotion };
}

function squareToIndex(square: Square, flip: boolean): number {
  // Inverse of indexToSquare
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  let f = file;
  let r = rank;
  if (flip) {
    f = 7 - file;
    r = 7 - rank;
  }
  const row = 7 - r;
  return row * 8 + f;
}

export { indexToSquare };
