import type { Square } from "chess.js";

export type PicoUciMove = {
  from: Square;
  to: Square;
  promotion?: "q";
  uci: string;
};

export function squareToIndex(square: Square, flip: boolean): number {
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

export function movePrior(
  fromLogits: Float32Array,
  toLogits: Float32Array,
  from: Square,
  to: Square,
  flip: boolean,
): number {
  const fromIndex = squareToIndex(from, flip);
  const toIndex = squareToIndex(to, flip);
  return fromLogits[fromIndex]! + toLogits[toIndex]!;
}

export function softmaxPriors(logits: number[]): Float32Array {
  if (logits.length === 0) return new Float32Array(0);
  let max = -Infinity;
  for (const logit of logits) max = Math.max(max, logit);
  const weights = logits.map((logit) => Math.exp(logit - max));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return Float32Array.from(weights.map((weight) => weight / sum));
}

export function uciOf(from: Square, to: Square, promotion?: "q"): string {
  return promotion ? `${from}${to}${promotion}` : `${from}${to}`;
}
