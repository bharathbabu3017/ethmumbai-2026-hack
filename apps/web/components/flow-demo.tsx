const STEPS = [
  ["A trader buys WETH", "Their order is public the moment they place it."],
  ["Your wallet copies it", "With your amount, inside your daily limit."],
  ["Your stop and target are set", "So it can sell by itself, even while you're offline."],
  ["Telegram tells you", "One clear message with what was bought and at what price."],
] as const;

/** What actually happens when you auto-copy a trade, one step at a time. */
export function FlowDemo() {
  return (
    <ol className="flow" aria-label="How a copied trade works">
      {STEPS.map(([title, text], i) => (
        <li key={title} className="flow-step" style={{ animationDelay: `${i * 2}s` }}>
          <span className="flow-dot" style={{ animationDelay: `${i * 2}s` }}>{i + 1}</span>
          <span>
            <span style={{ display: "block", fontWeight: 600 }}>{title}</span>
            <span className="mut" style={{ fontSize: 13 }}>{text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
