import { PlayPico } from "@/components/play-pico";
import { Rollouts } from "@/components/rollouts";

export default function Home() {
  return (
    <>
      <nav
        aria-label="Primary navigation"
        className="absolute top-6 right-6 left-6 hidden items-center justify-between font-[family-name:var(--font-inter)] text-sm font-normal sm:flex"
      >
        <a
          aria-label="Pico home"
          className="inline-flex size-8 items-center justify-center font-[family-name:var(--font-source-serif)] text-xl font-medium text-neutral-900 no-underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          href="/"
        >
          P
        </a>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            className="text-neutral-600 no-underline hover:text-neutral-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
            href="https://github.com/jeremybosma/pico"
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
          <a
            className="text-neutral-600 no-underline hover:text-neutral-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
            href="https://million.dev/moka"
            rel="noreferrer"
            target="_blank"
          >
            Inspired by Moka
          </a>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-6 pt-16 pb-12 text-base leading-relaxed antialiased selection:bg-neutral-300 sm:pt-24 font-[425]">
        <h1 className="text-[20px] font-medium">Pico v1</h1>

        <article className="space-y-4">
          <p>
            Pico is a tiny 89K-parameter student chess net: 90 KB of INT8 weights
            and a ~100 KB browser payload. It was distilled from{" "}
            <a
              className="text-neutral-600 underline decoration-neutral-400 decoration-1 underline-offset-2 hover:text-neutral-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
              href="https://stockfishchess.org/"
              rel="noreferrer"
              target="_blank"
            >
              Stockfish 18
            </a>{" "}
            MultiPV labels, then plays with 64-visit PUCT search in a Web Worker —
            not Stockfish WASM, and not engine-strength. Think amateur toy with
            search, not a browser Stockfish.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <a
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-neutral-900 px-4 py-2 font-[family-name:var(--font-inter)] text-base font-normal text-white no-underline hover:bg-black active:scale-[0.98] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
              href="https://github.com/jeremybosma/pico"
              rel="noreferrer"
              target="_blank"
            >
              View source
            </a>
            <a
              className="text-neutral-600 underline decoration-neutral-400 decoration-1 underline-offset-2 hover:text-neutral-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
              download
              href="/model/chess-model.bin"
            >
              Download Pico weights · 90 KB
            </a>
          </div>

          <section aria-label="Play Pico" className="pt-2">
            <PlayPico />
          </section>

          <section
            aria-labelledby="browser-payload-heading"
            className="space-y-3 pt-2"
          >
            <h2 className="font-medium" id="browser-payload-heading">
              Browser payload
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-lg border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-300 text-left text-neutral-500">
                    <th className="py-2 pr-4 font-normal">Path</th>
                    <th className="px-4 py-2 text-right font-normal">Weights</th>
                    <th className="px-4 py-2 text-right font-normal">
                      Runtime
                    </th>
                    <th className="py-2 pl-4 text-right font-normal">
                      Total load
                    </th>
                  </tr>
                </thead>
                <tbody className="[&_tr:not(:last-child)]:border-b [&_tr:not(:last-child)]:border-neutral-200">
                  <tr>
                    <td className="py-2 pr-4">Pico v1 · INT8</td>
                    <td className="px-4 py-2 text-right">90 KB</td>
                    <td className="px-4 py-2 text-right">~8 KB</td>
                    <td className="py-2 pl-4 text-right">~98 KB</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Stockfish 18 · full WASM</td>
                    <td className="px-4 py-2 text-right">110 MB</td>
                    <td className="px-4 py-2 text-right">20 KB</td>
                    <td className="py-2 pl-4 text-right">110 MB</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-neutral-700">
              Pico’s browser path is about 1,100× smaller than shipping full Stockfish
              WASM. The point is the payload experiment — a distilled net plus light
              search in an ordinary webpage — not Elo.
            </p>
          </section>

          <hr className="border-neutral-200" />

          <Rollouts />
        </article>
      </main>

      <footer className="mx-auto w-full max-w-2xl px-6 pb-10 font-[family-name:var(--font-inter)] text-xs text-neutral-500">
        Distilled toy · 64-visit search · UI inspired by{" "}
        <a
          className="underline decoration-neutral-400 underline-offset-2 hover:text-neutral-800"
          href="https://million.dev/moka"
          rel="noreferrer"
          target="_blank"
        >
          Moka
        </a>
      </footer>
    </>
  );
}
