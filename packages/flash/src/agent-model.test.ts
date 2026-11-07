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

const replies = (...contents: string[]) => {
  const sent: any[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ choices: [{ message: { content: contents[Math.min(sent.length - 1, contents.length - 1)] } }] }));
  }) as unknown as typeof fetch;
  return { fetcher, sent };
};
const outOfBounds = JSON.stringify({ ...raw, entry: { type: "limit", offsetPercent: 80 } });

test("a plan outside the bounds gets one chance to be fixed, told exactly what was wrong", async () => {
  const { fetcher, sent } = replies(outOfBounds, JSON.stringify(raw));
  const result = await writePlan("k", "x", fetcher);
  assert.ok("plan" in result);
  assert.equal(sent.length, 2);
  assert.match(sent[1].messages.at(-1).content, /below the price/);
});

test("a plan still outside the bounds after that is an error, and is never returned", async () => {
  const { fetcher, sent } = replies(outOfBounds);
  const result = await writePlan("k", "x", fetcher);
  assert.equal(sent.length, 2);
  assert.ok("error" in result);
  assert.match(result.error, /below the price/);
});

test("an unreadable reply is asked for again, then reported", async () => {
  assert.ok("plan" in (await writePlan("k", "x", replies("not json", JSON.stringify(raw)).fetcher)));
  assert.ok("error" in (await writePlan("k", "x", chat("not json"))));
});

test("every way the plan differs from the strategy is passed on", async () => {
  const result = await writePlan("k", "x", chat(JSON.stringify({ ...raw, changes: ["EMA isn't available.", " ", 5] })));
  assert.ok("plan" in result);
  assert.deepEqual(result.changes, ["EMA isn't available.", "5"]);
  const exact = await writePlan("k", "x", chat(JSON.stringify(raw)));
  assert.ok("plan" in exact);
  assert.deepEqual(exact.changes, []);
});

test("a strategy that would be the opposite bet is refused, never swapped for a buy, and offers something it can do", async () => {
  const plan = { ...raw, impossible: "It can't short." };
  assert.deepEqual(await writePlan("k", "short ETH", chat(JSON.stringify(plan))), { error: "It can't short." });
  assert.deepEqual(await writePlan("k", "short ETH", chat(JSON.stringify({ ...plan, suggestion: "Buy ETH after a sharp fall." }))), { error: "It can't short.", suggestion: "Buy ETH after a sharp fall." });
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
