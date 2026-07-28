import {
  BOARD_AREA,
  BOARD_SIZE,
  INPUT_PLANE_COUNT,
  PICO_FORMAT,
  PICO_VERSION,
  RESIDUAL_BLOCK_COUNT,
  TRUNK_CHANNEL_COUNT,
} from "./constants";

export type PicoManifest = {
  format: string;
  version: number;
  sha256: string;
  architecture: {
    boardSize: number;
    inputPlaneCount: number;
    trunkChannelCount: number;
    residualBlockCount: number;
    fromMoveCount: number;
    toMoveCount: number;
    valueChannelCount: number;
    valueHiddenCount: number;
  };
  tensors: Record<
    string,
    {
      dtype: "int8" | "float32";
      shape: number[];
      dataOffset: number;
      scaleOffset?: number;
    }
  >;
};

export type PicoInference = {
  fromLogits: Float32Array;
  toLogits: Float32Array;
  value: number;
};

type TensorStore = Record<string, Float32Array>;

const elementCount = (shape: number[]) =>
  shape.reduce((count, dim) => count * dim, 1);

const relu = (values: Float32Array) => {
  for (let i = 0; i < values.length; i += 1) {
    values[i] = Math.max(0, values[i]!);
  }
  return values;
};

const addRelu = (left: Float32Array, right: Float32Array) => {
  for (let i = 0; i < left.length; i += 1) {
    left[i] = Math.max(0, left[i]! + right[i]!);
  }
  return left;
};

/** NHWC conv2d. Weights: [out, kh, kw, in] as in MLX. */
const convolve = (
  inputs: Float32Array,
  inputChannels: number,
  outputChannels: number,
  kernelSize: number,
  padding: number,
  weights: Float32Array,
  biases: Float32Array,
) => {
  const outputs = new Float32Array(BOARD_AREA * outputChannels);
  for (let outRow = 0; outRow < BOARD_SIZE; outRow += 1) {
    for (let outCol = 0; outCol < BOARD_SIZE; outCol += 1) {
      for (let oc = 0; oc < outputChannels; oc += 1) {
        let sum = biases[oc]!;
        for (let kr = 0; kr < kernelSize; kr += 1) {
          const inRow = outRow + kr - padding;
          if (inRow < 0 || inRow >= BOARD_SIZE) continue;
          for (let kc = 0; kc < kernelSize; kc += 1) {
            const inCol = outCol + kc - padding;
            if (inCol < 0 || inCol >= BOARD_SIZE) continue;
            const inputOffset = (inRow * BOARD_SIZE + inCol) * inputChannels;
            const weightOffset =
              ((oc * kernelSize + kr) * kernelSize + kc) * inputChannels;
            for (let ic = 0; ic < inputChannels; ic += 1) {
              sum += inputs[inputOffset + ic]! * weights[weightOffset + ic]!;
            }
          }
        }
        outputs[(outRow * BOARD_SIZE + outCol) * outputChannels + oc] = sum;
      }
    }
  }
  return outputs;
};

const linear = (
  inputs: Float32Array,
  weights: Float32Array,
  biases: Float32Array,
  outFeatures: number,
) => {
  const inFeatures = inputs.length;
  const outputs = new Float32Array(outFeatures);
  for (let o = 0; o < outFeatures; o += 1) {
    let sum = biases[o]!;
    const row = o * inFeatures;
    for (let i = 0; i < inFeatures; i += 1) {
      sum += inputs[i]! * weights[row + i]!;
    }
    outputs[o] = sum;
  }
  return outputs;
};

const meanPool = (inputs: Float32Array, channels: number) => {
  const pooled = new Float32Array(channels);
  for (let c = 0; c < channels; c += 1) {
    let sum = 0;
    for (let i = 0; i < BOARD_AREA; i += 1) {
      sum += inputs[i * channels + c]!;
    }
    pooled[c] = sum / BOARD_AREA;
  }
  return pooled;
};

export class PicoRuntime {
  private tensors: TensorStore = {};
  readonly architecture: PicoManifest["architecture"];

  private constructor(architecture: PicoManifest["architecture"], tensors: TensorStore) {
    this.architecture = architecture;
    this.tensors = tensors;
  }

