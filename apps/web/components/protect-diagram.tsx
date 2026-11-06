/** A price rising from entry to the take profit line, with the stop loss below. */
export function ProtectDiagram() {
  return (
    <svg viewBox="0 0 480 220" style={{ width: "100%", display: "block" }} role="img" aria-label="Price rises from the entry to the take profit line, with a stop loss line below the entry">
      <line x1="0" y1="34" x2="480" y2="34" stroke="var(--up)" strokeDasharray="5 6" />
      <line x1="0" y1="130" x2="480" y2="130" stroke="var(--line2)" strokeDasharray="5 6" />
      <line x1="0" y1="186" x2="480" y2="186" stroke="var(--orange)" strokeDasharray="5 6" />
      <text x="0" y="24" fontSize="12" fill="var(--up)">Take profit</text>
      <text x="0" y="120" fontSize="12" fill="var(--mut)">Entry</text>
      <text x="0" y="208" fontSize="12" fill="var(--orange)">Stop loss</text>
      <polyline className="draw" pathLength={100} points="90,130 140,112 180,142 240,96 280,116 340,70 380,84 440,34" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinejoin="round" />
      <circle className="hitmark" cx="440" cy="34" r="6" fill="var(--lime)" />
    </svg>
  );
}
