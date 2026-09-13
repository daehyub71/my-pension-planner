/**
 * F2 — 통합연금포털 "연금계약정보" PDF 임포터.
 * 두 층으로 나뉜다: extractTextItems(pdfjs, 브라우저) → parseContractItems(순수 함수, 테스트 대상).
 * 실측(SPEC §3-2): 표 셀이 같은 x 에 여러 줄로 쪼개지고("207,52" / "9,847"), 행마다 우측에 「계약상세」 버튼이 있으며,
 * 셀 하나가 페이지 경계에서 잘려 다음 페이지 머리에 조각이 남는다.
 */
import type { AccountKind, ImportWarning } from "@/src/engine/model";

export interface TextItem {
  str: string;
  x: number;
  y: number;
  page: number;
}

export interface ContractAccount {
  kind: AccountKind;
  institution: string;
  productType: string;
  product: string;
  joinDate?: string; // YYYY-MM-DD
  startDate?: string; // YYYY-MM-DD (포털 "만 60세 가정")
  balance?: number; // 원
  asOf?: string; // YYYY-MM-DD
}

export interface ParsedContractPdf {
  national?: { monthlyAmount: number; startYear: number };
  accounts: ContractAccount[];
  dbShells: number;
  asOf?: string;
  warnings: ImportWarning[];
}

const HEADER_LABELS = ["가입회사", "가입자 구분"];
const REGION_END = /^(예상 )?적립금 합계금액|^추가된 연금이 없습니다/;
const ROW_REACH = 40; // 행 앵커(버튼)에서 이 거리 안의 조각은 그 행의 것
const COL_REACH = 40;
/**
 * 페이지 경계에서 잘린 셀의 뒷조각은 **열의 x 와 정확히 같은 자리**에서 다시 그려진다.
 * 실측(2026-09-09): 3쪽 머리의 「평생연금」「저축」은 x=159 로 상품명 열과 0px 차이였고,
 * 같은 띠에 있던 이동경로 「홈」(x=44)·「내연금조회」(x=107)는 8~10px 어긋나 있었다.
 * 이 값을 COL_REACH 처럼 느슨하게 두면 페이지 장식이 기관명·상품유형에 섞여 들어간다.
 */
const CONTINUATION_X_TOLERANCE = 3;

interface Column {
  x: number;
  label: string;
}

interface Table {
  type: "national" | "db" | "account";
  page: number;
  headerY: number;
  columns: Column[];
  endY: number;
  /** 헤더 자리에 쓰인 조각들 — 여러 줄 헤더의 아랫줄이 본문으로 새어 들어가지 않게 뺀다 */
  headerItems: Set<TextItem>;
}

function clean(items: TextItem[]): TextItem[] {
  return items.map((it) => ({ ...it, str: it.str.trim() })).filter((it) => it.str.length > 0);
}

