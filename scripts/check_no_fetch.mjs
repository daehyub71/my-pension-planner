#!/usr/bin/env node
/**
 * M6-3 — N1 로컬 우선 검사. 빌드 뒤(postbuild)와 CI 에서 돈다.
 *  ① 소스: 네트워크 API(fetch·XMLHttpRequest·WebSocket·EventSource·sendBeacon)는 src/lawSearch.ts 에만.
 *  ② 산출물(out/): 주소 문자열의 호스트는 허용 목록만 · 네트워크 API 는 알려진 라이브러리 청크에만.
 *  ③ 산출물에 법제처 키(LAW_OC)가 실리면 실패 — 키 값은 출력하지 않는다.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const NET_API = /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|new\s+EventSource|sendBeacon/;
const SOURCE_DIRS = ["app", "components", "src"];
const SOURCE_ALLOW = new Set(["src/lawSearch.ts"]);

/** 코드가 실제로 부르는 곳은 law.go.kr 뿐. 나머지는 XML 네임스페이스·오류 안내 문서·라이브러리 예시 문자열이다 */
const HOST_ALLOW = [
  "www.law.go.kr",
  "www.w3.org", "www.xfa.org", "schemas.openxmlformats.org", "schemas.microsoft.com", "ns.adobe.com", "purl.org", "purl.oclc.org", "www.apache.org",
  "nextjs.org", "react.dev", "github.com",
  "a", "x", "n", "foo.bar", "example.com", "localhost",
];

/** 네트워크 API 가 들어 있어도 되는 청크의 지문 — pdf.js(파일 읽기용 워커) · Next 라우터(같은 출처 RSC) · Next noModule polyfill */
const CHUNK_SIGNATURES = [/GlobalWorkerOptions|pdfjs/, /\bRSC\b/, /core-js/];

function walk(dir, exts) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

export function checkSources(root) {
  const problems = [];
  for (const d of SOURCE_DIRS) {
    for (const file of walk(join(root, d), [".ts", ".tsx", ".js", ".mjs"])) {
      const rel = relative(root, file).split("\\").join("/");
      if (SOURCE_ALLOW.has(rel)) continue;
      if (NET_API.test(readFileSync(file, "utf8"))) problems.push({ file: rel, reason: "네트워크 API 는 src/lawSearch.ts 에만 둔다 (N1)" });
    }
  }
  return problems;
}

export function checkBuild(outDir, { lawKey } = {}) {
  const problems = [];
  for (const file of walk(outDir, [".js", ".mjs", ".html", ".txt", ".json"])) {
    const rel = relative(outDir, file).split("\\").join("/");
    const body = readFileSync(file, "utf8");
    const hosts = new Set([...body.matchAll(/https?:\/\/([a-zA-Z0-9._-]+)/g)].map((m) => m[1]));
    for (const h of hosts) if (!HOST_ALLOW.includes(h)) problems.push({ file: rel, reason: `허용하지 않은 호스트 ${h}` });
    if (/\.(m?js)$/.test(rel) && NET_API.test(body) && !CHUNK_SIGNATURES.some((s) => s.test(body))) problems.push({ file: rel, reason: "알 수 없는 청크에 네트워크 API" });
    if (lawKey && lawKey.length >= 4 && body.includes(lawKey)) problems.push({ file: rel, reason: "법제처 키가 산출물에 들어 있다 — 배포 금지" });
  }
  return problems;
}

function readLawKey(root) {
  if (process.env.LAW_OC) return process.env.LAW_OC;
  const f = join(root, ".env.local");
  if (!existsSync(f)) return undefined;
  return readFileSync(f, "utf8").match(/^LAW_OC=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const outDir = join(root, "out");
  const problems = [...checkSources(root), ...(existsSync(outDir) ? checkBuild(outDir, { lawKey: readLawKey(root) }) : [])];
  if (!existsSync(outDir)) process.stdout.write("out/ 이 없어 산출물 검사는 건너뛴다 (소스만 검사)\n");
  if (problems.length) {
    for (const p of problems) process.stderr.write(`✗ ${p.file} — ${p.reason}\n`);
    process.exit(1);
  }
  process.stdout.write("✓ 네트워크 호출 검사 통과 — src/lawSearch.ts(법제처 opt-in) 외 호출 없음, 산출물에 키 없음\n");
}
