from __future__ import annotations

import argparse
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import numpy as np

from chess_model.config import (
    CHECKPOINT_DIRECTORY,
    DEFAULT_BATCH_SIZE,
    DEFAULT_EPOCH_COUNT,
    DEFAULT_LEARNING_RATE,
    SOFT_POLICY_LOSS_WEIGHT,
    VALUE_LOSS_WEIGHT,
)
from chess_model.model import PicoNetwork, count_parameters


def load_dataset(path: Path) -> dict[str, np.ndarray]:
    data = np.load(path)
    return {key: data[key] for key in data.files}


def split_dataset(
    dataset: dict[str, np.ndarray],
    validation_fraction: float = 0.1,
) -> tuple[dict[str, np.ndarray], dict[str, np.ndarray]]:
    count = len(dataset["features"])
    # Hold out by game_id buckets when available
    if "game_id" in dataset:
        game_ids = dataset["game_id"]
        unique = np.unique(game_ids)
        rng = np.random.default_rng(0)
        rng.shuffle(unique)
        val_games = set(unique[: max(1, int(len(unique) * validation_fraction))].tolist())
        val_mask = np.asarray([gid in val_games for gid in game_ids])
    else:
        val_mask = np.zeros(count, dtype=bool)
        val_mask[: max(1, int(count * validation_fraction))] = True
        rng = np.random.default_rng(0)
        rng.shuffle(val_mask)

    train = {key: value[~val_mask] for key, value in dataset.items()}
    val = {key: value[val_mask] for key, value in dataset.items()}
    return train, val


def soft_cross_entropy(logits: mx.array, target: mx.array) -> mx.array:
    log_probs = logits - mx.logsumexp(logits, axis=-1, keepdims=True)
    return -mx.sum(target * log_probs, axis=-1).mean()


def batch_loss(model: PicoNetwork, batch: dict[str, mx.array]) -> mx.array:
    from_logits, to_logits, value = model(batch["features"])
    from_loss = soft_cross_entropy(from_logits, batch["from_policy"])
    to_loss = soft_cross_entropy(to_logits, batch["to_policy"])
    value_loss = nn.losses.mse_loss(value, batch["value"])
    return (
        SOFT_POLICY_LOSS_WEIGHT * (from_loss + to_loss) / 2
        + VALUE_LOSS_WEIGHT * value_loss
    )


def iterate_batches(
    dataset: dict[str, np.ndarray],
    batch_size: int,
    shuffle: bool,
    epoch_seed: int,
):
    count = len(dataset["features"])
    indices = np.arange(count)
    if shuffle:
        rng = np.random.default_rng(epoch_seed)
        rng.shuffle(indices)
    for start in range(0, count, batch_size):
        batch_indices = indices[start : start + batch_size]
        yield {
            "features": mx.array(dataset["features"][batch_indices].astype(np.float32)),
            "from_policy": mx.array(
                dataset["from_policy"][batch_indices].astype(np.float32)
            ),
            "to_policy": mx.array(dataset["to_policy"][batch_indices].astype(np.float32)),
            "value": mx.array(dataset["value"][batch_indices].astype(np.float32)),
        }


def evaluate(model: PicoNetwork, dataset: dict[str, np.ndarray], batch_size: int) -> float:
    losses = []
    for batch in iterate_batches(dataset, batch_size, shuffle=False, epoch_seed=0):
        losses.append(float(batch_loss(model, batch).item()))
    return float(np.mean(losses)) if losses else 0.0


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Pico from Stockfish labels")
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=DEFAULT_EPOCH_COUNT)
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--learning-rate", type=float, default=DEFAULT_LEARNING_RATE)
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path(CHECKPOINT_DIRECTORY) / "pico-model.safetensors",
    )
    args = parser.parse_args()

    dataset = load_dataset(args.data)
    train, val = split_dataset(dataset)
    model = PicoNetwork()
    mx.eval(model.parameters())
    print(f"parameters: {count_parameters(model):,}")
    print(f"train {len(train['features']):,} · val {len(val['features']):,}")

    optimizer = optim.Adam(learning_rate=args.learning_rate)
    loss_and_grad = nn.value_and_grad(model, batch_loss)

    best_val = float("inf")
    args.checkpoint.parent.mkdir(parents=True, exist_ok=True)

    for epoch in range(args.epochs):
        running = []
        for batch in iterate_batches(
            train,
            args.batch_size,
            shuffle=True,
            epoch_seed=epoch,
        ):
            loss, grads = loss_and_grad(model, batch)
            optimizer.update(model, grads)
            mx.eval(model.parameters(), optimizer.state)
            running.append(float(loss.item()))

        train_loss = float(np.mean(running))
        val_loss = evaluate(model, val, args.batch_size)
        marker = ""
        if val_loss < best_val:
            best_val = val_loss
            model.save_weights(str(args.checkpoint))
            marker = " · saved"
        print(
            f"epoch {epoch + 1:02d}/{args.epochs} · train {train_loss:.4f} · val {val_loss:.4f}{marker}"
        )

    print(f"best checkpoint: {args.checkpoint} (val {best_val:.4f})")


if __name__ == "__main__":
    main()
