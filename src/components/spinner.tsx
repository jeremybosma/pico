export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`size-4 shrink-0 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <line
          key={i}
          className="animate-[spinner-line-fade_1s_linear_infinite] stroke-current motion-reduce:animate-none motion-reduce:opacity-70"
          strokeLinecap="round"
          strokeWidth="2"
          style={{ animationDelay: `${-i * 125}ms` }}
          transform={`rotate(${i * 45} 12 12)`}
          x1="12"
          x2="12"
          y1="3"
          y2="7"
        />
      ))}
    </svg>
  );
}
