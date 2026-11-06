import assert from "node:assert/strict";
import { test } from "node:test";
import { judge, writePlan } from "./agent-model";

const chat = (content: string) => (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }))) as unknown as typeof fetch;
const reply = (text: string, annotations: object[] = []) => (async () => new Response(JSON.stringify({ output: [{ type: "web_search_call" }, { type: "message", content: [{ type: "output_text", text, annotations }] }] }))) as unknown as typeof fetch;

const raw = { summary: "Buys oversold dips.", rules: [{ metric: "rsi", timeframe: null, op: "below", value: 30 }], judgment: null, useNews: false, entry: { type: "limit", offsetPercent: 1, rungs: null, stepPercent: null, durationMinutes: null, repeatHours: null }, exit: { stopPercent: 5, targetPercent: null, trailPercent: null }, leftOut: null };

test("a written strategy becomes a plan with the empty fields removed", async () => {
  const result = await writePlan("k", "buy dips", chat(JSON.stringify(raw)));
  assert.ok("plan" in result);
  assert.deepEqual(result.plan.entry, { type: "limit", offsetPercent: 1 });
  assert.deepEqual(result.plan.rules[0], { metric: "rsi", op: "below", value: 30 });
  assert.deepEqual(result.plan.exit, { stopPercent: 5 });
});

test("a plan outside the bounds comes back as an error", async () => {
  const result = await writePlan("k", "x", chat(JSON.stringify({ ...raw, entry: { type: "limit", offsetPercent: 80 } })));
  assert.ok("error" in result);
  assert.match(result.error, /below the price/);
});

test("an unreadable reply is an error, and what it couldn't do is passed on", async () => {
  assert.ok("error" in (await writePlan("k", "x", chat("not json"))));
  const result = await writePlan("k", "x", chat(JSON.stringify({ ...raw, leftOut: "It can't short." })));
  assert.ok("leftOut" in result && result.leftOut === "It can't short.");
});

test("a strategy it can't really do is refused, never swapped for another trade", async () => {
  assert.deepEqual(await writePlan("k", "short ETH", chat(JSON.stringify({ ...raw, impossible: "It can't short." }))), { error: "It can't short." });
});

test("the model failing is reported, not hidden", async () => {
  await assert.rejects(writePlan("k", "x", (async () => new Response("", { status: 500 })) as unknown as typeof fetch), /didn't answer/);
});

test("a passing judgment keeps its sources", async () => {
  const j = await judge("k", "no bad news", true, "WETH", [], reply('Here: {"pass": true, "reason": "Nothing negative."}', [{ type: "url_citation", url: "https://a.com/1", title: "A" }, { type: "url_citation", url: "https://a.com/1", title: "A" }, { type: "url_citation", url: "javascript:alert(1)", title: "B" }]));
  assert.deepEqual([j.pass, j.reason, j.sources], [true, "Nothing negative.", [{ title: "A", url: "https://a.com/1" }]]);
});

test("the last message is the answer, and search results stand in for missing citations", async () => {
  const fetcher = (async () => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "Searching {now}" }] }, { type: "web_search_call", results: [{ url: "https://b.com", title: "B" }] }, { type: "message", content: [{ type: "output_text", text: '{"pass": false, "reason": "Bad news."}' }] }] }))) as unknown as typeof fetch;
  const j = await judge("k", "c", true, "WETH", [], fetcher);
  assert.deepEqual([j.pass, j.reason, j.sources], [false, "Bad news.", [{ title: "B", url: "https://b.com" }]]);
});

test("anything unclear counts as no", async () => {
  assert.equal((await judge("k", "c", false, "WETH", [], reply("I think so"))).pass, false);
  assert.equal((await judge("k", "c", false, "WETH", [], reply('{"pass": "yes", "reason": "ok"}'))).pass, false);
});

test("news is only searched when the plan asks for it", async () => {
  let sent: { tools?: unknown } = {};
  const spy = (async (_: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response(JSON.stringify({ output: [] })); }) as unknown as typeof fetch;
  await judge("k", "c", false, "WETH", [], spy);
  assert.equal(sent.tools, undefined);
  await judge("k", "c", true, "WETH", [], spy);
  assert.deepEqual(sent.tools, [{ type: "web_search" }]);
});
