"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { ensureSession, fetchMe, postJson, type Me } from "@/lib/account";
import { useWallet } from "@/lib/wallet";

export default function BecomeATrader() {
  const { address, login, getSigner } = useWallet();
  const [me, setMe] = useState<Me>();
  const [profile, setProfile] = useState({ displayName: "", bio: "", xHandle: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchMe().then(setMe).catch(() => {}); }, [address]);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      await ensureSession(getSigner);
      await postJson("/api/traders", profile);
      setMe(await fetchMe());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const edit = (key: keyof typeof profile) => ({
    value: profile[key],
    onChange: (e: { target: { value: string } }) => setProfile({ ...profile, [key]: e.target.value }),
  });

  return (
    <>
      <Nav />
      <main className="wrap" style={{ maxWidth: 480, paddingTop: 44, paddingBottom: 64 }}>
        <h1 className="big" style={{ marginBottom: 6 }}>Become a trader</h1>
        <p className="mut" style={{ margin: "0 0 24px" }}>Once you create a profile, every order you place on Flashmob is public: it shows on your profile, alerts your followers, and can be copied.</p>
        {me?.trader ? (
          <Link href={`/traders/${me.trader.id}`} className="btn">View your profile</Link>
        ) : !address ? (
          <button className="btn pri" onClick={login}>Connect a wallet</button>
        ) : (
          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><label className="lab" htmlFor="name">Display name</label><input id="name" className="inp" {...edit("displayName")} /></div>
            <div><label className="lab" htmlFor="bio">Bio</label><input id="bio" className="inp" {...edit("bio")} /></div>
            <div><label className="lab" htmlFor="x">X handle</label><input id="x" className="inp" {...edit("xHandle")} /></div>
            <button className="btn pri" disabled={busy} onClick={create}>Create profile</button>
            {error && <p role="alert" className="dn" style={{ margin: 0 }}>{error}</p>}
          </section>
        )}
      </main>
    </>
  );
}
