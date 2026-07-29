"use client";

import { Chess } from "chess.js";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/spinner";
import { PicoClient } from "@/lib/pico/client";

/** Lighter than play (64) so self-play demos stay responsive. */
const ROLLOUT_VISITS = 24;

type GameResult = "1-0" | "0-1" | "½-½" | "…";

type RolloutGame = {
  id: number;
  moves: number;
  result: GameResult;
  lastSan: string;
  running: boolean;
};

function resultOf(chess: Chess): GameResult {
  if (!chess.isGameOver()) return "…";
  if (chess.isCheckmate()) return chess.turn() === "w" ? "0-1" : "1-0";
  return "½-½";
}

export function Rollouts() {
  const [count, setCount] = useState(8);
  const [games, setGames] = useState<RolloutGame[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Ready.");
  const abortRef = useRef(false);
  const clientRef = useRef<PicoClient | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      clientRef.current?.dispose();
    };
  }, []);

  async function runRollouts() {
    if (running) return;
    abortRef.current = false;
    setRunning(true);
    setStatus("Loading Pico…");

    const initial: RolloutGame[] = Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      moves: 0,
      result: "…",
      lastSan: "—",
      running: true,
    }));
    setGames(initial);

    try {
      if (!clientRef.current) {
        clientRef.current = await PicoClient.create();
      }
      const client = clientRef.current;
      setStatus(`Running ${count} self-play games…`);

      for (let index = 0; index < count; index += 1) {
        if (abortRef.current) break;
        const chess = new Chess();
        let ply = 0;
        const maxPly = 80;
        const diversity = 0.7 + (index % 5) * 0.08;

        while (!chess.isGameOver() && ply < maxPly && !abortRef.current) {
          // Occasional noise: fewer visits to diversify games.
          const visits =
            Math.random() < 0.2
              ? Math.max(8, Math.floor(ROLLOUT_VISITS * (0.4 + diversity * 0.3)))
              : ROLLOUT_VISITS;
          const result = await client.search(chess.fen(), visits);
          if (!result.bestMove) break;
          const move = chess.move({
            from: result.bestMove.from,
            to: result.bestMove.to,
            promotion: result.bestMove.promotion,
          });
          if (!move) break;
          ply += 1;
          setGames((prev) =>
            prev.map((g) =>
              g.id === index + 1
                ? {
                    ...g,
                    moves: Math.ceil(ply / 2),
                    lastSan: move.san,
                    result: resultOf(chess),
                  }
                : g,
            ),
          );
        }

        setGames((prev) =>
          prev.map((g) =>
            g.id === index + 1
              ? {
                  ...g,
                  running: false,
                  result: resultOf(chess),
                  moves: Math.ceil(chess.history().length / 2),
                }
              : g,
          ),
        );
      }

      setStatus(abortRef.current ? "Stopped." : "Done.");
    } catch {
      setStatus("Rollouts failed — is the model exported?");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section aria-labelledby="rollouts-heading" className="space-y-3 pt-2">
      <h2 className="font-medium" id="rollouts-heading">
        Rollouts
      </h2>
      <p className="text-neutral-700">
        Run Pico against itself with light PUCT search ({ROLLOUT_VISITS} visits).
        Visit budgets vary slightly so the games diverge.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {[8, 16, 32].map((n) => (
          <button
            key={n}
            aria-pressed={count === n}
            className={[
              "inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 font-[family-name:var(--font-inter)] text-sm font-normal active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900",
              count === n
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-700 hover:border-neutral-400",
            ].join(" ")}
            disabled={running}
            onClick={() => setCount(n)}
            type="button"
          >
            {n} games
          </button>
        ))}
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-neutral-900 px-4 py-2 font-[family-name:var(--font-inter)] text-base font-normal text-white hover:bg-black active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:pointer-events-none disabled:opacity-60"
          disabled={running}
          onClick={() => void runRollouts()}
          type="button"
        >
          Run rollouts
        </button>
      </div>

      <p
        aria-live="polite"
        className="flex min-h-8 items-center gap-1.5 font-[family-name:var(--font-inter)] text-sm text-neutral-500"
      >
        {running ? <Spinner /> : null}
        {status}
      </p>

      {games.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-lg border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-neutral-500">
                <th className="py-2 pr-4 font-normal">Game</th>
                <th className="px-4 py-2 font-normal">Moves</th>
                <th className="px-4 py-2 font-normal">Last</th>
                <th className="py-2 pl-4 text-right font-normal">Result</th>
              </tr>
            </thead>
            <tbody className="[&_tr:not(:last-child)]:border-b [&_tr:not(:last-child)]:border-neutral-200">
              {games.map((game) => (
                <tr key={game.id}>
                  <td className="py-2 pr-4">#{game.id}</td>
                  <td className="px-4 py-2 tabular-nums">{game.moves}</td>
                  <td className="px-4 py-2 font-[family-name:var(--font-inter)]">
                    {game.lastSan}
                  </td>
                  <td className="py-2 pl-4 text-right tabular-nums">
                    {game.running ? "…" : game.result}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
