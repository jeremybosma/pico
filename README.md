# Pico

A cute chess-playing model.

Pico v1 is an 89,444-parameter policy and value network for chess. Its 90 KB INT8 weights run entirely in the browser with 64-visit PUCT search. Pico was distilled from [Stockfish 18](https://stockfishchess.org/) MultiPV labels — an amateur-level toy student, not Stockfish in the browser.

Inspired by [Moka](https://million.dev/moka) — the same idea for Go.

**Source:** [github.com/jeremybosma/pico](https://github.com/jeremybosma/pico) · **Weights:** [`model/chess-model.bin`](./model/chess-model.bin)

Run locally with `bun install && bun dev` — there is no hosted deployment.

## Browser payload

| Path | Weights | Runtime | Total load |
| ------------------- | ------: | ------: | ---------: |
| Pico v1 · INT8 | 90 KB | ~8 KB | ~98 KB |
| Stockfish 18 · full WASM | 110 MB | 20 KB | 110 MB |

Pico’s browser path is about 1,100× smaller than shipping Stockfish itself. The point is the payload experiment — distilled net plus light search — not Elo.

## Browser runtime

Pico runs inference and PUCT search in a Web Worker with a hand-written TypeScript forward pass (no ONNX Runtime, no Stockfish WASM).

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

## Train (distill from Stockfish)

Requires [uv](https://github.com/astral-sh/uv) and Stockfish 18 (`brew install stockfish`).

```bash
uv sync

# Label positions with the full Stockfish teacher
uv run chess-generate --positions 50000 --depth 8 --multipv 12

# Train the student
uv run chess-train --data data/stockfish-distillation.npz --epochs 40

# Export INT8 browser weights → model/ and public/model/
uv run chess-export
```

Smoke check:

```bash
uv run chess-generate --positions 512 --depth 5 --multipv 6 --output data/smoke.npz
uv run chess-train --data data/smoke.npz --epochs 4 --checkpoint checkpoints/smoke.safetensors
uv run chess-export --checkpoint checkpoints/smoke.safetensors
```

## License

MIT. Stockfish is used only as a training teacher and is not shipped in the browser payload (GPLv3).
