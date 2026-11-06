const FOLLOWERS = [40, 100, 160, 220, 280];
const path = (y: number) => `M70 160 C 200 160, 230 ${y}, 370 ${y}`;

/** A trade leaving one trader and reaching each follower. */
export function CopyDiagram() {
  return (
    <svg viewBox="0 0 440 320" style={{ width: "100%", maxWidth: 460, display: "block" }} role="img" aria-label="A trader's order is copied to five followers">
      {FOLLOWERS.map((y) => <path key={y} d={path(y)} fill="none" stroke="var(--line)" strokeWidth="1.2" />)}
      {FOLLOWERS.map((y, i) => (
        <path key={y} className="packet" d={path(y)} pathLength={100} fill="none" stroke="var(--up)" strokeWidth="2" strokeLinecap="round" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
      <circle className="ping" cx="70" cy="160" r="16" strokeWidth="1.5" />
      <circle cx="70" cy="160" r="16" fill="var(--lime)" />
      <text x="70" y="206" textAnchor="middle" fontSize="13" fill="var(--text)">Trader</text>
      {FOLLOWERS.map((y, i) => <circle key={y} className="node" cx="370" cy={y} r="9" strokeWidth="1.2" style={{ animationDelay: `${i * 0.12}s` }} />)}
      <text x="396" y="164" fontSize="13" fill="var(--mut)">You</text>
    </svg>
  );
}
