"use client";

import type { CSSProperties } from "react";
import type { Color, PieceSymbol, Square } from "chess.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

const PIECES: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

export type BoardSquare = {
  square: Square;
  type: PieceSymbol;
  color: Color;
} | null;

type ChessBoardProps = {
  board: BoardSquare[][];
  orientation?: Color;
  selected?: Square | null;
  targets?: Square[];
  lastMove?: { from: Square; to: Square } | null;
  placedSquare?: Square | null;
  /** Stronger highlight for the move that ended the game. */
  decisive?: boolean;
  invalidShake?: boolean;
  disabled?: boolean;
  onSquareClick?: (square: Square) => void;
};

function squareAt(file: number, rank: number): Square {
  return `${FILES[file]}${RANKS[rank]}` as Square;
}

export function ChessBoard({
  board,
  orientation = "w",
  selected = null,
  targets = [],
  lastMove = null,
  placedSquare = null,
  decisive = false,
  invalidShake = false,
  disabled = false,
  onSquareClick,
}: ChessBoardProps) {
  const flipped = orientation === "b";
  const targetSet = new Set(targets);

  return (
    <div
      className={`group relative cursor-default ${invalidShake ? "pico-invalid-move" : ""}`}
      style={
        {
          "--pico-invalid-move-offset": "0.12rem",
          animationDuration: "180ms",
        } as CSSProperties
      }
    >
      <div
        aria-label="Chess board"
        className="relative aspect-square w-full overflow-hidden rounded-[11px] border-2 border-[#b9803f] bg-[#d9a45f] shadow-[0_1px_2px_rgba(75,44,13,0.18),inset_0_1px_0_rgba(255,255,255,0.28)]"
        role="grid"
      >
        <div className="absolute inset-[3.5%] grid grid-cols-8 grid-rows-8 overflow-hidden rounded-[6px]">
          {Array.from({ length: 64 }, (_, index) => {
            const row = Math.floor(index / 8);
            const col = index % 8;
            const boardRow = flipped ? 7 - row : row;
            const boardCol = flipped ? 7 - col : col;
            const square = squareAt(boardCol, boardRow);
            const piece = board[boardRow]?.[boardCol] ?? null;
            const isLight = (boardRow + boardCol) % 2 === 1;
            const isSelected = selected === square;
            const isTarget = targetSet.has(square);
            const isLast =
              lastMove?.from === square || lastMove?.to === square;
            const justPlaced = placedSquare === square;

            return (
              <button
                key={square}
                aria-label={
                  piece
                    ? `${piece.color === "w" ? "White" : "Black"} ${piece.type} on ${square}`
                    : `Empty square ${square}`
                }
                className={[
                  "relative flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-neutral-900",
                  disabled
                    ? "pointer-events-none"
                    : "enabled:cursor-pointer",
                  isLight ? "bg-[#f0d2a0]" : "bg-[#c78a45]",
                  isLast && !decisive
                    ? "after:absolute after:inset-0 after:bg-[#f6e27a55]"
                    : "",
                  isLast && decisive
                    ? "after:absolute after:inset-0 after:bg-[#f0c14b88] ring-2 ring-inset ring-neutral-900/55"
                    : "",
                  isSelected ? "ring-2 ring-inset ring-neutral-900/70" : "",
                ].join(" ")}
                disabled={disabled}
                onClick={() => onSquareClick?.(square)}
                type="button"
              >
                {isTarget && !piece ? (
                  <span
                    aria-hidden="true"
                    className="size-[28%] rounded-full bg-neutral-900/22"
                  />
                ) : null}
                {isTarget && piece ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-[8%] rounded-full border-[3px] border-neutral-900/25"
                  />
                ) : null}
                {piece ? (
                  <span
                    aria-hidden="true"
                    className={[
                      "select-none text-[clamp(1.45rem,5.6vw,2.35rem)] leading-none",
                      piece.color === "w"
                        ? "text-neutral-50 [text-shadow:0_1px_0_rgba(0,0,0,0.35),0_0_1px_rgba(0,0,0,0.55)]"
                        : "text-neutral-950 [text-shadow:0_1px_0_rgba(255,255,255,0.2)]",
                      justPlaced ? "chess-piece-placement" : "",
                    ].join(" ")}
                  >
                    {PIECES[piece.color][piece.type]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
