// stdio 스모크 — 빌드한 서버를 띄워 도구 목록과 simulate(useDemo)·rules 호출을 확인한다. `npm run smoke`
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const path = require("node:path");

(async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, "..", "dist", "mcp", "src", "server.js")] });
  const client = new Client({ name: "smoke", version: "0.0.0" });
  await client.connect(transport);
  const tools = await client.listTools();
  console.log("tools:", tools.tools.map((t) => t.name).join(", "));
  const sim = await client.callTool({ name: "simulate", arguments: { useDemo: true, assumptions: { npsStartAge: 68 } } });
  const body = JSON.parse(sim.content[0].text);
  const at70 = body.flowByYear.find((y) => y.age === 70);
  console.log("simulate(demo, 68세 개시): rules", body.rulesVersion, "· 70세 세전", Math.round(at70.gross), "천원 · 가처분", Math.round(at70.disposable), "· 절벽", body.metrics.cliffs.map((c) => c.age).join("/"));
  const bad = await client.callTool({ name: "simulate", arguments: { accounts: [] } });
  console.log("simulate(입력 누락) isError:", bad.isError === true);
  const rules = await client.callTool({ name: "rules", arguments: { grade: "estimated" } });
  console.log("rules(estimated):", JSON.parse(rules.content[0].text).items.map((r) => r.id).join(", "));
  await client.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
