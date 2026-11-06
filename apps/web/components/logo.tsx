import Link from "next/link";

/** The Flashmob mark and name, linking home. */
export function Logo({ href }: { href: string }) {
  return (
    <Link href={href} className="logo">
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--lime)" />
        <path d="M18.5 4.5 7.5 18h6.8L12.8 27.5 24.5 13.6h-7z" fill="var(--on-lime)" />
      </svg>
      Flashmob
    </Link>
  );
}
