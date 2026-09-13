#!/usr/bin/env node
/**
 * F17 — 법규 라이브러리 발췌 수집 (빌드 시점, 정적). 런타임 네트워크 호출이 아니다 (N1).
 *
 * korean-law-mcp CLI 로 현행 조문을 받아 content/law/library.json 에 쓴다.
 * 법제처 키(LAW_OC)는 환경변수 또는 .env.local 에서 읽고, 화면·로그에 찍지 않는다.
 *   node scripts/collect_law.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function lawKey() {
  if (process.env.LAW_OC) return process.env.LAW_OC;
  const envFile = join(root, ".env.local");
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, "utf8").match(/^LAW_OC=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("LAW_OC 가 없다 — .env.local 에 LAW_OC=발급키 를 넣는다");
}

const MST = { 국민연금법: "280269", 소득세법: "280405", "소득세법 시행령": "286211", "국민건강보험법 시행령": "283469", "국민건강보험법 시행규칙": "288087" };

/** pick 이 있으면 그 줄들만(조문 제목 줄은 늘 남긴다), 없으면 앞에서 max 자까지 문단 단위로 */
const TOPICS = [
  {
    key: "early-deferral",
    label: "조기·연기 수령",
    articles: [
      { law: "국민연금법", jo: "제61조" },
      { law: "국민연금법", jo: "제62조", pick: ["^①", "^②"] },
      { law: "국민연금법", jo: "제63조", pick: ["^②", "^\\d\\. 5\\d세부터"] },
    ],
  },
  {
    key: "withdrawal-limit",
    label: "수령 한도",
    articles: [{ law: "소득세법 시행령", jo: "제40조의2", pick: ["^③", "^1\\. 가입자가 55세", "^2\\. 연금계좌의 가입일", "^3\\. 과세기간 개시일", "^④", "^1\\. 2013년", "^⑤"] }],
  },
  {
    key: "pension-tax",
    label: "연금 세율",
    articles: [
      { law: "소득세법", jo: "제14조", pick: ["^9\\. 제20조의3", "^가\\. 제20조의3제1항제2호가목", "^나\\. 제20조의3제1항제2호나목", "^다\\. 가목 및 나목 외의 연금소득"] },
      { law: "소득세법", jo: "제47조의2", pick: ["^①"] },
      { law: "소득세법", jo: "제55조", pick: ["^①"] },
      { law: "소득세법", jo: "제64조의4" },
      { law: "소득세법", jo: "제129조", pick: ["^5의2\\.", "^가\\. 연금소득자의 나이", "^[│┌├└]", "^다\\. 사망할 때까지", "^5의3\\.", "^[가나다]\\. 연금 실제 수령연차"] },
    ],
  },
  {
    key: "insurance",
    label: "연금보험·보험차익",
    articles: [
      { law: "소득세법 시행령", jo: "제40조의2", pick: ["^① 법 제20조의3", "^1\\. 다음 각 목의 어느 하나에 해당하는 금융회사", "^2\\. 퇴직연금을 지급받기"] },
      { law: "소득세법 시행령", jo: "제25조", pick: ["^③", "^1\\. 계약자 1명당", "^가\\. 2017년 3월 31일", "^나\\. 2017년 4월 1일"] },
    ],
  },
  {
    key: "health",
    label: "건강보험",
    articles: [
      { law: "국민건강보험법 시행령", jo: "제41조", pick: ["^①", "^5\\. 연금소득", "^⑤"] },
      { law: "국민건강보험법 시행령", jo: "제44조" },
      { law: "국민건강보험법 시행규칙", jo: "제44조", pick: ["^①", "^5\\. 영 제41조제1항제5호", "^②", "^2\\. 영 제41조제1항제4호"] },
      { law: "국민건강보험법 시행규칙", annex: "별표1의2", max: 1400 },
    ],
  },
  {
    key: "voluntary",
    label: "추납·임의가입",
    articles: [
      { law: "국민연금법", jo: "제92조", pick: ["^①", "^1\\. 연금보험료를 최초로", "^3\\. 「병역법」"] },
      { law: "국민연금법", jo: "제10조" },
      { law: "국민연금법", jo: "제13조", pick: ["^①", "^1\\. 국민연금 가입자"] },
    ],
  },
  {
    key: "split-survivor",
    label: "분할·유족·압류",
    articles: [
      { law: "국민연금법", jo: "제64조", pick: ["^①", "^1\\. 배우자와", "^2\\. 배우자였던", "^3\\. 60세", "^②"] },
      { law: "국민연금법", jo: "제74조" },
      { law: "국민연금법", jo: "제58조" },
    ],
  },
];

