import { Chess, type Square } from "chess.js";
import type { PicoMoveScores } from "./client";
import { indexToSquare } from "./features";
import { movePrior } from "./moves";

export function selectHighestLegalMove(
  chess: Chess,
  scores: PicoMoveScores,
): { from: Square; to: Square; promotion?: "q" } | null {
  const flip = chess.turn() === "b";
  let best: { from: Square; to: Square; promotion?: "q"; score: number } | null =
    null;

  for (const move of chess.moves({ verbose: true })) {
    const score = movePrior(
      scores.fromLogits,
      scores.toLogits,
      move.from,
      move.to,
      flip,
    );
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

export { indexToSquare };
