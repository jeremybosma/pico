from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import mlx.core as mx
import numpy as np

from chess_model.config import (
    BOARD_SIZE,
    FROM_MOVE_COUNT,
    INPUT_PLANE_COUNT,
    INT8_MAXIMUM_VALUE,
    MAXIMUM_MODEL_BYTES,
    MODEL_DIRECTORY,
    RESIDUAL_BLOCK_COUNT,
    TO_MOVE_COUNT,
    TRUNK_CHANNEL_COUNT,
    VALUE_CHANNEL_COUNT,
    VALUE_HIDDEN_COUNT,
)
from chess_model.model import PicoNetwork, count_parameters


def get_named_parameters(model: PicoNetwork) -> list[tuple[str, mx.array]]:
    named: list[tuple[str, mx.array]] = [
        ("stem.weight", model.stem.weight),
        ("stem.bias", model.stem.bias),
    ]
    for index, block in enumerate(model.residual_blocks):
        prefix = f"residual.{index}"
        named.extend(
            [
                (f"{prefix}.first.weight", block.first_convolution.weight),
                (f"{prefix}.first.bias", block.first_convolution.bias),
                (f"{prefix}.second.weight", block.second_convolution.weight),
                (f"{prefix}.second.bias", block.second_convolution.bias),
            ]
        )
    named.extend(
        [
            ("to.convolution.weight", model.to_convolution.weight),
            ("to.convolution.bias", model.to_convolution.bias),
            ("from.linear.weight", model.from_linear.weight),
            ("from.linear.bias", model.from_linear.bias),
            ("value.convolution.weight", model.value_convolution.weight),
            ("value.convolution.bias", model.value_convolution.bias),
            ("value.hidden.weight", model.value_hidden.weight),
            ("value.hidden.bias", model.value_hidden.bias),
            ("value.output.weight", model.value_output.weight),
            ("value.output.bias", model.value_output.bias),
        ]
    )
    return named


def append_aligned(chunks: bytearray, values: bytes) -> int:
    while len(chunks) % 4:
        chunks.append(0)
    offset = len(chunks)
    chunks.extend(values)
    return offset


def export_model(checkpoint_path: Path, output_directory: Path) -> tuple[Path, Path]:
    model = PicoNetwork()
    model.load_weights(str(checkpoint_path))
    mx.eval(model.parameters())

    binary = bytearray()
    tensors: dict[str, dict[str, object]] = {}

    for name, parameter in get_named_parameters(model):
        values = np.asarray(parameter, dtype=np.float32)
        if name.endswith(".weight"):
            output_channel_count = values.shape[0]
            flattened = values.reshape(output_channel_count, -1)
            scales = np.max(np.abs(flattened), axis=1) / INT8_MAXIMUM_VALUE
            scales = np.maximum(scales, np.finfo(np.float32).eps).astype(np.float32)
            quantized = np.rint(flattened / scales[:, None]).clip(
                -INT8_MAXIMUM_VALUE,
                INT8_MAXIMUM_VALUE,
            ).astype(np.int8).reshape(values.shape)
            weight_offset = append_aligned(binary, quantized.tobytes())
            scale_offset = append_aligned(binary, scales.tobytes())
            tensors[name] = {
                "dtype": "int8",
                "shape": list(values.shape),
                "dataOffset": weight_offset,
                "scaleOffset": scale_offset,
            }
        else:
            offset = append_aligned(binary, values.tobytes())
            tensors[name] = {
                "dtype": "float32",
                "shape": list(values.shape),
                "dataOffset": offset,
            }

    if len(binary) > MAXIMUM_MODEL_BYTES:
        raise SystemExit(
            f"model is {len(binary):,} bytes; budget is {MAXIMUM_MODEL_BYTES:,}"
        )

    digest = hashlib.sha256(binary).hexdigest()
    output_directory.mkdir(parents=True, exist_ok=True)
    bin_path = output_directory / "chess-model.bin"
    json_path = output_directory / "chess-model.json"
    bin_path.write_bytes(binary)

    manifest = {
        "format": "pico-chess-int8",
        "version": 1,
        "sha256": digest,
        "parameterCount": count_parameters(model),
        "architecture": {
            "boardSize": BOARD_SIZE,
            "inputPlaneCount": INPUT_PLANE_COUNT,
            "trunkChannelCount": TRUNK_CHANNEL_COUNT,
            "residualBlockCount": RESIDUAL_BLOCK_COUNT,
            "fromMoveCount": FROM_MOVE_COUNT,
            "toMoveCount": TO_MOVE_COUNT,
            "valueChannelCount": VALUE_CHANNEL_COUNT,
            "valueHiddenCount": VALUE_HIDDEN_COUNT,
        },
        "tensors": tensors,
    }
    json_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"exported {bin_path} ({len(binary):,} bytes) · sha256 {digest[:12]}")
    print(f"manifest {json_path}")
    return bin_path, json_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Pico INT8 browser weights")
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path("checkpoints/pico-model.safetensors"),
    )
    parser.add_argument("--output", type=Path, default=Path(MODEL_DIRECTORY))
    args = parser.parse_args()
    export_model(args.checkpoint, args.output)
    # Also copy into Next public/
    public = Path("public/model")
    public.mkdir(parents=True, exist_ok=True)
    for name in ("chess-model.bin", "chess-model.json"):
        source = args.output / name
        target = public / name
        target.write_bytes(source.read_bytes())
    print(f"copied browser assets to {public}")


if __name__ == "__main__":
    main()