  static async load(
    manifest: PicoManifest,
    weights: ArrayBuffer,
  ): Promise<PicoRuntime> {
    if (manifest.format !== PICO_FORMAT || manifest.version !== PICO_VERSION) {
      throw new Error("Unsupported Pico model format");
    }
    const bytes = new Uint8Array(weights);
    const tensors: TensorStore = {};

    for (const [name, meta] of Object.entries(manifest.tensors)) {
      const count = elementCount(meta.shape);
      if (meta.dtype === "float32") {
        const view = new Float32Array(
          weights,
          meta.dataOffset,
          count,
        );
        tensors[name] = new Float32Array(view);
        continue;
      }

      const quantized = new Int8Array(weights, meta.dataOffset, count);
      const outChannels = meta.shape[0]!;
      const scales = new Float32Array(
        weights,
        meta.scaleOffset!,
        outChannels,
      );
      const dequantized = new Float32Array(count);
      const perChannel = count / outChannels;
      for (let oc = 0; oc < outChannels; oc += 1) {
        const scale = scales[oc]!;
        const base = oc * perChannel;
        for (let i = 0; i < perChannel; i += 1) {
          dequantized[base + i] = quantized[base + i]! * scale;
        }
      }
      tensors[name] = dequantized;
      void bytes;
    }

    const arch = manifest.architecture;
    if (
      arch.boardSize !== BOARD_SIZE ||
      arch.inputPlaneCount !== INPUT_PLANE_COUNT ||
      arch.trunkChannelCount !== TRUNK_CHANNEL_COUNT ||
      arch.residualBlockCount !== RESIDUAL_BLOCK_COUNT
    ) {
      throw new Error("Unexpected Pico architecture");
    }

    return new PicoRuntime(arch, tensors);
  }

  infer(features: Float32Array): PicoInference {
    if (features.length !== BOARD_AREA * INPUT_PLANE_COUNT) {
      throw new Error("Bad feature length");
    }

    let hidden = relu(
      convolve(
        features,
        INPUT_PLANE_COUNT,
        TRUNK_CHANNEL_COUNT,
        3,
        1,
        this.tensors["stem.weight"]!,
        this.tensors["stem.bias"]!,
      ),
    );

    for (let block = 0; block < RESIDUAL_BLOCK_COUNT; block += 1) {
      const first = relu(
        convolve(
          hidden,
          TRUNK_CHANNEL_COUNT,
          TRUNK_CHANNEL_COUNT,
          3,
          1,
          this.tensors[`residual.${block}.first.weight`]!,
          this.tensors[`residual.${block}.first.bias`]!,
        ),
      );
      const second = convolve(
        first,
        TRUNK_CHANNEL_COUNT,
        TRUNK_CHANNEL_COUNT,
        3,
        1,
        this.tensors[`residual.${block}.second.weight`]!,
        this.tensors[`residual.${block}.second.bias`]!,
      );
      hidden = addRelu(new Float32Array(hidden), second);
    }

    const toMap = convolve(
      hidden,
      TRUNK_CHANNEL_COUNT,
      1,
      1,
      0,
      this.tensors["to.convolution.weight"]!,
      this.tensors["to.convolution.bias"]!,
    );
    const toLogits = toMap;

    const pooled = meanPool(hidden, TRUNK_CHANNEL_COUNT);
    const fromLogits = linear(
      pooled,
      this.tensors["from.linear.weight"]!,
      this.tensors["from.linear.bias"]!,
      this.architecture.fromMoveCount,
    );

    const valueMap = relu(
      convolve(
        hidden,
        TRUNK_CHANNEL_COUNT,
        this.architecture.valueChannelCount,
        1,
        0,
        this.tensors["value.convolution.weight"]!,
        this.tensors["value.convolution.bias"]!,
      ),
    );
    const valueHidden = relu(
      linear(
        valueMap,
        this.tensors["value.hidden.weight"]!,
        this.tensors["value.hidden.bias"]!,
        this.architecture.valueHiddenCount,
      ),
    );
    const valueOut = linear(
      valueHidden,
      this.tensors["value.output.weight"]!,
      this.tensors["value.output.bias"]!,
      1,
    );
    const value = Math.tanh(valueOut[0]!);

    return { fromLogits, toLogits, value };
  }
}
