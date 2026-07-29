from __future__ import annotations

import argparse
from pathlib import Path

import chess
import numpy as np

from chess_model.config import (
    DEFAULT_POSITION_COUNT,
    DEFAULT_RANDOM_SEED,
    MAXIMUM_GAME_PLY,
    TEACHER_DEPTH,
    TEACHER_MULTIPV,
)
from chess_model.features import encode_features, move_to_from_to
from chess_model.teacher import StockfishTeacher


def sample_move(
    board: chess.Board,
    from_policy: np.ndarray,
    to_policy: np.ndarray,
    random_generator: np.random.Generator,
) -> chess.Move:
    legal = list(board.legal_moves)
    scores = []
    for move in legal:
        f_idx, t_idx = move_to_from_to(board, move)
        scores.append(float(from_policy[f_idx] * to_policy[t_idx] + 1e-12))
    scores_arr = np.asarray(scores, dtype=np.float64)
    temperature = max(0.4, 1.1 - board.fullmove_number / 40)
    tempered = np.power(scores_arr, 1 / temperature)
    tempered /= tempered.sum()
    index = int(random_generator.choice(len(legal), p=tempered))
    return legal[index]


def generate_dataset(
    teacher: StockfishTeacher,
    position_count: int,
    random_seed: int,
) -> dict[str, np.ndarray]:
    random_generator = np.random.default_rng(random_seed)
    features: list[np.ndarray] = []
    from_policies: list[np.ndarray] = []
    to_policies: list[np.ndarray] = []
    values: list[float] = []
    game_ids: list[int] = []

    board = chess.Board()
    game_id = 0
    ply = 0

    while len(features) < position_count:
        from_policy, to_policy, value = teacher.evaluate(board)
        features.append(encode_features(board))
        from_policies.append(from_policy)
        to_policies.append(to_policy)
        values.append(value)
        game_ids.append(game_id)

        if board.is_game_over() or ply >= MAXIMUM_GAME_PLY:
            board.reset()
            game_id += 1
            ply = 0
        else:
            move = sample_move(board, from_policy, to_policy, random_generator)
            board.push(move)
            ply += 1

        count = len(features)
        if count % 100 == 0 or count == position_count:
            print(
                f"generated {count:,}/{position_count:,} positions · games {game_id}",
                flush=True,
            )

    return {
        "features": np.asarray(features, dtype=np.float16),
        "from_policy": np.asarray(from_policies, dtype=np.float16),
        "to_policy": np.asarray(to_policies, dtype=np.float16),
        "value": np.asarray(values, dtype=np.float16),
        "game_id": np.asarray(game_ids, dtype=np.int32),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Distill positions from Stockfish 18")
    parser.add_argument("--positions", type=int, default=DEFAULT_POSITION_COUNT)
    parser.add_argument("--output", type=Path, default=Path("data/stockfish-distillation.npz"))
    parser.add_argument("--seed", type=int, default=DEFAULT_RANDOM_SEED)
    parser.add_argument("--depth", type=int, default=TEACHER_DEPTH)
    parser.add_argument("--multipv", type=int, default=TEACHER_MULTIPV)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with StockfishTeacher(
        depth=args.depth,
        multipv=args.multipv,
        threads=args.threads,
    ) as teacher:
        print(
            f"teacher: {teacher.engine_path} · depth {args.depth} · MultiPV {args.multipv}",
            flush=True,
        )
        dataset = generate_dataset(teacher, args.positions, args.seed)

    np.savez_compressed(args.output, **dataset)
    print(f"wrote {args.output} ({args.positions:,} positions)", flush=True)


if __name__ == "__main__":
    main()
