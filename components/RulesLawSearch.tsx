"use client";
import { useState, useSyncExternalStore } from "react";
import { clearLawKey, effectiveLawKey, lawWebSearchUrl, readLawKey, readServerLawKey, saveLawKey, searchLaws, subscribeLawKey, type LawSearchResult } from "@/src/lawSearch";
import { searchLocalLibrary, type LibraryHit } from "@/src/lawLibrary";

function dashDate(d: string): string {
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
}

/**
 * M5-3 법제처 검색 (opt-in). 먼저 모아 둔 발췌에서 찾고(네트워크 없음), 키가 있으면 법령명 검색을 덧붙인다.
 * 키: 브라우저에 등록한 키 → 없으면 개발 서버의 .env.local 키. 「검색」 버튼을 눌러야만 호출한다 (N1 예외, src/lawSearch.ts 로 격리).
 */
export function RulesLawSearch() {
  const browserKey = useSyncExternalStore(subscribeLawKey, readLawKey, readServerLawKey);
  const { key, source } = effectiveLawKey(browserKey);
  const [local, setLocal] = useState<LibraryHit[] | undefined>();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [results, setResults] = useState<LawSearchResult[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSubmitted(q);
    setLocal(searchLocalLibrary(q));
    setResults(undefined);
    setError(undefined);
    if (!key) return;
    setLoading(true);
    try {
      setResults(await searchLaws(q, key));
    } catch (err) {
      setError(err instanceof Error ? err.message : "법제처 검색에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <form onSubmit={onSearch} className="flex items-center gap-2 rounded-[9px] border-[1.5px] border-navy bg-paper px-3 py-1.5" role="search">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-navy" aria-hidden>
          <circle cx="9" cy="9" r="6" />
          <path d="M13.5 13.5 L18 18" />
        </svg>
        <input
          type="search"
          aria-label="법령 검색어"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="예: 분할연금 — 계산 규칙 밖 관련 법률까지"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        />
        <button type="submit" className="rounded-md bg-navy px-3 py-1 text-xs font-bold text-white hover:bg-navy-deep disabled:opacity-50" disabled={loading}>
          {loading ? "검색 중…" : "검색"}
        </button>
      </form>

      {local && (
        <ul className="overflow-hidden rounded-[9px] border border-rule text-[12.5px]" aria-label="발췌 검색 결과">
          <li className="bg-inset px-3 py-1.5 text-xs font-bold text-ink-2">모아 둔 조문 발췌 — {local.length}건</li>
          {local.length === 0 && <li className="px-3 py-2 text-ink-3">「{submitted}」이(가) 들어간 발췌가 없습니다</li>}
          {local.map((h) => (
            <li key={`${h.topicKey}-${h.article.law}-${h.article.ref}`} className="border-b border-rule px-3 py-2 last:border-b-0">
              <a href={h.article.url} target="_blank" rel="noreferrer" className="font-bold text-ink hover:text-navy hover:underline">
                {h.article.law} {h.article.title}
              </a>
              <span className="ml-2 text-ink-3">· {h.topicLabel}</span>
            </li>
          ))}
        </ul>
      )}

      {submitted && (
        <a href={lawWebSearchUrl(submitted)} target="_blank" rel="noreferrer" className="rounded-[9px] bg-inset px-3 py-2 text-[12.5px] font-bold text-navy hover:underline">
          법제처에서 「{submitted}」 전체 검색 →
        </a>
      )}

      {error && (
        <p role="alert" className="rounded-[9px] bg-danger-bg px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      {results && (
        <ul className="overflow-hidden rounded-[9px] border border-rule text-[12.5px]" aria-label="법제처 검색 결과">
          <li className="bg-inset px-3 py-1.5 text-xs font-bold text-ink-2">법제처 법령명 검색 — {results.length}건</li>
          {results.length === 0 && <li className="px-3 py-2 text-ink-3">이름에 「{submitted}」이(가) 들어간 법령이 없습니다 — 위 발췌나 법제처 전체 검색을 보세요</li>}
          {results.map((r) => (
            <li key={`${r.mst}-${r.name}`} className="border-b border-rule px-3 py-2 last:border-b-0">
              <a href={r.link} target="_blank" rel="noreferrer" className="font-bold text-ink hover:text-navy hover:underline">
                {r.name}
              </a>
              {r.enforced && <span className="num ml-2 text-ink-3">시행 {dashDate(r.enforced)}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-[9px] border border-rule px-3 py-2.5 text-[12.5px]">
        {browserKey ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-good">법제처 Open API 키 등록됨</span>
            <span className="text-ink-3">— 법령명 검색을 이 화면 안에서 바로 조회합니다</span>
            <button type="button" onClick={() => clearLawKey()} className="ml-auto rounded-md border border-rule px-2.5 py-0.5 text-ink-2 hover:bg-inset">
              삭제
            </button>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveLawKey(keyDraft);
              setKeyDraft("");
            }}
          >
            <label htmlFor="law-oc" className="font-bold text-ink">
              법제처 Open API 키 등록
            </label>
            <input
              id="law-oc"
              type="password"
              autoComplete="off"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-rule bg-paper px-2 py-0.5"
            />
            <button type="submit" className="rounded-md bg-navy px-2.5 py-0.5 font-bold text-white hover:bg-navy-deep">
              저장
            </button>
            <button type="button" onClick={() => clearLawKey()} className="rounded-md border border-rule px-2.5 py-0.5 text-ink-2 hover:bg-inset">
              삭제
            </button>
            <span className="w-full text-xs text-ink-3">
              키는 이 브라우저에만 저장 · 검색할 때만 법제처로 전송
              {source === "dev" && <b className="ml-1 text-good">· 지금은 개발 서버의 .env.local 키로 검색합니다</b>}
            </span>
          </form>
        )}
      </div>
    </div>
  );
}
