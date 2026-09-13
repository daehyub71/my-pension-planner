"use client";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";

import type { Account, Inputs, Snapshot } from "@/src/engine/model";
import { compareSnapshots, validateInputs } from "@/src/engine";
import { parsePortalExcel, type ParsedPortalExcel } from "@/src/importers/xlsx";
import { parseContractItems, extractTextItems, type ParsedContractPdf } from "@/src/importers/pdf";
import { buildSnapshot, mergeContract } from "@/src/importers/normalize";
import { applyManualContract } from "@/src/importers/manual";
import { RULES } from "@/src/rules/loader";
import { clearSnapshots, serializeSnapshot, parseSnapshotJson, deleteSnapshot } from "@/src/store/snapshots";
import { writeSession, refreshSession, subscribeSession, readSession, readServerSession, readSnapshotList, readServerSnapshotList } from "@/src/store/session";
import { KIND_LABEL, wonReadable, manwon, eok } from "@/src/format";

// 엔진(tax.ts)이 원천 구성을 적용하는 계좌 유형
const MIX_KINDS = new Set<Account["kind"]>(["dc", "irp", "savings"]);

/** 계좌별 원천 구성 입력값 (만원) */
interface MixForm {
  exempt?: number;
  deferredSeverance?: number;
  deferredSeveranceTax?: number;
}

interface FileState {
  name: string;
  size: number;
  ok: boolean;
  detail: string;
}

