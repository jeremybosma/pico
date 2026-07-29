import { PicoRuntime, type PicoManifest } from "./runtime";
import { DEFAULT_PLAY_VISITS, runPuctSearch } from "./search";

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

type SearchMessage = {
  type: "search";
  id: number;
  fen: string;
  visits?: number;
};

type InMessage = InitMessage | InferMessage | SearchMessage;

let runtime: PicoRuntime | null = null;

self.onmessage = async (event: MessageEvent<InMessage>) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      runtime = await PicoRuntime.load(message.manifest, message.weights);
      self.postMessage({ type: "ready" });
      return;
    }

    if (!runtime) throw new Error("Pico not initialized");

    if (message.type === "infer") {
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
      return;
    }

    if (message.type === "search") {
      const result = runPuctSearch(
        runtime,
        message.fen,
        message.visits ?? DEFAULT_PLAY_VISITS,
      );
      self.postMessage({
        type: "search-result",
        id: message.id,
        bestMove: result.bestMove,
        whiteValue: result.whiteValue,
        visits: result.visits,
      });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      id: "id" in message ? message.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
