/**
 * F1 — 통합연금포털 "예시연금액" 엑셀 임포터.
 * 실측 스키마(SPEC §3-1): row 1 단위·생년월, 헤더 행에 `연령`과 `NN세` 열, 상품 1행 = 계좌 1개,
 * 숨김 A열 유형코드(3 국민·2 퇴직·1 개인), C열 전각공백 패딩, E열 개시시점 2형식, 마지막 `합계` 행.
 * 브라우저 안에서만 실행된다 (SPEC N1).
 */
import * as XLSX from "xlsx";
import type { Account, AccountKind, ImportWarning, Owner } from "@/src/engine/model";
import { KIND_BY_PORTAL_CODE } from "@/src/engine/model";

export interface ParsedPortalExcel {
  birthYearMonth: string; // YYYY-MM
  accounts: Account[];
  totalByAge: Record<number, number>; // 합계 행 (천원)
  warnings: ImportWarning[];
}

type Cell = string | number | undefined;

const FULLWIDTH_SPACE = /[　\s]+/g;

function text(c: Cell): string {
  if (c === undefined || c === null) return "";
  return String(c).replace(/^[　\s]+|[　\s]+$/g, "");
}

function num(c: Cell): number {
  if (c === undefined || c === null || c === "") return 0;
  const n = typeof c === "number" ? c : Number(String(c).replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new Error(`숫자가 아닌 값: ${String(c)}`);
  return n;
}

/** `1968년07월` → `1968-07` */
export function parseBirthYearMonth(s: string): string | undefined {
  const m = /(\d{4})\s*년\s*(\d{1,2})\s*월/.exec(s);
  if (!m) return undefined;
  return `${m[1]}-${m[2]!.padStart(2, "0")}`;
}

/** `2036년 04월` → `2036-04` · `2031년` → `2031-01` + monthMissing */
export function parseStartDate(s: string): { value: string; monthMissing: boolean } | undefined {
  const m = /(\d{4})\s*년(?:\s*(\d{1,2})\s*월)?/.exec(s);
  if (!m) return undefined;
  if (m[2]) return { value: `${m[1]}-${m[2].padStart(2, "0")}`, monthMissing: false };
  return { value: `${m[1]}-01`, monthMissing: true };
}

/** 유형코드 + 상품명 → AccountKind. 퇴직·개인은 상품명 휴리스틱이며 PDF(F2)가 확정한다 */
export function classifyKind(code: string, product: string): AccountKind | undefined {
  const base = KIND_BY_PORTAL_CODE[code];
  if (!base) return undefined;
  if (base === "dc") return /IRP|퇴직연금RP/i.test(product) ? "irp" : "dc";
  if (base === "savings") return /보험/.test(product) && !/연금저축/.test(product) ? "insurance" : "savings";
  return base;
}

function toOwner(s: string): Owner {
  return s === "본인" ? "self" : "family";
}

export function parsePortalExcel(data: ArrayBuffer | Uint8Array): ParsedPortalExcel {
  const wb = XLSX.read(data, { type: data instanceof ArrayBuffer ? "array" : "buffer" });
  const firstName = wb.SheetNames[0];
  if (!firstName) throw new Error("시트가 없다");
  const ws = wb.Sheets[firstName]!;
  const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: undefined });

  // 헤더 행: `연령` 셀이 있는 첫 행
  const headerIdx = rows.findIndex((r) => r.some((c) => text(c) === "연령"));
  if (headerIdx < 0) throw new Error("헤더 행(연령)을 찾지 못했다 — 포털 예시연금액 엑셀이 아니다");
  const header = rows[headerIdx]!;
  const ageCols: Array<{ col: number; age: number }> = [];
  header.forEach((c, col) => {
    const m = /^(\d{2,3})\s*세$/.exec(text(c));
    if (m) ageCols.push({ col, age: Number(m[1]) });
  });
  if (ageCols.length === 0) throw new Error("연령 열(NN세)이 없다");

  // 생년월: 헤더 위 행들에서 찾는다
  let birthYearMonth: string | undefined;
  for (let i = 0; i < headerIdx && !birthYearMonth; i++) {
    for (const c of rows[i]!) {
      birthYearMonth = parseBirthYearMonth(text(c));
      if (birthYearMonth) break;
    }
  }
  if (!birthYearMonth) throw new Error("생년월(YYYY년MM월)을 찾지 못했다");

  const warnings: ImportWarning[] = [];
  const accounts: Account[] = [];
  let totalByAge: Record<number, number> | undefined;
  const counter: Partial<Record<AccountKind, number>> = {};

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]!;
    const label = text(r[1]);
    if (label === "합계") {
      totalByAge = Object.fromEntries(ageCols.map(({ col, age }) => [age, num(r[col])]));
      break;
    }
    const code = text(r[0]);
    if (!code) continue; // 빈 행
    const product = text(r[3]);
    const kind = classifyKind(code, product);
    if (!kind) throw new Error(`알 수 없는 유형코드 ${code} (row ${i + 1})`);
    const flowByAge: Record<number, number> = Object.fromEntries(ageCols.map(({ col, age }) => [age, num(r[col])]));
    const subtotal = Object.values(flowByAge).reduce((s, v) => s + v, 0);
    const n = (counter[kind] = (counter[kind] ?? 0) + 1);
    const id = `${kind}-${n}`;
    const start = parseStartDate(text(r[4]));
    if (!start) throw new Error(`개시 시점을 읽지 못했다: "${text(r[4])}" (row ${i + 1})`);
    if (start.monthMissing) warnings.push({ code: "start-month-missing", accountId: id, message: `${product}: 개시 월이 없어 1월로 가정했다` });
    const owner = toOwner(text(r[1]));
    if (owner === "family") warnings.push({ code: "family-row", accountId: id, message: `${product}: 가족 행 — 부부 합산은 2차 범위라 대시보드에서는 제외된다` });
    if (subtotal === 0) warnings.push({ code: "db-shell", accountId: id, message: `${product}: 수령액이 전부 0이다 — 전망에서 빠진다` });
    accounts.push({ id, kind, owner, institution: text(r[2]).replace(FULLWIDTH_SPACE, " "), product, startDate: start.value, flowByAge });
  }

  if (!totalByAge) throw new Error("합계 행이 없다");
  // 합계 검증 — 상품 합과 합계 행이 다르면 파일이 손상됐거나 형식이 바뀐 것이다
  for (const { age } of ageCols) {
    const sum = accounts.reduce((s, a) => s + (a.flowByAge[age] ?? 0), 0);
    if (Math.abs(sum - (totalByAge[age] ?? 0)) > 0.5) {
      throw new Error(`합계 검증 실패: ${age}세 상품 합 ${sum} ≠ 합계 행 ${totalByAge[age]}`);
    }
  }
  if (accounts.length === 0) throw new Error("상품 행이 없다");

  return { birthYearMonth, accounts, totalByAge, warnings };
}
