import { PicoRuntime, type PicoManifest } from "./runtime";

type InitMessage = {
  type: "init";
  manifest: PicoManifest;
  weights: ArrayBuffer;
};

type InferMessage = {
  type: "infer";
  id: number;
  features: Float32Array;
};

type InMessage = InitMessage | InferMessage;

let runtime: PicoRuntime | null = null;

self.onmessage = async (event: MessageEvent<InMessage>) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      runtime = await PicoRuntime.load(message.manifest, message.weights);
      self.postMessage({ type: "ready" });
      return;
    }

    if (message.type === "infer") {
      if (!runtime) throw new Error("Pico not initialized");
      const result = runtime.infer(message.features);
      const fromBuffer = result.fromLogits.buffer as ArrayBuffer;
      const toBuffer = result.toLogits.buffer as ArrayBuffer;
      self.postMessage(
        {
          type: "result",
          id: message.id,
          fromLogits: result.fromLogits,
          toLogits: result.toLogits,
          value: result.value,
        },
        { transfer: [fromBuffer, toBuffer] },
      );
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      id: "id" in message ? message.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
