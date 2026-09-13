import { describe, it, expect, beforeEach, vi } from "vitest";
import { LAW_KEY_STORAGE, clearLawKey, lawSearchUrl, readLawKey, saveLawKey, searchLaws, effectiveLawKey } from "@/src/lawSearch";
import { searchLocalLibrary } from "@/src/lawLibrary";

const jsonResponse = (body: unknown, init: { ok?: boolean; status?: number } = {}) =>
  ({ ok: init.ok ?? true, status: init.status ?? 200, json: async () => body }) as unknown as Response;

describe("M5-3 법제처 검색 모듈", () => {
  beforeEach(() => localStorage.clear());

  it("검색 URL 은 키와 검색어를 인코딩한다", () => {
    expect(lawSearchUrl("분할 연금&유족", "my key")).toBe(
      `https://www.law.go.kr/DRF/lawSearch.do?OC=my%20key&target=law&type=JSON&query=${encodeURIComponent("분할 연금&유족")}`,
    );
  });

  it("키를 저장·읽기·삭제한다", () => {
    expect(readLawKey()).toBeNull();
    saveLawKey("  abc  ");
    expect(localStorage.getItem(LAW_KEY_STORAGE)).toBe("abc");
    expect(readLawKey()).toBe("abc");
    clearLawKey();
    expect(readLawKey()).toBeNull();
  });

  it("결과가 한 건(객체)이어도 목록으로 바꾸고 링크를 절대 경로로 만든다", async () => {
    const fake = vi.fn(async () =>
      jsonResponse({ LawSearch: { totalCnt: "1", law: { 법령명한글: "국민연금법", 법령일련번호: "123", 시행일자: "20260101", 법령상세링크: "/DRF/lawService.do?MST=123" } } }),
    );
    const out = await searchLaws("국민연금", "k", fake as unknown as typeof fetch);
    expect(fake).toHaveBeenCalledWith(lawSearchUrl("국민연금", "k"));
    expect(out).toEqual([{ name: "국민연금법", mst: "123", enforced: "20260101", link: `https://www.law.go.kr/법령/${encodeURIComponent("국민연금법")}` }]);
  });

  it("여러 건(배열)을 그대로 옮기고, 결과가 없으면 빈 목록", async () => {
    const fake = vi.fn(async () =>
      jsonResponse({
        LawSearch: {
          law: [
            { 법령명한글: "소득세법", 법령일련번호: 1, 시행일자: "20260101", 법령상세링크: "https://www.law.go.kr/a" },
            { 법령명한글: "소득세법 시행령", 법령일련번호: "2", 시행일자: "20260701", 법령상세링크: "/b" },
          ],
        },
      }),
    );
    const out = await searchLaws("소득세", "k", fake as unknown as typeof fetch);
    expect(out.map((r) => r.name)).toEqual(["소득세법", "소득세법 시행령"]);
    expect(out[0]!.mst).toBe("1");
    expect(out[1]!.link).toBe(`https://www.law.go.kr/법령/${encodeURIComponent("소득세법 시행령")}`);

    const empty = vi.fn(async () => jsonResponse({ LawSearch: { totalCnt: "0" } }));
    expect(await searchLaws("없음", "k", empty as unknown as typeof fetch)).toEqual([]);
  });

  it("HTTP 오류·잘못된 JSON 이면 한국어 오류를 던진다", async () => {
    const bad = vi.fn(async () => jsonResponse({}, { ok: false, status: 500 }));
    await expect(searchLaws("x", "k", bad as unknown as typeof fetch)).rejects.toThrow(/법제처 검색에 실패/);
    const notJson = vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("x"); } }) as unknown as Response);
    await expect(searchLaws("x", "k", notJson as unknown as typeof fetch)).rejects.toThrow(/응답을 읽지 못했습니다/);
    const wrongShape = vi.fn(async () => jsonResponse({ result: "키 오류" }));
    await expect(searchLaws("x", "k", wrongShape as unknown as typeof fetch)).rejects.toThrow(/형식이 올바르지 않습니다/);
  });
});

describe("검색 보완 (2026-09-13 — 사용자 제보: 검색이 안 된다)", () => {
  beforeEach(() => localStorage.clear());

  it("법제처 상세 링크에 든 키(OC)를 화면 링크로 옮기지 않는다 — 공개 법령 주소로 만든다", async () => {
    const fake = vi.fn(async () => jsonResponse({ LawSearch: { law: { 법령명한글: "국민연금법", 법령일련번호: "280269", 시행일자: "20260617", 법령상세링크: "/DRF/lawService.do?OC=secret-key&target=law&MST=280269&type=HTML" } } }));
    const [r] = await searchLaws("국민연금법", "secret-key", fake as unknown as typeof fetch);
    expect(r!.link).not.toContain("secret-key");
    expect(r!.link).not.toContain("OC=");
  });

  it("모아 둔 발췌에서 띄어쓰기를 무시하고 찾는다 — 키 없이도 「분할연금」이 국민연금법 제64조를 찾는다", () => {
    const hits = searchLocalLibrary("분할 연금");
    expect(hits.some((h) => h.article.law === "국민연금법" && h.article.ref === "제64조")).toBe(true);
    expect(searchLocalLibrary("  ")).toEqual([]);
    expect(searchLocalLibrary("존재하지않는말xyz")).toEqual([]);
  });

  it("브라우저에 키가 없으면 개발용 키(.env.local)를 쓴다 — 브라우저 키가 우선", () => {
    expect(effectiveLawKey(null, "dev-key")).toEqual({ key: "dev-key", source: "dev" });
    expect(effectiveLawKey("mine", "dev-key")).toEqual({ key: "mine", source: "browser" });
    expect(effectiveLawKey(null, undefined)).toEqual({ key: null, source: "none" });
  });
});
