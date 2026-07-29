import { Chess } from "chess.js";
import { encodeFeaturesFromFen } from "./features";
import { movePrior, softmaxPriors, uciOf, type PicoUciMove } from "./moves";
import type { PicoRuntime } from "./runtime";

const PUCT_C = 1.5;
export const DEFAULT_PLAY_VISITS = 64;

type Edge = {
  move: PicoUciMove;
  prior: number;
  visits: number;
  valueSum: number;
  child: Node | null;
};

type Node = {
  edges: Edge[];
  /** Network value for the side to move at this node, if evaluated. */
  stmValue: number;
};

export type SearchResult = {
  bestMove: PicoUciMove | null;
  /** White-POV value in [-1, 1] from the root position. */
  whiteValue: number;
  visits: number;
};

function terminalStmValue(chess: Chess): number | null {
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) return -1; // side to move is mated
  return 0;
}

function legalMoves(chess: Chess): PicoUciMove[] {
  return chess.moves({ verbose: true }).map((move) => ({
    from: move.from,
    to: move.to,
    promotion: move.promotion ? ("q" as const) : undefined,
    uci: uciOf(move.from, move.to, move.promotion ? "q" : undefined),
  }));
}

function expand(runtime: PicoRuntime, chess: Chess): Node {
  const terminal = terminalStmValue(chess);
  if (terminal !== null) {
    return { edges: [], stmValue: terminal };
  }

  const moves = legalMoves(chess);
  const inference = runtime.infer(encodeFeaturesFromFen(chess.fen()));
  if (moves.length === 0) {
    return { edges: [], stmValue: inference.value };
  }

  const flip = chess.turn() === "b";
  const logits = moves.map((move) =>
    movePrior(
      inference.fromLogits,
      inference.toLogits,
      move.from,
      move.to,
      flip,
    ),
  );
  const priors = softmaxPriors(logits);

  return {
    stmValue: inference.value,
    edges: moves.map((move, index) => ({
      move,
      prior: priors[index]!,
      visits: 0,
      valueSum: 0,
      child: null,
    })),
  };
}

function selectEdge(node: Node, parentVisits: number): Edge {
  let best = node.edges[0]!;
  let bestScore = -Infinity;

  for (const edge of node.edges) {
    const q = edge.visits > 0 ? edge.valueSum / edge.visits : 0;
    const u =
      PUCT_C * edge.prior * (Math.sqrt(parentVisits) / (1 + edge.visits));
    const score = q + u;
    if (score > bestScore) {
      bestScore = score;
      best = edge;
    }
  }

  return best;
}

/**
 * Backup leaf STM value up the path. For the parent of the leaf, Q = -leafStmValue.
 */
function backup(path: Edge[], leafStmValue: number) {
  let valueForParent = -leafStmValue;
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const edge = path[i]!;
    edge.visits += 1;
    edge.valueSum += valueForParent;
    valueForParent = -valueForParent;
  }
}

/**
 * PUCT search from `fen`. Returned whiteValue is White-POV at the root.
 */
export function runPuctSearch(
  runtime: PicoRuntime,
  fen: string,
  visits: number = DEFAULT_PLAY_VISITS,
): SearchResult {
  const rootChess = new Chess(fen);
  const root = expand(runtime, rootChess);

  if (root.edges.length === 0) {
    const whiteValue =
      rootChess.turn() === "w" ? root.stmValue : -root.stmValue;
    return { bestMove: null, whiteValue, visits: 0 };
  }

  let rootVisits = 0;
  const simulationCount = Math.max(1, visits);

  for (let i = 0; i < simulationCount; i += 1) {
    const chess = new Chess(fen);
    const path: Edge[] = [];
    let node = root;
    let parentVisits = Math.max(1, rootVisits);

    while (true) {
      const edge = selectEdge(node, parentVisits);
      path.push(edge);
      chess.move({
        from: edge.move.from,
        to: edge.move.to,
        promotion: edge.move.promotion,
      });

      if (edge.child === null) {
        edge.child = expand(runtime, chess);
        backup(path, edge.child.stmValue);
        break;
      }

      if (edge.child.edges.length === 0) {
        backup(path, edge.child.stmValue);
        break;
      }

      parentVisits = Math.max(1, edge.visits);
      node = edge.child;
    }

    rootVisits += 1;
  }

  let bestEdge = root.edges[0]!;
  for (const edge of root.edges) {
    if (edge.visits > bestEdge.visits) bestEdge = edge;
  }

  let whiteSum = 0;
  let whiteWeight = 0;
  for (const edge of root.edges) {
    if (edge.visits === 0) continue;
    const rootStmValue = edge.valueSum / edge.visits;
    const whiteValue =
      rootChess.turn() === "w" ? rootStmValue : -rootStmValue;
    whiteSum += whiteValue * edge.visits;
    whiteWeight += edge.visits;
  }

  const fallbackWhite =
    rootChess.turn() === "w" ? root.stmValue : -root.stmValue;

  return {
    bestMove: bestEdge.move,
    whiteValue: whiteWeight > 0 ? whiteSum / whiteWeight : fallbackWhite,
    visits: rootVisits,
  };
}

export function terminalEvalFromChess(chess: Chess): {
  value: number;
  whitePercent: number;
} | null {
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) {
    const whiteMated = chess.turn() === "w";
    return whiteMated
      ? { value: -1, whitePercent: 0 }
      : { value: 1, whitePercent: 100 };
  }
  return { value: 0, whitePercent: 50 };
}