function cli(args, key) {
  return execFileSync("npx", ["--yes", "--ignore-scripts", "--omit=optional", "-p", "korean-law-mcp", "korean-law", ...args], {
    env: { ...process.env, LAW_OC: key },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function cut(lines, max) {
  const out = [];
  let n = 0;
  for (const l of lines) {
    if (n + l.length > max && out.length > 0) break;
    out.push(l);
    n += l.length;
  }
  return out.join("\n");
}

function parseArticle(raw, spec) {
  const lines = raw.split("\n").map((l) => l.trimEnd());
  const enforced = (lines.find((l) => l.startsWith("시행일:")) ?? "").replace("시행일:", "").trim();
  // 본문 첫 줄이 「제N조(제목)」으로 시작하지 않는 조문도 있다 — 그때는 머리줄 「제N조 제목」을 쓴다
  let titleIdx = lines.findIndex((l) => new RegExp(`^${spec.jo}\\(`).test(l));
  let title;
  let first;
  if (titleIdx >= 0) {
    title = lines[titleIdx].match(/^(제[\d조의]+\([^)]*\))/)?.[1] ?? spec.jo;
    first = lines[titleIdx].slice(title.length).trim();
  } else {
    titleIdx = lines.findIndex((l) => l.startsWith(`${spec.jo} `));
    if (titleIdx < 0) throw new Error(`${spec.law} ${spec.jo}: 조문을 찾지 못했다`);
    title = `${spec.jo}(${lines[titleIdx].slice(spec.jo.length).trim()})`;
    first = "";
  }
  const body = [first, ...lines.slice(titleIdx + 1)].filter((l) => l && !l.startsWith("💡") && !l.startsWith("ℹ️") && !l.startsWith("특정 조문 조회") && !l.startsWith("여러 조문"));
  const picked = spec.pick ? body.filter((l) => spec.pick.some((p) => new RegExp(p).test(l))) : body;
  return { title, enforced, excerpt: cut(picked, spec.max ?? 900) };
}

function parseAnnex(raw, spec) {
  const text = raw
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("(파일 형식"));
  const title = text[0] ?? spec.annex;
  return { title: `[${spec.annex}] ${title.replace(/^.*? - /, "")}`, enforced: "", excerpt: cut(text.slice(1), spec.max ?? 900) };
}

const key = lawKey();
const topics = [];
for (const t of TOPICS) {
  const articles = [];
  for (const spec of t.articles) {
    const got = spec.annex ? parseAnnex(cli(["get_annexes", "--lawName", `${spec.law} ${spec.annex}`], key), spec) : parseArticle(cli(["get_law_text", "--mst", MST[spec.law], "--jo", spec.jo], key), spec);
    const url = spec.annex ? `https://www.law.go.kr/법령/${spec.law}` : `https://www.law.go.kr/법령/${spec.law}/${spec.jo}`;
    articles.push({ law: spec.law, ref: spec.annex ?? spec.jo, title: got.title, enforced: got.enforced, excerpt: got.excerpt, url });
    process.stdout.write(`  ${t.label} · ${spec.law} ${spec.annex ?? spec.jo} (${got.excerpt.length}자)\n`);
  }
  topics.push({ key: t.key, label: t.label, articles });
}

const outDir = join(root, "content", "law");
mkdirSync(outDir, { recursive: true });
const collectedAt = new Date().toISOString().slice(0, 10);
writeFileSync(join(outDir, "library.json"), JSON.stringify({ collectedAt, source: "법제처 국가법령정보 (korean-law-mcp)", topics }, null, 2) + "\n");
process.stdout.write(`content/law/library.json — 주제 ${topics.length}개, 조문 ${topics.reduce((s, t) => s + t.articles.length, 0)}개\n`);
