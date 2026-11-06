import Link from "next/link";
import { Nav } from "@/components/nav";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 28, paddingBottom: 48 }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 34 }}>Every record backed by real fills</h1>
          <p className="mut" style={{ margin: "6px 0 0" }}>Follow traders, get their calls in Telegram, and copy them with the stop and target attached.</p>
        </div>
        <div className="cols">
          <section className="card main" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 18, marginBottom: 10 }}>Leaderboard</h2>
            <p className="mut" style={{ margin: 0 }}>No traders yet. Rankings appear once traders have real fills.</p>
          </section>
          <section className="card side" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 18 }}>Live calls</h2>
            <p className="mut" style={{ margin: 0 }}>No calls yet.</p>
            <Link href="/trade" className="btn">Place a trade</Link>
          </section>
        </div>
      </main>
    </>
  );
}
