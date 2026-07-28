import mlx.core as mx
import mlx.nn as nn

from chess_model.config import (
    BOARD_AREA,
    FROM_MOVE_COUNT,
    INPUT_PLANE_COUNT,
    RESIDUAL_BLOCK_COUNT,
    TO_MOVE_COUNT,
    TRUNK_CHANNEL_COUNT,
    VALUE_CHANNEL_COUNT,
    VALUE_HIDDEN_COUNT,
)


class ResidualBlock(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.first_convolution = nn.Conv2d(
            TRUNK_CHANNEL_COUNT,
            TRUNK_CHANNEL_COUNT,
            kernel_size=3,
            padding=1,
        )
        self.second_convolution = nn.Conv2d(
            TRUNK_CHANNEL_COUNT,
            TRUNK_CHANNEL_COUNT,
            kernel_size=3,
            padding=1,
        )

    def __call__(self, inputs: mx.array) -> mx.array:
        hidden = nn.relu(self.first_convolution(inputs))
        return nn.relu(inputs + self.second_convolution(hidden))


class PicoNetwork(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.stem = nn.Conv2d(
            INPUT_PLANE_COUNT,
            TRUNK_CHANNEL_COUNT,
            kernel_size=3,
            padding=1,
        )
        self.residual_blocks = [ResidualBlock() for _ in range(RESIDUAL_BLOCK_COUNT)]
        self.to_convolution = nn.Conv2d(
            TRUNK_CHANNEL_COUNT,
            1,
            kernel_size=1,
        )
        self.from_linear = nn.Linear(TRUNK_CHANNEL_COUNT, FROM_MOVE_COUNT)
        self.value_convolution = nn.Conv2d(
            TRUNK_CHANNEL_COUNT,
            VALUE_CHANNEL_COUNT,
            kernel_size=1,
        )
        self.value_hidden = nn.Linear(
            VALUE_CHANNEL_COUNT * BOARD_AREA,
            VALUE_HIDDEN_COUNT,
        )
        self.value_output = nn.Linear(VALUE_HIDDEN_COUNT, 1)

    def __call__(self, inputs: mx.array) -> tuple[mx.array, mx.array, mx.array]:
        # inputs: (N, 8, 8, C)
        hidden = nn.relu(self.stem(inputs))
        for block in self.residual_blocks:
            hidden = block(hidden)

        to_logits = self.to_convolution(hidden)  # (N, 8, 8, 1)
        to_logits = to_logits.reshape(inputs.shape[0], TO_MOVE_COUNT)

        pooled = mx.mean(hidden, axis=(1, 2))  # (N, C)
        from_logits = self.from_linear(pooled)

        value_map = nn.relu(self.value_convolution(hidden))
        value_flat = value_map.reshape(inputs.shape[0], -1)
        value = mx.tanh(self.value_output(nn.relu(self.value_hidden(value_flat))))
        value = value.reshape(inputs.shape[0])
        return from_logits, to_logits, value


def count_parameters(model: PicoNetwork) -> int:
    total = 0
    for value in model.parameters().values():
        if isinstance(value, dict):
            continue
    # Walk leaf arrays
    def walk(tree: object) -> None:
        nonlocal total
        if isinstance(tree, dict):
            for child in tree.values():
                walk(child)
        elif isinstance(tree, list):
            for child in tree:
                walk(child)
        else:
            total += int(np_prod(tree.shape))

    def np_prod(shape: tuple[int, ...]) -> int:
        product = 1
        for dim in shape:
            product *= int(dim)
        return product

    walk(model.parameters())
    return total
