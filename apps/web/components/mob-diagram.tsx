const COPIES = [["$1.00", 36], ["$5.00", 93], ["$0.50", 150], ["$10.00", 207], ["$2.00", 264]] as const;
const path = (y: number) => `M210 150 C 440 150, 520 ${y}, 760 ${y}`;

/** One trade fanning out to everyone copying it, each at their own size. */
export function MobDiagram() {
  return (
    <svg viewBox="0 0 1000 300" style={{ width: "100%", display: "block" }} role="img" aria-label="Example: a trader buys WETH and five followers copy it at their own amounts">
      {COPIES.map(([, y]) => <path key={y} d={path(y)} fill="none" stroke="var(--line2)" strokeWidth="1" />)}
      {COPIES.map(([, y], i) => (
        <path key={y} className="packet" d={path(y)} pathLength={100} fill="none" stroke="var(--up)" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
      <circle className="ping" cx="210" cy="150" r="20" strokeWidth="1.5" />
      <circle cx="210" cy="150" r="20" fill="var(--lime)" />
      <text x="170" y="145" textAnchor="end" fontSize="20" fontWeight="600" fill="var(--text)">Trader</text>
      <text x="170" y="169" textAnchor="end" fontSize="15" fill="var(--mut)">Bought WETH</text>
      {COPIES.map(([amount, y], i) => (
        <g key={y}>
          <circle className="node" cx="760" cy={y} r="11" strokeWidth="1.2" style={{ animationDelay: `${i * 0.12}s` }} />
          <text x="786" y={y + 6} fontSize="17" fill="var(--text)" style={{ fontFamily: "var(--font-mono),monospace" }}>{amount}</text>
        </g>
      ))}
    </svg>
  );
}