export default function DataPage() {
  const router = useRouter();
  const [excel, setExcel] = useState<ParsedPortalExcel | undefined>();
  const [pdf, setPdf] = useState<ParsedContractPdf | undefined>();
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState<Record<string, string>>({});
  const snapshots = useSyncExternalStore(subscribeSession, readSnapshotList, readServerSnapshotList);
  const current = useSyncExternalStore(subscribeSession, readSession, readServerSession);
  // 추가 입력은 현재 스냅샷 값으로 채워 두고, 고친 값만 따로 든다 (2026-09-13 — 이펙트 없이 불러오기)
  const [editedForm, setForm] = useState<Partial<Inputs> | undefined>();
  const form: Partial<Inputs> = editedForm ?? current?.inputs ?? DEFAULT_FORM;
  const [editedMix, setMix] = useState<Record<string, MixForm> | undefined>();
  const [savedNote, setSavedNote] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);

  const ingest = useCallback(async (list: FileList | File[]) => {
    setBusy(true);
    setError(undefined);
    const next: FileState[] = [];
    for (const f of Array.from(list)) {
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        if (/\.xlsx?$/i.test(f.name)) {
          const parsed = parsePortalExcel(buf);
          setExcel(parsed);
          const grand = Object.values(parsed.totalByAge).reduce((s, v) => s + v, 0);
          next.push({ name: f.name, size: f.size, ok: true, detail: `상품 ${parsed.accounts.length}건 · 합계 검증 일치 · 총 ${manwon(grand)}원` });
        } else if (/\.pdf$/i.test(f.name)) {
          const parsed = parseContractItems(await extractTextItems(buf));
          setPdf(parsed);
          const n = parsed.accounts.length;
          next.push({
            name: f.name,
            size: f.size,
            ok: n > 0,
            detail: n > 0 ? `적립금 ${n}계좌 추출 · 조회기준 ${parsed.asOf ?? "미상"}` : "표를 찾지 못했다 — 아래에서 손으로 넣으세요",
          });
        } else {
          next.push({ name: f.name, size: f.size, ok: false, detail: "xlsx 또는 pdf 만 읽습니다" });
        }
      } catch (e) {
        next.push({ name: f.name, size: f.size, ok: false, detail: e instanceof Error ? e.message : "읽지 못했다" });
      }
    }
    setFiles((prev) => [...prev.filter((p) => !next.some((n) => n.name === p.name)), ...next]);
    setBusy(false);
  }, []);

  // 짝을 맞춘 계좌 미리보기 — 적립금이 비면 손으로 넣을 자리를 만든다
  const merged: Account[] = excel ? (pdf ? mergeContract(excel.accounts, pdf).accounts : excel.accounts) : [];
  const withManual = merged.length
    ? applyManualContract(
        merged,
        Object.entries(manual)
          .filter(([, v]) => v.trim() !== "")
          .map(([accountId, v]) => ({ accountId, balance: Math.round(Number(v.replace(/[^\d.]/g, "")) * 10000) })),
      )
    : [];
  const warnings = excel ? [...excel.warnings, ...(pdf ? mergeContract(excel.accounts, pdf).warnings : [])] : [];
  const validation = validateInputs({ ...form, birthYearMonth: excel?.birthYearMonth ?? current?.inputs.birthYearMonth });

  // M4-8 원천 구성 — 엔진이 원천 구성을 쓰는 본인 dc·irp·연금저축 계좌만 (만원 입력)
  // 파일을 새로 넣었으면 그 계좌, 아니면 현재 스냅샷 계좌에 원천 구성을 넣는다
  const mixSource = excel ? withManual : (current?.accounts ?? []);
  const mixAccounts = mixSource.filter((a) => a.owner === "self" && MIX_KINDS.has(a.kind));
  const mix: Record<string, MixForm> = editedMix ?? (excel ? {} : mixFromSnapshot(mixAccounts));
  const mixRows = mixAccounts.map((a) => {
    const m = mix[a.id] ?? {};
    const exempt = (m.exempt ?? 0) * 10000;
    const deferredSeverance = (m.deferredSeverance ?? 0) * 10000;
    const entered = m.exempt !== undefined || m.deferredSeverance !== undefined || m.deferredSeveranceTax !== undefined;
    const over = a.balance !== undefined && exempt + deferredSeverance > a.balance;
    const missingTax = (m.deferredSeverance ?? 0) > 0 && m.deferredSeveranceTax === undefined;
    return { account: a, m, exempt, deferredSeverance, entered, over, missingTax };
  });
  const mixOk = mixRows.every((r) => !r.over);

  // F18 — 가장 최근 두 스냅샷(조회기준일이 다른)을 견준다
  const previous = snapshots.find((s) => current && s.asOf !== current.asOf);
  const comparison = current && previous ? compareSnapshots(previous, current) : undefined;

  const start = () => {
    if (!excel) return;
    try {
      const snap = buildSnapshot({ excel, pdf, inputs: form, rulesVersion: RULES.version });
      const balances = Object.fromEntries(withManual.map((a) => [a.id, a.balance]));
      const mixes = Object.fromEntries(mixRows.filter((r) => r.entered).map((r) => [r.account.id, r]));
      const finalAccounts = snap.accounts.map((a) => applyMix(a.balance === undefined && balances[a.id] !== undefined ? { ...a, balance: balances[a.id] } : a, mixes[a.id]));
      writeSession({ ...snap, accounts: finalAccounts });
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "스냅샷을 만들지 못했다");
    }
  };

  // 파일 없이 현재 스냅샷의 추가 입력·원천 구성만 고쳐 저장한다
  const saveInputs = () => {
    if (!current || !validation.ok || !mixOk) return;
    const mixes = Object.fromEntries(mixRows.map((r) => [r.account.id, r]));
    const accounts = current.accounts.map((a) => (mixes[a.id] ? applyMix({ ...a, sourceMix: undefined }, mixes[a.id]) : a));
    writeSession({ ...current, inputs: validation.inputs, accounts });
    setForm(undefined);
    setMix(undefined);
    setSavedNote(`${current.asOf} 스냅샷에 저장했습니다`);
  };

  const exportJson = (s: Snapshot) => {
    const blob = new Blob([serializeSnapshot(s)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snapshot-${s.asOf}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (f: File) => {
    try {
      const s = parseSnapshotJson(await f.text());
      writeSession(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "스냅샷을 읽지 못했다");
    }
  };

  return (
    <AppShell>
      <div className="flex flex-1 gap-6 p-6 px-9">
        <section className="flex flex-[1.25] flex-col gap-4">
          <h1 className="font-title text-[22px] font-semibold">내 연금 데이터 불러오기</h1>
          <p className="max-w-[40em] text-sm text-ink-2">
            통합연금포털(fss.or.kr) → 내연금조회에서 <b>예시연금액 엑셀</b>과 <b>연금계약정보 PDF</b>를 내려받아 끌어다 놓으세요.{" "}
            <b>파일은 이 브라우저 안에서만 읽힙니다</b> — 서버로 전송되지 않습니다.
          </p>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void ingest(e.dataTransfer.files);
            }}
            className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-navy bg-surface p-8"
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="1.6" aria-hidden>
              <path d="M12 16V4" />
              <path d="M7 9l5-5 5 5" />
              <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <div className="text-[17px] font-bold">엑셀·PDF를 여기에 끌어다 놓기</div>
            <div className="text-[13px] text-ink-3">100lifeplan_*.xlsx (예시연금액) · 연금계약정보 PDF</div>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls,.pdf"
              multiple
              className="hidden"
              aria-label="연금 파일 선택"
              onChange={(e) => e.target.files && void ingest(e.target.files)}
            />
            <button type="button" onClick={() => fileInput.current?.click()} className="rounded-[9px] border-[1.5px] border-rule bg-paper px-5 py-2 text-[13.5px] font-medium text-ink-2 hover:bg-inset">
              {busy ? "읽는 중…" : "파일 선택"}
            </button>
          </div>

          {files.map((f) => (
            <div key={f.name} className="flex items-center gap-3 rounded-[10px] border border-rule bg-surface px-4.5 py-3">
              <span aria-hidden className={f.ok ? "text-good" : "text-danger"}>
                {f.ok ? "✓" : "✕"}
              </span>
              <div className="flex-1 text-sm">
                <b>{f.name}</b> <span className="text-ink-2">— {f.detail}</span>
              </div>
              <span className="text-[12.5px] text-ink-3">{(f.size / 1024).toFixed(1)}KB</span>
            </div>
          ))}

          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-3 rounded-[10px] border border-warn/40 bg-warn-bg px-4.5 py-3 text-[13.5px]">
              <span aria-hidden className="mt-0.5 text-warn">
                ⚠
              </span>
              <div>{w.message}</div>
            </div>
          ))}

          {merged.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-rule bg-surface">
              <div className="grid grid-cols-[1.1fr_1.6fr_0.8fr_1fr] bg-inset px-4.5 py-2.5 text-[12.5px] font-bold text-ink-2">
                <span>유형</span>
                <span>상품</span>
                <span>개시</span>
                <span className="text-right">적립금</span>
              </div>
              {merged.map((a) => (
                <div key={a.id} className="grid grid-cols-[1.1fr_1.6fr_0.8fr_1fr] items-center border-t border-rule px-4.5 py-2.5 text-[13.5px]">
                  <span>
                    {KIND_LABEL[a.kind] ?? a.kind}
                    {a.owner === "family" && <span className="ml-1 text-[11px] text-ink-3">가족</span>}
                  </span>
                  <span className="truncate text-ink-2" title={`${a.institution} ${a.product}`}>
                    {a.product}
                  </span>
                  <span className="num text-ink-2">{a.startDate}</span>
                  <span className="num text-right">
                    {a.balance !== undefined ? (
                      wonReadable(a.balance)
                    ) : a.kind === "national" ? (
                      a.monthlyAmount ? (
                        `월 ${wonReadable(a.monthlyAmount)}`
                      ) : (
                        <span className="text-ink-3">—</span>
                      )
                    ) : (
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`${a.product} 적립금(만원)`}
                        placeholder="만원 직접 입력"
                        value={manual[a.id] ?? ""}
                        onChange={(e) => setManual((m) => ({ ...m, [a.id]: e.target.value }))}
                        className="w-full rounded-md border border-rule bg-paper px-2 py-1 text-right text-[13px]"
                      />
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-1 flex-col gap-3.5">
          <h2 className="font-title text-[17px] font-semibold">
            추가 입력 <span className="text-[13px] font-normal text-ink-3">— 미입력 시 해당 판정은 「판정 불가」</span>
          </h2>
          <div className="flex flex-col gap-3.5 rounded-xl border border-rule bg-surface px-5 py-5 text-sm">
            <Field label="소득이 끊기는 나이" required suffix="세">
              <NumInput value={form.retireAge} onChange={(v) => setForm({ ...form, retireAge: v })} ariaLabel="소득이 끊기는 나이" />
            </Field>
            <Field label="목표 월 지출 (지금 돈 가치)" required suffix="만원">
              <NumInput value={form.targetMonthlySpend} onChange={(v) => setForm({ ...form, targetMonthlySpend: v })} ariaLabel="목표 월 지출" />
            </Field>
            <Field label="기대수명" suffix="세">
              <NumInput value={form.lifeExpectancy} onChange={(v) => setForm({ ...form, lifeExpectancy: v })} ariaLabel="기대수명" />
            </Field>
            <Field label="현재 금융자산" suffix="만원">
              <NumInput value={form.financialAssets} onChange={(v) => setForm({ ...form, financialAssets: v })} ariaLabel="현재 금융자산" />
            </Field>
            <div className="-mt-2 text-[12px] text-ink-3">예금·주식·펀드 등 · 연금계좌(DC·IRP·연금저축·연금보험) 적립금은 제외 — 이미 연금 흐름으로 계산됩니다</div>
            <Field label="연 금융소득 (이자·배당)" suffix="만원">
              <NumInput value={form.annualFinancialIncome} onChange={(v) => setForm({ ...form, annualFinancialIncome: v })} ariaLabel="연 금융소득" />
            </Field>
            <Field label="재산세 과세표준" suffix="만원">
              <NumInput value={form.propertyTaxBase} onChange={(v) => setForm({ ...form, propertyTaxBase: v })} ariaLabel="재산세 과세표준" />
            </Field>
            <div className="flex items-center justify-between">
              <span className="text-ink-2">배우자 직장가입</span>
              <div className="flex gap-2 text-[13px]">
                {[
                  { v: true, l: "예" },
                  { v: false, l: "아니오" },
                ].map((o) => (
                  <button
                    key={o.l}
                    type="button"
                    aria-pressed={form.spouseEmployed === o.v}
                    onClick={() => setForm({ ...form, spouseEmployed: o.v })}
                    className={`rounded-full border px-3.5 py-1 font-bold ${form.spouseEmployed === o.v ? "border-navy bg-navy text-white" : "border-rule text-ink-2 hover:bg-inset"}`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Field label="국민연금 과세대상 비율" suffix="%">
                <NumInput
                  value={form.npsTaxableRatio === undefined ? undefined : Math.round(form.npsTaxableRatio * 10000) / 100}
                  onChange={(v) => setForm({ ...form, npsTaxableRatio: v === undefined ? undefined : v / 100 })}
                  ariaLabel="국민연금 과세대상 비율"
                />
              </Field>
              <div className="text-[12px] text-ink-3">공단 「연말정산 모의계산」에서 확인 · 비우면 전액 과세로 보수적 계산</div>
            </div>

            {mixRows.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-dashed border-rule pt-3.5">
                <div>
                  <div className="font-bold text-ink-2">계좌별 원천 구성 (선택)</div>
                  <div className="text-[12px] text-ink-3">IRP·연금저축 앱의 「과세 구분」 화면 값 · 비우면 전액 과세로 계산</div>
                </div>
                {mixRows.map(({ account: a, m, over, missingTax }) => {
                  const set = (patch: MixForm) => setMix({ ...mix, [a.id]: { ...mix[a.id], ...patch } });
                  return (
                    <div key={a.id} className="flex flex-col gap-2" data-testid={`mix-${a.id}`}>
                      <div className="text-[13px] font-medium">
                        {KIND_LABEL[a.kind] ?? a.kind} <span className="text-ink-3">{a.product}</span>
                      </div>
                      <Field label="비과세 납입액" suffix="만원">
                        <NumInput value={m.exempt} onChange={(v) => set({ exempt: v })} ariaLabel={`${a.product} 비과세 납입액`} />
                      </Field>
                      <Field label="이연퇴직소득" suffix="만원">
                        <NumInput value={m.deferredSeverance} onChange={(v) => set({ deferredSeverance: v })} ariaLabel={`${a.product} 이연퇴직소득`} />
                      </Field>
                      <Field label="이연퇴직소득세" suffix="만원">
                        <NumInput value={m.deferredSeveranceTax} onChange={(v) => set({ deferredSeveranceTax: v })} ariaLabel={`${a.product} 이연퇴직소득세`} />
                      </Field>
                      {over && <div className="text-[12.5px] text-danger">비과세 납입액과 이연퇴직소득의 합이 적립금을 넘습니다</div>}
                      {missingTax && <div className="text-[12.5px] text-warn">이연퇴직소득세를 비우면 이연퇴직분도 연금소득세로 계산됩니다</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {current && !excel && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!validation.ok || !mixOk}
                onClick={saveInputs}
                className="rounded-[10px] border-[1.5px] border-navy px-5 py-2 text-[14px] font-bold text-navy hover:enabled:bg-navy/5 disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-3"
              >
                추가 입력 저장
              </button>
              {savedNote && <span className="text-[13px] text-good">{savedNote}</span>}
              {!validation.ok && <span className="text-[12.5px] text-warn">{validation.errors.map((e) => e.message).join(" / ")}</span>}
            </div>
          )}

          <div className="flex flex-col gap-2 rounded-xl border border-rule bg-surface px-5 py-4 text-[13.5px]">
            <div className="font-bold">스냅샷</div>
            {snapshots.length === 0 && <div className="text-ink-3">저장된 스냅샷이 없습니다</div>}
            {snapshots.map((s, i) => (
              <div key={s.asOf} className="flex items-center justify-between text-ink-2">
                <span>
                  snapshot-{s.asOf}.json {i === 0 && <b className="text-good">현재</b>}
                </span>
                <span className="flex gap-2">
                  <button type="button" className="text-navy hover:underline" onClick={() => exportJson(s)}>
                    내보내기
                  </button>
                  <button
                    type="button"
                    className="text-danger hover:underline"
                    onClick={() => {
                      deleteSnapshot(s.asOf);
                      refreshSession();
                    }}
                  >
                    삭제
                  </button>
                </span>
              </div>
            ))}
            {comparison && (
              <section aria-label="스냅샷 비교" className="rounded-lg bg-inset px-3.5 py-2.5 text-[13px] text-ink-2">
                <div className="font-bold text-ink">
                  {comparison.fromAsOf} 대비 <span className="font-normal text-ink-3">({comparison.years}년)</span>
                </div>
                <div>
                  적립금 <Signed value={comparison.balanceDiff / 1000} fmt={eok} /> · 연금 수령 합계 <Signed value={comparison.totalFlowDiff} fmt={eok} />
                  {comparison.npsMonthlyDiff !== undefined && (
                    <>
                      {" "}· 국민연금 월액 <Signed value={comparison.npsMonthlyDiff / 1000} fmt={manwon} />
                    </>
                  )}
                </div>
                {comparison.accounts.some((a) => a.status !== "both") && (
                  <div className="text-[12px] text-ink-3">
                    {comparison.accounts
                      .filter((a) => a.status !== "both")
                      .map((a) => `${a.status === "added" ? "새 계좌" : "사라진 계좌"}: ${a.product}`)
                      .join(" · ")}
                  </div>
                )}
              </section>
            )}
            <label className="cursor-pointer text-[12.5px] text-navy hover:underline">
              JSON 가져오기
              <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} />
            </label>
            <div className="border-t border-dashed border-rule pt-2 text-[12.5px] text-ink-3">
              저장은 이 브라우저(localStorage)에만 ·{" "}
              <button
                type="button"
                className="font-medium text-danger hover:underline"
                onClick={() => {
                  clearSnapshots();
                  refreshSession();
                }}
              >
                모두 지우기
              </button>
            </div>
          </div>

          {error && <div className="rounded-[10px] border border-danger/40 bg-danger-bg px-4 py-3 text-[13.5px] text-danger">{error}</div>}
          {!validation.ok && excel && (
            <div className="rounded-[10px] border border-warn/40 bg-warn-bg px-4 py-3 text-[13px] text-warn">{validation.errors.map((e) => e.message).join(" / ")}</div>
          )}

          <button
            type="button"
            disabled={!excel || !validation.ok || !mixOk}
            onClick={start}
            className="mt-auto rounded-[10px] bg-navy py-3.5 text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:bg-rule disabled:text-ink-3 hover:enabled:bg-navy-deep"
          >
            이 데이터로 시뮬레이션 시작
          </button>
        </section>
      </div>
    </AppShell>
  );
}

const DEFAULT_FORM: Partial<Inputs> = { retireAge: 60, targetMonthlySpend: 300, lifeExpectancy: 95 };

/** 스냅샷 계좌의 원천 구성(원) → 입력 칸(만원) */
function mixFromSnapshot(accounts: Account[]): Record<string, MixForm> {
  const out: Record<string, MixForm> = {};
  for (const a of accounts) {
    if (!a.sourceMix) continue;
    out[a.id] = {
      exempt: a.sourceMix.exempt ? a.sourceMix.exempt / 10000 : undefined,
      deferredSeverance: a.sourceMix.deferredSeverance ? a.sourceMix.deferredSeverance / 10000 : undefined,
      deferredSeveranceTax: a.sourceMix.deferredSeveranceTax !== undefined ? a.sourceMix.deferredSeveranceTax / 10000 : undefined,
    };
  }
  return out;
}

/** 입력한 원천 구성을 계좌에 붙인다 — 아무것도 안 넣었으면 그대로 */
function applyMix(a: Account, r?: { m: MixForm; exempt: number; deferredSeverance: number; entered: boolean }): Account {
  if (!r || !r.entered) return a;
  const taxable = a.balance !== undefined ? Math.max(0, a.balance - r.exempt - r.deferredSeverance) : 0;
  return {
    ...a,
    sourceMix: {
      exempt: r.exempt,
      deferredSeverance: r.deferredSeverance,
      taxable,
      ...(r.m.deferredSeveranceTax !== undefined ? { deferredSeveranceTax: r.m.deferredSeveranceTax * 10000 } : {}),
    },
  };
}

function Signed({ value, fmt }: { value: number; fmt: (n: number) => string }) {
  const tone = value > 0 ? "text-good" : value < 0 ? "text-danger" : "text-ink-3";
  return (
    <b className={`num ${tone}`}>
      {value > 0 ? "+" : value < 0 ? "−" : "±"}
      {fmt(Math.abs(value))}
    </b>
  );
}

function Field({ label, required, suffix, children }: { label: string; required?: boolean; suffix?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-2">
        {label}
        {required && <span className="ml-1 text-xs font-bold text-danger">필수</span>}
      </span>
      <span className="flex items-center gap-1.5">
        {children}
        {suffix && <span className="text-[13px] text-ink-3">{suffix}</span>}
      </span>
    </div>
  );
}

function NumInput({ value, onChange, ariaLabel }: { value?: number; onChange: (v: number | undefined) => void; ariaLabel: string }) {
  return (
    <input
      type="number"
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className="num w-28 rounded-lg border border-rule bg-paper px-3 py-1.5 text-right"
    />
  );
}
