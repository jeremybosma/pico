"""Stockfish 18 teacher — the full native engine, not the lite WASM build."""

from __future__ import annotations

import math
import shutil
from pathlib import Path

import chess
import chess.engine
import numpy as np

from chess_model.config import (
    BOARD_AREA,
    POLICY_TEMPERATURE,
    TEACHER_DEPTH,
    TEACHER_MULTIPV,
)
from chess_model.features import move_to_from_to


def find_stockfish() -> str:
    candidates = [
        shutil.which("stockfish"),
        "/opt/homebrew/bin/stockfish",
        "/usr/local/bin/stockfish",
        str(Path("teachers/stockfish")),
    ]
    for path in candidates:
        if path and Path(path).exists():
            return path
    raise FileNotFoundError(
        "Stockfish not found. Install with `brew install stockfish` "
        "or place a binary at teachers/stockfish."
    )


class StockfishTeacher:
    def __init__(
        self,
        engine_path: str | None = None,
        depth: int = TEACHER_DEPTH,
        multipv: int = TEACHER_MULTIPV,
        threads: int = 2,
        hash_mb: int = 128,
    ) -> None:
        self.engine_path = engine_path or find_stockfish()
        self.depth = depth
        self.multipv = multipv
        self.engine = chess.engine.SimpleEngine.popen_uci(self.engine_path)
        self.engine.configure({"Threads": threads, "Hash": hash_mb})

    def close(self) -> None:
        self.engine.quit()

    def __enter__(self) -> StockfishTeacher:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def evaluate(
        self,
        board: chess.Board,
    ) -> tuple[np.ndarray, np.ndarray, float]:
        """Return (from_policy[64], to_policy[64], value in [-1, 1] for side to move)."""
        legal_moves = list(board.legal_moves)
        if not legal_moves:
            from_policy = np.zeros(BOARD_AREA, dtype=np.float32)
            to_policy = np.zeros(BOARD_AREA, dtype=np.float32)
            if board.is_checkmate():
                return from_policy, to_policy, -1.0
            return from_policy, to_policy, 0.0

        limit = chess.engine.Limit(depth=self.depth)
        multipv = min(self.multipv, len(legal_moves))
        info = self.engine.analyse(board, limit, multipv=multipv)
        if isinstance(info, dict):
            info_list = [info]
        else:
            info_list = list(info)

        move_scores: dict[chess.Move, float] = {}
        root_score: chess.engine.PovScore | None = None

        for entry in info_list:
            pv = entry.get("pv") or []
            if not pv:
                continue
            move = pv[0]
            score = entry.get("score")
            if score is None:
                continue
            if root_score is None:
                root_score = score
            # Score from side-to-move POV
            pov = score.pov(board.turn)
            if pov.is_mate():
                mate = pov.mate()
                assert mate is not None
                cp = 10_000 - abs(mate) * 10
                cp = cp if mate > 0 else -cp
            else:
                cp = float(pov.score(mate_score=10_000))
            move_scores[move] = cp

        if not move_scores:
            # Fallback: uniform over legal
            from_policy = np.zeros(BOARD_AREA, dtype=np.float32)
            to_policy = np.zeros(BOARD_AREA, dtype=np.float32)
            weight = 1.0 / len(legal_moves)
            for move in legal_moves:
                f_idx, t_idx = move_to_from_to(board, move)
                from_policy[f_idx] += weight
                to_policy[t_idx] += weight
            return from_policy, to_policy, 0.0

        # Softmax over teacher MultiPV scores → soft policy mass on from/to
        moves = list(move_scores.keys())
        logits = np.asarray(
            [move_scores[m] / (100.0 * POLICY_TEMPERATURE) for m in moves],
            dtype=np.float64,
        )
        logits -= logits.max()
        weights = np.exp(logits)
        weights /= weights.sum()

        from_policy = np.zeros(BOARD_AREA, dtype=np.float32)
        to_policy = np.zeros(BOARD_AREA, dtype=np.float32)
        for move, weight in zip(moves, weights, strict=True):
            f_idx, t_idx = move_to_from_to(board, move)
            from_policy[f_idx] += float(weight)
            to_policy[t_idx] += float(weight)

        # Value from root score
        if root_score is None:
            value = 0.0
        else:
            pov = root_score.pov(board.turn)
            if pov.is_mate():
                mate = pov.mate()
                assert mate is not None
                value = 1.0 if mate > 0 else -1.0
            else:
                cp = float(pov.score(mate_score=10_000))
                value = math.tanh(cp / 400.0)

        return from_policy, to_policy, float(value)
