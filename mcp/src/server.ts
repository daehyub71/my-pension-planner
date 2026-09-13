#!/usr/bin/env node
/**
 * F20 — 계산기 MCP (stdio). Claude Desktop 에 붙인다.
 * 네트워크를 쓰지 않고, 개인 데이터를 저장하지 않는다 — 넘겨받은 계좌로 엔진만 돌려 돌려준다.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { rulesInput, rulesInputSchema, simulateInput, simulateInputSchema } from "./schemas";
import { listRules, runSimulate } from "./tools";

const server = new McpServer({ name: "my-pension-planner", version: "0.1.0" });

const asText = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

server.registerTool(
  "simulate",
  {
    title: "연금 시뮬레이션",
    description:
      "통합연금포털 계좌(연령별 연간 수령액, 천원)와 추가 입력으로 연도별 세전·실질·세금·건보료·가처분, 절벽·크레바스, 경고, 규칙 등급을 계산한다. 개인 데이터가 없으면 useDemo: true 로 합성 K씨를 쓴다.",
    inputSchema: simulateInput,
  },
  async (args) => {
    const parsed = simulateInputSchema.safeParse(args);
    if (!parsed.success) return { ...asText({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }), isError: true };
    return asText(runSimulate(parsed.data));
  },
);

server.registerTool(
  "rules",
  {
    title: "계산 규칙 목록",
    description: "엔진이 쓰는 세율·기준선·요율 규칙 — 값·근거 조문·등급(verified 조문 대조 / web / estimated)·확인일. grade·prefix 로 거른다.",
    inputSchema: rulesInput,
  },
  async (args) => asText(listRules(rulesInputSchema.parse(args))),
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
