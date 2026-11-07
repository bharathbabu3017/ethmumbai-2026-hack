"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AgentBuilder, type EditableAgent } from "@/components/agent-builder";
import { Nav } from "@/components/nav";
import { PageSkeleton } from "@/components/page-skeleton";
import { useCached } from "@/lib/cached";
import { useWallet } from "@/lib/wallet";

export default function EditAgent() {
  const { id } = useParams<{ id: string }>();
  const { address, ready, login } = useWallet();
  // Fresh on every visit: the form starts from this, so old settings could overwrite a recent save.
  const [visit] = useState(() => Date.now());
  const { data: agents } = useCached<EditableAgent[]>(address ? `agents-edit:${address}:${visit}` : null, async () => {
    const res = await fetch("/api/agents");
    return res.ok ? ((await res.json()) as { agents: EditableAgent[] }).agents : undefined;
  });
  const agent = agents?.find((a) => a.id === id);

  if (!ready || (address && !agents)) return <PageSkeleton />;
  if (agent && agent.status !== "stopped") return <AgentBuilder key={agent.id} agent={agent} />;
  return (
    <>
      <Nav />
      <main className="wrap wide" style={{ paddingTop: 28, paddingBottom: 56, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        {!address ? <button className="btn pri" onClick={login}>Connect to edit your agent</button> : <p style={{ margin: 0 }}>{agent ? "A stopped agent can't be edited. Build a new one instead." : "That agent isn't one of yours."}</p>}
        <Link href="/agents" className="btn">Back to your agents</Link>
      </main>
    </>
  );
}
