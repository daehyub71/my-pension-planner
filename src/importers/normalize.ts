/** 엑셀(흐름) + PDF(적립금·개시일) + 추가 입력 → Snapshot. 짝 맞추기는 기관·유형으로 한다. */
import type { Account, AccountKind, ImportWarning, Inputs, Snapshot } from "@/src/engine/model";
import { validateInputs } from "@/src/engine/inputs";
import type { ParsedPortalExcel } from "./xlsx";
import type { ParsedContractPdf } from "./pdf";

function norm(s: string): string {
  return s.replace(/[\s　]/g, "");
}

/** 엑셀 휴리스틱과 PDF 상품유형이 같은 묶음인가 (퇴직 2 = dc·irp, 개인 1 = savings·insurance) */
function sameGroup(a: AccountKind, b: AccountKind): boolean {
  const g = (k: AccountKind): string => (k === "dc" || k === "irp" ? "retire" : k === "savings" || k === "insurance" ? "private" : k);
  return g(a) === g(b);
}

export function mergeContract(excelAccounts: Account[], pdf: ParsedContractPdf): { accounts: Account[]; warnings: ImportWarning[] } {
  const accounts = excelAccounts.map((a) => ({ ...a, flowByAge: { ...a.flowByAge } }));
  const warnings: ImportWarning[] = [...pdf.warnings];
  const taken = new Set<string>();

  for (const p of pdf.accounts) {
    if (p.kind === "db") {
      warnings.push({ code: "pdf-unmatched", message: `DB 퇴직연금(${p.institution}) 적립금 ${p.balance?.toLocaleString() ?? "?"}원은 엑셀 흐름에 짝이 없다 — 수동 확인 필요` });
      continue;
    }
    const pInst = norm(p.institution);
    const exact = accounts.find((a) => !taken.has(a.id) && a.owner === "self" && a.kind === p.kind && norm(a.institution) === pInst);
    const loose = exact ?? accounts.find((a) => !taken.has(a.id) && a.owner === "self" && sameGroup(a.kind, p.kind) && norm(a.institution) === pInst);
    if (!loose) {
      warnings.push({ code: "pdf-unmatched", message: `PDF 계좌 ${p.institution} ${p.productType}(${p.balance?.toLocaleString() ?? "?"}원)의 짝을 엑셀에서 찾지 못했다` });
      continue;
    }
    taken.add(loose.id);
    loose.kind = p.kind; // PDF 상품유형이 확정한다
    if (p.balance !== undefined) loose.balance = p.balance;
    if (p.joinDate) loose.joinDate = p.joinDate;
    if (p.asOf) loose.asOf = p.asOf;
    if (p.product && norm(p.product).length > norm(loose.product).length) loose.product = p.product;
  }

  if (pdf.national) {
    const nps = accounts.find((a) => a.kind === "national" && a.owner === "self");
    if (nps) {
      nps.monthlyAmount = pdf.national.monthlyAmount;
      if (pdf.asOf) nps.asOf = pdf.asOf;
      if (!nps.startDate.startsWith(String(pdf.national.startYear)))
        warnings.push({ code: "pdf-unmatched", message: `국민연금 개시년도가 다르다: 엑셀 ${nps.startDate} vs PDF ${pdf.national.startYear}` });
    } else {
      warnings.push({ code: "pdf-unmatched", message: "PDF 의 국민연금을 붙일 본인 행이 엑셀에 없다" });
    }
  }
  return { accounts, warnings };
}

export interface BuildSnapshotArgs {
  excel: ParsedPortalExcel;
  pdf?: ParsedContractPdf;
  inputs: Partial<Omit<Inputs, "birthYearMonth">>;
  rulesVersion: string;
  today?: string; // YYYY-MM-DD (테스트용)
}

export function buildSnapshot({ excel, pdf, inputs, rulesVersion, today }: BuildSnapshotArgs): Snapshot {
  const v = validateInputs({ ...inputs, birthYearMonth: excel.birthYearMonth });
  if (!v.ok) throw new Error(v.errors.map((e) => e.message).join(" / "));
  const merged = pdf ? mergeContract(excel.accounts, pdf) : { accounts: excel.accounts, warnings: [] as ImportWarning[] };
  return {
    asOf: pdf?.asOf ?? today ?? new Date().toISOString().slice(0, 10),
    accounts: merged.accounts,
    inputs: v.inputs,
    rulesVersion,
    warnings: [...excel.warnings, ...merged.warnings],
  };
}
