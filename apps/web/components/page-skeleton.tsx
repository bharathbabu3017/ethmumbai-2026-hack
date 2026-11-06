import { Nav } from "@/components/nav";

/** Shown the moment a page is opened, while its data loads. */
export function PageSkeleton() {
  return (
    <>
      <Nav />
      <main className="wrap wide" aria-busy="true" style={{ paddingTop: 28, paddingBottom: 56, display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="sk" style={{ height: 34, width: 260 }} />
        <div className="sk" style={{ height: 18, width: 420, maxWidth: "100%" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
          <div className="sk" style={{ height: 280 }} />
          <div className="sk" style={{ height: 280 }} />
        </div>
      </main>
    </>
  );
}

/** The portfolio's shape, so nothing jumps when the real numbers arrive. */
export function PortfolioBody() {
  return (
    <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="between" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="row" style={{ gap: "16px 40px", alignItems: "flex-end" }}>
          <div className="sk" style={{ height: 64, width: 180 }} />
          <div className="sk" style={{ height: 50, width: 130 }} />
          <div className="sk" style={{ height: 50, width: 130 }} />
        </div>
        <div className="sk" style={{ height: 44, width: 170 }} />
      </div>
      <div className="sk" style={{ height: 280 }} />
    </div>
  );
}

export function PortfolioSkeleton() {
  return (
    <>
      <Nav />
      <main className="wrap wide" style={{ paddingTop: 28, paddingBottom: 56 }}><PortfolioBody /></main>
    </>
  );
}
