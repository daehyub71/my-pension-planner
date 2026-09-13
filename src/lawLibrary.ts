/** 법규 라이브러리 발췌 검색 — 빌드 시점에 모은 정적 JSON 안에서만 찾는다 (네트워크 없음, N1). */
import library from "@/content/law/library.json";

export type LibraryArticle = (typeof library.topics)[number]["articles"][number];

export interface LibraryHit {
  topicKey: string;
  topicLabel: string;
  article: LibraryArticle;
}

/** 띄어쓰기·대소문자 차이는 무시한다 — 「분할 연금」도 「분할연금」을 찾는다 */
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export function searchLocalLibrary(query: string): LibraryHit[] {
  const q = norm(query);
  if (!q) return [];
  const hits: LibraryHit[] = [];
  const seen = new Set<string>();
  for (const t of library.topics) {
    for (const a of t.articles) {
      const id = `${a.law}|${a.ref}|${a.excerpt.length}`;
      if (seen.has(id)) continue;
      if (norm(`${t.label} ${a.law} ${a.title} ${a.excerpt}`).includes(q)) {
        seen.add(id);
        hits.push({ topicKey: t.key, topicLabel: t.label, article: a });
      }
    }
  }
  return hits;
}
