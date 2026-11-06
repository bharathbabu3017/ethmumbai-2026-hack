const COLORS = ["#C4F250", "#8FB2FF", "#FFB86B", "#B9A6FF", "#7FE0D2", "#FF9EC4"];

/** A stable colour and initials for a name, since traders don't upload pictures yet. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const hash = [...name].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const initials = name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return <span className="avatar" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.38, background: COLORS[hash % COLORS.length] }}>{initials}</span>;
}
