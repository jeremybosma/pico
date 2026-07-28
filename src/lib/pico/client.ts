import type { PicoManifest } from "./runtime";

export type PicoMoveScores = {
  fromLogits: Float32Array;
  toLogits: Float32Array;
  value: number;
};

type Pending = {
  resolve: (value: PicoMoveScores) => void;
  reject: (error: Error) => void;
};

export class PicoClient {
  private worker: Worker;
  private readyPromise: Promise<void>;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  private constructor(worker: Worker, readyPromise: Promise<void>) {
    this.worker = worker;
    this.readyPromise = readyPromise;
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (data.type === "result") {
        const pending = this.pending.get(data.id);
        if (!pending) return;
        this.pending.delete(data.id);
        pending.resolve({
          fromLogits: data.fromLogits,
          toLogits: data.toLogits,
          value: data.value,
        });
      } else if (data.type === "error") {
        if (data.id !== undefined) {
          const pending = this.pending.get(data.id);
          this.pending.delete(data.id);
          pending?.reject(new Error(data.message));
        }
      }
    };
  }

  static async create(
    manifestUrl = "/model/chess-model.json",
    weightsUrl = "/model/chess-model.bin",
  ): Promise<PicoClient> {
    const [manifestResponse, weightsResponse] = await Promise.all([
      fetch(manifestUrl),
      fetch(weightsUrl),
    ]);
    if (!manifestResponse.ok || !weightsResponse.ok) {
      throw new Error("Failed to download Pico model");
    }
    const manifest = (await manifestResponse.json()) as PicoManifest;
    const weights = await weightsResponse.arrayBuffer();

    const worker = new Worker(new URL("./worker.ts", import.meta.url));
    const readyPromise = new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        if (event.data.type === "ready") {
          worker.removeEventListener("message", onMessage);
          resolve();
        } else if (event.data.type === "error") {
          worker.removeEventListener("message", onMessage);
          reject(new Error(event.data.message));
        }
      };
      worker.addEventListener("message", onMessage);
      worker.onerror = (event) => reject(new Error(event.message));
      worker.postMessage(
        { type: "init", manifest, weights },
        { transfer: [weights] },
      );
    });

    const client = new PicoClient(worker, readyPromise);
    await readyPromise;
    return client;
  }

  async infer(features: Float32Array): Promise<PicoMoveScores> {
    await this.readyPromise;
    const id = this.nextId++;
    return new Promise<PicoMoveScores>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // Copy so the worker owns a transferable buffer without detaching caller state
      const copy = new Float32Array(features);
      this.worker.postMessage(
        { type: "infer", id, features: copy },
        { transfer: [copy.buffer] },
      );
    });
  }

  dispose() {
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Pico disposed"));
    }
    this.pending.clear();
  }
}
