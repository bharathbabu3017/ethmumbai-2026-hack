/** A small line of realized results over time. Nothing is drawn until there's a trend to show. */
export function Spark({ points, width = 120, height = 40 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return <span style={{ width, height }} />;
  const line = [0, ...points];
  const low = Math.min(...line);
  const range = Math.max(...line) - low || 1;
  const path = line.map((v, i) => `${(i / (line.length - 1)) * width},${height - 2 - ((v - low) / range) * (height - 4)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={path} fill="none" stroke={line.at(-1)! < 0 ? "var(--orange)" : "var(--up)"} strokeWidth="1.5" />
    </svg>
  );
}
