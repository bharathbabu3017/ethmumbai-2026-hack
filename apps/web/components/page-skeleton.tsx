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
