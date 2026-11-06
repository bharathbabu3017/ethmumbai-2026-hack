/**
 * Realized results over time. Profit only changes when something is sold, so it's drawn in steps from a zero line.
 * With `width` left out it fills its container.
 */
export function Spark({ points, width, height = 40 }: { points: number[]; width?: number; height?: number }) {
  if (!points.length) return <span style={{ width, height }} />;
  const w = width ?? 300;
  const pad = 4;
  const line = [0, ...points];
  const low = Math.min(...line);
  const high = Math.max(...line);
  const y = (v: number) => pad + (1 - (v - low) / (high - low || 1)) * (height - pad * 2);
  const x = (i: number) => (i / (points.length + 1)) * w;

  // Each sale is a step down or up, and the line then runs on to the right edge.
  const steps = [...line.flatMap((v, i) => (i === 0 ? [[0, y(v)]] : [[x(i), y(line[i - 1]!)], [x(i), y(v)]])), [w, y(line.at(-1)!)]];
  const path = steps.map(([px, py]) => `${px},${py}`).join(" ");
  const [endX, endY] = steps.at(-1)!;
  const color = line.at(-1)! < 0 ? "var(--orange)" : "var(--up)";

  return (
    <svg width={width ?? "100%"} height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden="true" style={{ display: "block" }}>
      <polygon points={`0,${y(0)} ${path} ${endX},${y(0)}`} fill={color} opacity="0.12" />
      <line x1="0" x2={w} y1={y(0)} y2={y(0)} stroke="var(--line2)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <polyline points={path} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
