type EvalBarProps = {
  whitePercent: number;
  label?: string;
};

/** Lichess-style bar: Black on top, White on bottom. Dark fill = White %. */
export function EvalBar({ whitePercent, label }: EvalBarProps) {
  const white = Math.max(0, Math.min(100, whitePercent));
  const black = 100 - white;

  return (
    <div className="flex h-full w-6 shrink-0 flex-col items-center gap-1 font-[family-name:var(--font-inter)] text-xs font-normal text-neutral-500 sm:w-8">
      <span className="flex items-center gap-0.5">B</span>
      <div
        aria-label={label ?? "White win probability"}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={white}
        aria-valuetext={`White ${white}%, Black ${black}%`}
        className="relative min-h-0 w-full flex-1 overflow-hidden rounded-full border border-neutral-300 bg-white"
        role="meter"
        title={`White ${white}%, Black ${black}%`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 bg-neutral-900 transition-[height] ease-out motion-reduce:transition-none"
          style={{ height: `${white}%`, transitionDuration: "300ms" }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-2 text-center tabular-nums text-white mix-blend-difference"
        >
          {black}
        </span>
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-2 text-center tabular-nums text-white mix-blend-difference"
        >
          {white}
        </span>
      </div>
      <span className="flex items-center gap-0.5">W</span>
    </div>
  );
}