function columnOf(columns: Column[], x: number): number {
  let best = -1;
  let dist = COL_REACH;
  columns.forEach((c, i) => {
    const d = Math.abs(c.x - x);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

function findTables(items: TextItem[]): Table[] {
  const tables: Table[] = [];
  for (const h of items) {
    if (!HEADER_LABELS.includes(h.str)) continue;
    const same = items.filter((it) => it.page === h.page);
    const headerItems = same.filter((it) => Math.abs(it.y - h.y) <= 20 && it.x >= h.x - 5);
    // x 로 묶어 열을 만든다
    const cols: Column[] = [];
    for (const it of headerItems.sort((a, b) => a.x - b.x || b.y - a.y)) {
      const last = cols[cols.length - 1];
      if (last && Math.abs(last.x - it.x) < 12) last.label += it.str;
      else cols.push({ x: it.x, label: it.str });
    }
    const labels = cols.map((c) => c.label.replace(/\s/g, "")).join("|");
    const type: Table["type"] | undefined = labels.includes("가입자구분") ? "national" : labels.includes("입사") ? "db" : labels.includes("가입일") ? "account" : undefined;
    if (!type) continue;
    // 영역 끝: 헤더 아래에서 가장 가까운 합계 줄·다음 헤더
    const below = same.filter((it) => it.y < h.y - 12 && (REGION_END.test(it.str) || HEADER_LABELS.includes(it.str)));
    const endY = below.length ? Math.max(...below.map((it) => it.y)) : -Infinity;
    tables.push({ type, page: h.page, headerY: h.y, columns: cols, endY, headerItems: new Set(headerItems) });
  }
  return tables.sort((a, b) => a.page - b.page || b.headerY - a.headerY);
}

function toDate(s: string): string | undefined {
  const m = /(\d{4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/.exec(s.replace(/\s/g, ""));
  if (!m) return undefined;
  return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
}

function toInt(s: string): number | undefined {
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  return Number(digits);
}

export function kindOfProductType(t: string): AccountKind | undefined {
  const s = t.replace(/\s/g, "");
  if (/IRP/i.test(s)) return "irp";
  if (/DC/.test(s)) return "dc";
  if (/DB/.test(s)) return "db";
  // 「연금저축」 명칭만 연금계좌다 (소득세법 시행령 제40조의2 ①) — 연금저축보험은 보험보다 먼저 본다
  if (/연금저축|신탁|펀드/.test(s)) return "savings";
  if (/보험/.test(s)) return "insurance";
  return undefined;
}

export function parseContractItems(raw: TextItem[]): ParsedContractPdf {
  const items = clean(raw);
  const tables = findTables(items);
  const out: ParsedContractPdf = { accounts: [], dbShells: 0, warnings: [] };
  if (tables.length === 0) {
    out.warnings.push({ code: "pdf-unmatched", message: "연금계약정보 표를 찾지 못했다 — 수동 입력으로 진행한다" });
    return out;
  }

  // 마지막으로 만든 행의 셀들 — 페이지 경계에서 잘린 조각을 이어 붙일 곳
  let lastCells: string[] | undefined;
  let lastColumns: Column[] | undefined;
  let lastCommit: (() => void) | undefined;

  for (const t of tables) {
    const region = items.filter((it) => it.page === t.page && it.y < t.headerY - 12 && it.y > t.endY && !t.headerItems.has(it));
    const remarkX = t.columns[t.columns.length - 1]?.x ?? Infinity;
    const anchors = region.filter((it) => it.x >= remarkX - 20).map((it) => it.y).sort((a, b) => b - a);
    const assigned = new Set<TextItem>();

    // 고아 조각: 어느 앵커에도 닿지 않는 것 → 직전 행에서 잘린 셀의 뒷조각일 수 있다.
    // 잘린 조각은 ① 그 표의 첫 행보다 위에 있고 ② 열 x 와 거의 정확히 겹친다. 둘 다 아니면 페이지 장식이다.
    const topAnchor = anchors.length ? anchors[0]! : -Infinity;
    for (const it of region) {
      if (it.x >= remarkX - 20) continue;
      const near = anchors.some((ay) => Math.abs(it.y - ay) <= ROW_REACH);
      if (near || !lastCells || !lastColumns) continue;
      if (it.y <= topAnchor) continue;
      const ci = lastColumns.findIndex((c) => Math.abs(c.x - it.x) <= CONTINUATION_X_TOLERANCE);
      if (ci < 0) continue;
      lastCells[ci] = (lastCells[ci] ?? "") + it.str;
      assigned.add(it);
    }
    if (lastCommit) lastCommit();
    lastCommit = undefined;

    for (const ay of anchors) {
      const cells: string[] = t.columns.map(() => "");
      const rowItems = region.filter((it) => !assigned.has(it) && it.x < remarkX - 20 && Math.abs(it.y - ay) <= ROW_REACH).sort((a, b) => b.y - a.y || a.x - b.x);
      for (const it of rowItems) {
        const ci = columnOf(t.columns, it.x);
        if (ci < 0) continue;
        cells[ci] = (cells[ci] ?? "") + it.str;
        assigned.add(it);
      }
      const commit = (): void => {
        if (t.type === "national") {
          const startYear = toInt(cells[2] ?? "");
          const monthlyAmount = toInt(cells[3] ?? "");
          if (startYear && monthlyAmount) out.national = { monthlyAmount, startYear };
        } else if (t.type === "db") {
          const bal = cells[5] ?? "";
          if (/미입력/.test(bal) || toInt(bal) === undefined) {
            out.dbShells += 1;
            out.warnings.push({ code: "db-shell", message: "퇴직연금 DB 1건 — 퇴직금정보 미입력. 전망에 포함되지 않았다 (DB→DC 전환 이력이면 무시해도 된다)" });
          } else {
            out.accounts.push({ kind: "db", institution: cells[0] ?? "", productType: "DB", product: cells[2] ?? "", balance: toInt(bal) });
          }
        } else {
          const productType = cells[1] ?? "";
          const kind = kindOfProductType(productType);
          if (!kind) {
            out.warnings.push({ code: "pdf-unmatched", message: `상품유형을 모른다: "${productType}"` });
            return;
          }
          out.accounts.push({
            kind,
            institution: cells[0] ?? "",
            productType,
            product: cells[2] ?? "",
            joinDate: toDate(cells[3] ?? ""),
            startDate: toDate(cells[4] ?? ""),
            balance: toInt(cells[5] ?? ""),
            asOf: toDate(cells[6] ?? ""),
          });
        }
      };
      lastCells = cells;
      lastColumns = t.columns;
      lastCommit = commit;
      // 다음 표의 고아 조각이 이 행에 붙을 수 있으므로 커밋을 미룬다 — 단 같은 표의 다음 행이 오면 즉시 커밋
      if (ay !== anchors[anchors.length - 1]) {
        commit();
        lastCommit = undefined;
      }
    }
  }
  if (lastCommit) lastCommit();

  const asOfs = out.accounts.map((a) => a.asOf).filter((d): d is string => !!d);
  if (asOfs.length) {
    const counts = new Map<string, number>();
    for (const d of asOfs) counts.set(d, (counts.get(d) ?? 0) + 1);
    out.asOf = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }
  return out;
}

/** pdfjs 로 텍스트 조각을 뽑는다. 브라우저에서는 워커를 public/ 에서 읽는다 (postinstall 이 복사). */
export async function extractTextItems(data: Uint8Array): Promise<TextItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined" && typeof Worker !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const items: TextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      items.push({ str: it.str, x: it.transform[4] as number, y: it.transform[5] as number, page: p });
    }
  }
  return items;
}
