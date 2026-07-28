import type { Color, PieceSymbol, Square } from "chess.js";
import { BOARD_SIZE, INPUT_PLANE_COUNT } from "./constants";

const PIECE_ORDER: PieceSymbol[] = ["p", "n", "b", "r", "q", "k"];

function squareToRc(square: Square, flip: boolean): [number, number] {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  let f = file;
  let r = rank;
  if (flip) {
    f = 7 - file;
    r = 7 - rank;
  }
  return [7 - r, f];
}

/** Encode from FEN for parity with the Python teacher/student pipeline. */
export function encodeFeaturesFromFen(fen: string): Float32Array {
  const [placement, turn, castling, ep] = fen.split(" ");
  const features = new Float32Array(BOARD_SIZE * BOARD_SIZE * INPUT_PLANE_COUNT);
  const flip = turn === "b";
  const perspective: Color = turn === "w" ? "w" : "b";

  const ranks = placement.split("/");
  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    const rank = ranks[rankIndex]!;
    let file = 0;
    for (const char of rank) {
      if (char >= "1" && char <= "8") {
        file += Number(char);
        continue;
      }
      const isWhite = char === char.toUpperCase();
      const type = char.toLowerCase() as PieceSymbol;
      const color: Color = isWhite ? "w" : "b";
      const square = `${String.fromCharCode(97 + file)}${8 - rankIndex}` as Square;
      const [r, c] = squareToRc(square, flip);
      const isCurrent = color === perspective;
      const plane = PIECE_ORDER.indexOf(type) + (isCurrent ? 0 : 6);
      features[(r * BOARD_SIZE + c) * INPUT_PLANE_COUNT + plane] = 1;
      file += 1;
    }
  }

  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i += 1) {
    features[i * INPUT_PLANE_COUNT + 12] = 1;
  }

  const rights = castling ?? "-";
  const has = (token: string) => rights.includes(token);
  if (perspective === "w") {
    fillPlane(features, 13, has("Q") ? 1 : 0);
    fillPlane(features, 14, has("K") ? 1 : 0);
    fillPlane(features, 15, has("q") ? 1 : 0);
    fillPlane(features, 16, has("k") ? 1 : 0);
  } else {
    fillPlane(features, 13, has("q") ? 1 : 0);
    fillPlane(features, 14, has("k") ? 1 : 0);
    fillPlane(features, 15, has("Q") ? 1 : 0);
    fillPlane(features, 16, has("K") ? 1 : 0);
  }

  if (ep && ep !== "-") {
    const [r, c] = squareToRc(ep as Square, flip);
    features[(r * BOARD_SIZE + c) * INPUT_PLANE_COUNT + 12] = 0.5;
  }

  return features;
}

function fillPlane(features: Float32Array, plane: number, value: number) {
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i += 1) {
    features[i * INPUT_PLANE_COUNT + plane] = value;
  }
}

export function indexToSquare(index: number, flip: boolean): Square {
  const row = Math.floor(index / BOARD_SIZE);
  const col = index % BOARD_SIZE;
  let rank = 7 - row;
  let file = col;
  if (flip) {
    rank = 7 - rank;
    file = 7 - file;
  }
  return `${String.fromCharCode(97 + file)}${rank + 1}` as Square;
}
