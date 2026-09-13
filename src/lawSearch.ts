/**
 * 법제처 Open API 검색 — N1(로컬 우선)의 유일한 예외 모듈 (M5-3).
 *
 * 이 파일은 app/ · components/ · src/ 안에서 네트워크(fetch)를 부르는 유일한 곳이다.
 * 다른 곳에 fetch 를 추가하지 않는다. 호출은 사용자가 본인 키를 등록하고
 * 「검색」 버튼을 누른 경우에만 일어나며, 보내는 것은 검색어와 키뿐이다 — 연금 데이터는 보내지 않는다.
 */

export const LAW_KEY_STORAGE = "mpp.lawOc.v1";

export interface LawSearchResult {
  /** 법령명 (한글) */
  name: string;
  /** 법령일련번호 (MST) */
  mst: string;
  /** 시행일자 YYYYMMDD */
  enforced: string;
  /** 법제처 상세 링크 (절대 경로) */
  link: string;
}

const listeners = new Set<() => void>();

/** 키 변경 구독 — useSyncExternalStore 용 */
export function subscribeLawKey(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const l of listeners) l();
}

/** 저장된 키. 없거나 저장소를 못 쓰면 null */
export function readLawKey(): string | null {
  try {
    const v = localStorage.getItem(LAW_KEY_STORAGE);
    return v ? v : null;
  } catch {
    return null;
  }
}

/** 서버 렌더에서는 키가 없다 */
export function readServerLawKey(): string | null {
  return null;
}

export function saveLawKey(key: string): void {
  const k = key.trim();
  if (!k) return;
  try {
    localStorage.setItem(LAW_KEY_STORAGE, k);
  } catch {
    // 저장소를 못 쓰는 브라우저 — 조용히 무시한다
  }
  notify();
}

export function clearLawKey(): void {
  try {
    localStorage.removeItem(LAW_KEY_STORAGE);
  } catch {
    // 무시
  }
  notify();
}

export function lawSearchUrl(query: string, key: string): string {
  return `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(key)}&target=law&type=JSON&query=${encodeURIComponent(query)}`;
}

/** 키 없이 쓰는 법제처 웹 검색 링크 — 네트워크 호출이 아니라 사용자가 여는 링크다 */
export function lawWebSearchUrl(query: string): string {
  return `https://www.law.go.kr/lsSc.do?query=${encodeURIComponent(query)}`;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

/**
 * 공개 법령 주소. 법제처 응답의 「법령상세링크」에는 요청한 키(OC)가 그대로 들어 있어
 * 화면 링크로 쓰면 키가 노출된다 — 법령명으로 공개 주소를 새로 만든다 (2026-09-13).
 */
function publicLawUrl(name: string): string {
  return `https://www.law.go.kr/법령/${encodeURIComponent(name)}`;
}

/**
 * 개발 서버에서만 주입되는 키 — next.config.ts 가 `next dev` 일 때만 .env.local 의 LAW_OC 를 넣는다.
 * 배포 빌드에는 들어가지 않는다 (공개 사이트에 키가 실리면 누구나 본다).
 */
export function devLawKey(): string | undefined {
  return process.env.NEXT_PUBLIC_LAW_OC_DEV || undefined;
}

/** 브라우저에 등록한 키가 우선, 없으면 개발용 키 */
export function effectiveLawKey(browserKey: string | null, devKey: string | undefined = devLawKey()): { key: string | null; source: "browser" | "dev" | "none" } {
  if (browserKey) return { key: browserKey, source: "browser" };
  if (devKey) return { key: devKey, source: "dev" };
  return { key: null, source: "none" };
}

/** DRF 응답(JSON)을 결과 목록으로. law 는 한 건이면 객체, 여러 건이면 배열로 온다 */
export function parseLawSearch(json: unknown): LawSearchResult[] {
  if (typeof json !== "object" || json === null || !("LawSearch" in json)) throw new Error("법제처 응답 형식이 올바르지 않습니다. 키를 확인해 주세요.");
  const body = (json as { LawSearch: unknown }).LawSearch;
  if (typeof body !== "object" || body === null) throw new Error("법제처 응답 형식이 올바르지 않습니다. 키를 확인해 주세요.");
  const law = (body as { law?: unknown }).law;
  const items = Array.isArray(law) ? law : law ? [law] : [];
  return items.map((it) => {
    const o = (typeof it === "object" && it !== null ? it : {}) as Record<string, unknown>;
    return { name: str(o["법령명한글"]), mst: str(o["법령일련번호"]), enforced: str(o["시행일자"]), link: publicLawUrl(str(o["법령명한글"])) };
  });
}

export async function searchLaws(query: string, key: string, fetchImpl: typeof fetch = fetch): Promise<LawSearchResult[]> {
  let res: Response;
  try {
    res = await fetchImpl(lawSearchUrl(query, key));
  } catch {
    throw new Error("법제처에 연결하지 못했습니다. 네트워크를 확인해 주세요.");
  }
  if (!res.ok) throw new Error(`법제처 검색에 실패했습니다 (HTTP ${res.status}).`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("법제처 응답을 읽지 못했습니다. 키가 올바른지 확인해 주세요.");
  }
  return parseLawSearch(json);
}
