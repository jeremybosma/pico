"use client";

import { Chess, type Square } from "chess.js";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ChessBoard } from "@/components/chess-board";
import { EvalBar } from "@/components/eval-bar";
import { Spinner } from "@/components/spinner";
import { PicoClient } from "@/lib/pico/client";
import { encodeFeaturesFromFen } from "@/lib/pico/features";
import { selectHighestLegalMove } from "@/lib/pico/select-move";

type PlayState = "idle" | "playing" | "thinking" | "ended";

function materialCount(chess: Chess) {
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  let white = 0;
  let black = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.type === "k") continue;
      const v = values[piece.type] ?? 0;
      if (piece.color === "w") white += v;
      else black += v;
    }
  }
  return { white, black };
}

export function PlayPico() {
  const clientRef = useRef<PicoClient | null>(null);
  const chessRef = useRef(new Chess());
  const playToken = useRef(0);

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Loading Pico…");
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [fen, setFen] = useState(() => chessRef.current.fen());
  const [selected, setSelected] = useState<Square | null>(null);
  const [targets, setTargets] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(
    null,
  );
  const [lastSan, setLastSan] = useState<string | null>(null);
  const [placedSquare, setPlacedSquare] = useState<Square | null>(null);
  const [invalidShake, setInvalidShake] = useState(false);
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w");
  const [value, setValue] = useState(0);
  const [whitePercent, setWhitePercent] = useState(50);
  const [hoverPlay, setHoverPlay] = useState(false);
  const [inferMs, setInferMs] = useState<number | null>(null);

  const syncBoard = useEffectEvent(() => {
    setFen(chessRef.current.fen());
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = await PicoClient.create();
        if (cancelled) {
          client.dispose();
          return;
        }
        clientRef.current = client;
        setReady(true);
        setStatus((current) =>
          current === "Loading Pico…" ? "Ready" : current,
        );
      } catch (error) {
        if (!cancelled) {
          setStatus(
            error instanceof Error ? error.message : "Failed to load Pico",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      clientRef.current?.dispose();
    };
  }, []);

  const applyValue = useEffectEvent((sideToMove: "w" | "b", v: number) => {
    // Model value is for side-to-move; convert to white win %.
    const whiteValue = sideToMove === "w" ? v : -v;
    setValue(whiteValue);
    setWhitePercent(Math.round(((whiteValue + 1) / 2) * 100));
  });

  const engineMove = useEffectEvent(async () => {
    const client = clientRef.current;
    const chess = chessRef.current;
    if (!client || chess.isGameOver()) return;

    const token = ++playToken.current;
    setPlayState("thinking");
    setStatus("Pico is thinking…");

    try {
      const started = performance.now();
      const features = encodeFeaturesFromFen(chess.fen());
      const scores = await client.infer(features);
      const elapsed = performance.now() - started;
      if (token !== playToken.current) return;

      setInferMs(elapsed);
      applyValue(chess.turn(), scores.value);

      const choice = selectHighestLegalMove(chess, scores);
      if (!choice) {
        setPlayState("ended");
        setStatus("Game over");
        return;
      }

      const move = chess.move({
        from: choice.from,
        to: choice.to,
        promotion: choice.promotion,
      });
      if (!move) return;

      setLastMove({ from: move.from, to: move.to });
      setLastSan(move.san);
      setPlacedSquare(move.to);
      syncBoard();

      if (chess.isGameOver()) {
        setPlayState("ended");
        setStatus(endMessage(chess, move.san, playerColor));
      } else {
        window.setTimeout(() => setPlacedSquare(null), 420);
        setPlayState("playing");
        setStatus("Your move");
      }
    } catch {
      if (token === playToken.current) {
        setPlayState("playing");
        setStatus("Your move");
      }
    }
  });

  function endMessage(
    chess: Chess,
    san: string | null,
    you: "w" | "b",
  ) {
    const moveLabel = san ? ` · ${san}` : "";
    if (chess.isCheckmate()) {
      const winner: "w" | "b" = chess.turn() === "w" ? "b" : "w";
      const youWon = winner === you;
      return youWon
        ? `You win by checkmate${moveLabel}`
        : `Pico wins by checkmate${moveLabel}`;
    }
    if (chess.isStalemate()) return `Draw by stalemate${moveLabel}`;
    if (chess.isThreefoldRepetition()) return `Draw by repetition${moveLabel}`;
    if (chess.isInsufficientMaterial()) {
      return `Draw by insufficient material${moveLabel}`;
    }
    if (chess.isDraw()) return `Draw${moveLabel}`;
    return `Game over${moveLabel}`;
  }

  async function startGame(color: "w" | "b" = "w") {
    if (!ready) return;
    playToken.current += 1;
    const chess = new Chess();
    chessRef.current = chess;
    setPlayerColor(color);
    setSelected(null);
    setTargets([]);
    setLastMove(null);
    setLastSan(null);
    setPlacedSquare(null);
    setValue(0);
    setWhitePercent(50);
    syncBoard();
    setPlayState("playing");
    setStatus(color === "w" ? "Your move" : "Pico is thinking…");
    setHoverPlay(false);
    if (color === "b") void engineMove();
  }

  function onSquareClick(square: Square) {
    const chess = chessRef.current;
    if (playState !== "playing" || chess.isGameOver()) return;
    if (chess.turn() !== playerColor) return;

    if (selected) {
      if (selected === square) {
        setSelected(null);
        setTargets([]);
        return;
      }

      const legal = chess
        .moves({ square: selected, verbose: true })
        .find((m) => m.to === square);

      if (legal) {
        const move = chess.move({
          from: selected,
          to: square,
          promotion: "q",
        });
        setSelected(null);
        setTargets([]);
        if (move) {
          setLastMove({ from: move.from, to: move.to });
          setLastSan(move.san);
          setPlacedSquare(move.to);
          syncBoard();
          if (chess.isGameOver()) {
            setPlayState("ended");
            setStatus(endMessage(chess, move.san, playerColor));
          } else {
            window.setTimeout(() => setPlacedSquare(null), 420);
            void engineMove();
          }
        }
        return;
      }

      bumpInvalid();
    }

    const piece = chess.get(square);
    if (!piece || piece.color !== playerColor) {
      if (selected) bumpInvalid();
      return;
    }

    setSelected(square);
    setTargets(chess.moves({ square, verbose: true }).map((m) => m.to));
  }

  function bumpInvalid() {
    setInvalidShake(true);
    window.setTimeout(() => setInvalidShake(false), 180);
  }

  const chess = chessRef.current;
  const material = materialCount(chess);
  const side = chess.turn() === "w" ? "White" : "Black";
  const moveNo = chess.moveNumber();
  const showOverlay = playState === "idle" || hoverPlay;
  const interactive = playState === "playing";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 sm:gap-3">
        <EvalBar whitePercent={whitePercent} />
        <div
          className="relative"
          onMouseEnter={() => playState === "idle" && setHoverPlay(true)}
          onMouseLeave={() => setHoverPlay(false)}
        >
          <ChessBoard
            board={chess.board()}
            decisive={playState === "ended"}
            disabled={!interactive}
            invalidShake={invalidShake}
            lastMove={lastMove}
            orientation={playerColor}
            placedSquare={placedSquare}
            selected={selected}
            targets={targets}
            onSquareClick={onSquareClick}
          />

          {showOverlay ? (
            <div className="pointer-events-none absolute inset-0 z-20 hidden items-center justify-center sm:flex">
              <button
                className="pointer-events-auto inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-neutral-300 bg-white px-5 py-2 font-[family-name:var(--font-inter)] text-sm font-normal text-neutral-700 shadow-lg hover:border-neutral-400 hover:bg-neutral-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:pointer-events-none disabled:opacity-60"
                disabled={!ready}
                onClick={() => void startGame("w")}
                type="button"
              >
                Play against Pico
              </button>
            </div>
          ) : null}

          {playState === "ended" ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3">
              <div className="pointer-events-auto max-w-[min(100%,20rem)] rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 text-center shadow-lg backdrop-blur-sm">
                <p className="font-[family-name:var(--font-inter)] text-sm font-medium text-neutral-900">
                  {status}
                </p>
                {lastSan && lastMove ? (
                  <p className="mt-1 font-[family-name:var(--font-inter)] text-xs text-neutral-500">
                    Last move{" "}
                    <span className="font-medium text-neutral-800 tabular-nums">
                      {lastSan}
                    </span>{" "}
                    <span className="text-neutral-400">
                      {lastMove.from}→{lastMove.to}
                    </span>
                  </p>
                ) : null}
                <button
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-full bg-neutral-900 px-4 py-2 font-[family-name:var(--font-inter)] text-sm font-normal text-white hover:bg-black active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
                  onClick={() => void startGame(playerColor)}
                  type="button"
                >
                  New game
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-3 py-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p
          aria-live="polite"
          className={[
            "flex min-h-8 min-w-0 flex-1 items-center gap-1.5 font-[family-name:var(--font-inter)] text-sm font-normal",
            playState === "ended" ? "text-neutral-900" : "text-neutral-500",
          ].join(" ")}
        >
          {!ready || playState === "thinking" ? <Spinner /> : null}
          {status}
        </p>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:justify-start">
          {playState === "playing" || playState === "thinking" ? (
            <>
              <button
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-neutral-300 px-4 py-2 font-[family-name:var(--font-inter)] text-sm font-normal text-neutral-700 hover:border-neutral-400 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
                disabled={playState === "thinking"}
                onClick={() => void startGame(playerColor === "w" ? "b" : "w")}
                type="button"
              >
                Flip · play as {playerColor === "w" ? "Black" : "White"}
              </button>
              <button
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-neutral-900 px-4 py-2 font-[family-name:var(--font-inter)] text-base font-normal text-white hover:bg-black active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
                onClick={() => void startGame(playerColor)}
                type="button"
              >
                New game
              </button>
            </>
          ) : null}
          {playState === "idle" ? (
            <button
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-neutral-900 px-4 py-2 font-[family-name:var(--font-inter)] text-base font-normal text-white hover:bg-black active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:pointer-events-none disabled:opacity-60 sm:hidden"
              disabled={!ready}
              onClick={() => void startGame("w")}
              type="button"
            >
              Play against Pico
            </button>
          ) : null}
        </div>
      </div>

      <dl
        aria-label="Pico debug analysis"
        className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-neutral-100/70 p-3 font-[family-name:var(--font-inter)] tabular-nums sm:grid-cols-4"
      >
        <div className="min-w-0">
          <dt className="text-xs font-normal text-neutral-500">Move</dt>
          <dd className="truncate text-sm font-normal text-neutral-900">
            {moveNo} · {side} next
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-normal text-neutral-500">Value</dt>
          <dd className="truncate text-sm font-normal text-neutral-900">
            {value >= 0 ? "+" : ""}
            {value.toFixed(2)} · W {whitePercent}%
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-normal text-neutral-500">White</dt>
          <dd className="truncate text-sm font-normal text-neutral-900">
            {material.white} material
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-normal text-neutral-500">Black</dt>
          <dd className="truncate text-sm font-normal text-neutral-900">
            {material.black} material
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-normal text-neutral-500">Inference</dt>
          <dd className="truncate text-sm font-normal text-neutral-900">
            {inferMs !== null ? `${inferMs.toFixed(1)} ms` : "—"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-normal text-neutral-500">Check</dt>
          <dd className="truncate text-sm font-normal text-neutral-900">
            {chess.isCheck() ? "Yes" : "No"}
            {chess.isCheckmate() ? " · mate" : ""}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-normal text-neutral-500">Payload</dt>
          <dd className="truncate text-sm font-normal text-neutral-900">
            INT8 · Worker
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-normal text-neutral-500">Teacher</dt>
          <dd className="truncate text-sm font-normal text-neutral-900">
            Stockfish 18
          </dd>
        </div>
      </dl>

      <span className="sr-only">{fen}</span>
    </div>
  );
}
