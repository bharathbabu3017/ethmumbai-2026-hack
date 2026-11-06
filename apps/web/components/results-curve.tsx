/** Running realized profit in USD, drawn from the trader's real sales. */
export function ResultsCurve({ points }: { points: number[] }) {
  if (points.length < 2) {
    return <p className="mut" style={{ margin: 0 }}>This fills in once the trader has sold at least twice.</p>;
  }
  const series = [0, ...points];
  const min = Math.min(...series), max = Math.max(...series);
  const span = max - min || 1;
  const x = (i: number) => (i / (series.length - 1)) * 600;
  const y = (v: number) => 110 - ((v - min) / span) * 100;
  const last = series.at(-1)!;
  return (
    <svg viewBox="0 0 600 120" preserveAspectRatio="none" style={{ width: "100%", height: 120, display: "block" }} role="img" aria-label={`Realized profit ending at ${last.toFixed(2)} dollars`}>
      <line x1="0" x2="600" y1={y(0)} y2={y(0)} stroke="var(--line2)" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
      <polyline fill="none" stroke={last >= 0 ? "var(--up)" : "var(--orange)"} strokeWidth="2" vectorEffect="non-scaling-stroke" points={series.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
    </svg>
  );
}
