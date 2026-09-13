// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSources, checkBuild } from "../scripts/check_no_fetch.mjs";

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "nofetch-"));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
}

describe("M6-3 네트워크 호출 검사 (N1)", () => {
  it("소스 — fetch 는 src/lawSearch.ts 에만 허용", () => {
    const ok = tree({ "src/lawSearch.ts": "await fetch(url)", "app/page.tsx": "export default 1" });
    expect(checkSources(ok)).toEqual([]);
    const bad = tree({ "src/lawSearch.ts": "fetch(url)", "components/X.tsx": "const r = await fetch('https://evil.example')", "src/y.ts": "new WebSocket(u); navigator.sendBeacon(u)" });
    const problems = checkSources(bad);
    expect(problems.map((p: { file: string }) => p.file).sort()).toEqual(["components/X.tsx", "src/y.ts"]);
  });

  it("빌드 — 허용하지 않은 호스트 주소가 있으면 실패", () => {
    const out = tree({ "out/_next/static/chunks/a.js": 'x="https://www.law.go.kr/DRF/lawSearch.do";y="http://www.w3.org/2000/svg"', "out/index.html": "<html></html>" });
    expect(checkBuild(join(out, "out"), {})).toEqual([]);
    const bad = tree({ "out/_next/static/chunks/b.js": 'fetch("https://tracker.example.com/collect")' });
    const problems = checkBuild(join(bad, "out"), {});
    expect(problems.some((p: { reason: string }) => /tracker\.example\.com/.test(p.reason))).toBe(true);
  });

  it("빌드 — 네트워크 API 는 알려진 라이브러리 청크(pdf.js·Next 런타임·polyfill)에만", () => {
    const out = tree({
      "out/_next/static/chunks/pdf.js": "GlobalWorkerOptions; fetch(x)",
      "out/_next/static/chunks/router.js": 'headers:{RSC:"1"}; fetch(u)',
      "out/_next/static/chunks/poly.js": "core-js polyfill; new XMLHttpRequest",
      "out/_next/static/chunks/app.js": "await fetch(somewhere)",
    });
    const problems = checkBuild(join(out, "out"), {});
    expect(problems.map((p: { file: string }) => p.file)).toEqual(["_next/static/chunks/app.js"]);
  });

  it("빌드 — 법제처 키가 산출물에 실리면 실패 (배포 전 보안)", () => {
    const out = tree({ "out/_next/static/chunks/c.js": 'const k="my-secret-oc"' });
    const problems = checkBuild(join(out, "out"), { lawKey: "my-secret-oc" });
    expect(problems.some((p: { reason: string }) => /법제처 키/.test(p.reason))).toBe(true);
    expect(JSON.stringify(problems)).not.toContain("my-secret-oc");
  });
});
