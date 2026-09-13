// 합성 K씨 픽스처 생성기 (PLAN §3). 포털 엑셀의 실물 형식(inlineStr · 숨김 A열 · 전각공백 패딩 · 합계 행)을
// 그대로 재현한 xlsx 를 SheetJS 없이 직접 zip 으로 만든다 — SheetJS 로 쓰면 sharedStrings 가 되어 실물을 검증하지 못한다.
// 숫자는 전부 가상이며 실데이터와 스케일·상품 구성이 다르다 (SPEC N2 · F19).
import { writeFileSync, mkdirSync } from "node:fs";
import { crc32 } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "tests", "fixtures", "demo-k");
mkdirSync(outDir, { recursive: true });

const AGES = Array.from({ length: 36 }, (_, i) => 55 + i); // 55세 ~ 90세
const BIRTH = "1968년07월";
const PAD = "　"; // 전각공백 — 포털이 기관명에 붙인다

// ── 합성 계좌 (천원). 연령 = 그 나이가 되는 달력 연도 (birthYear + age) ──
function grow(start, first, years, rate, endAge = 90) {
  const flow = {};
  for (const a of AGES) flow[a] = 0;
  for (let i = 0; i < years; i++) {
    const age = start + i;
    if (age > endAge) break;
    flow[age] = Math.round(first * Math.pow(1 + rate, i));
  }
  return flow;
}
const accounts = [
  // 국민연금: 월 1,350천원, 2033년 08월 개시 → 65세(=2033년) 5개월치, 이후 매년 ×1.031 (포털 산식 재현)
  (() => {
    const flow = {};
    for (const a of AGES) flow[a] = 0;
    flow[65] = Math.round(1350 * 5);
    for (let a = 66; a <= 90; a++) flow[a] = Math.round(1350 * 12 * Math.pow(1.031, a - 65));
    return { code: "3", owner: "본인", inst: "국민연금", product: "노령연금(개시전, 현재가치 0%)", start: "2033년 08월", flow };
  })(),
  { code: "2", owner: "본인", inst: "가나증권", product: "KODEX 200외 3건", start: "2028년", flow: grow(60, 11600, 20, 0.045) },
  { code: "2", owner: "본인", inst: "가나증권", product: "퇴직연금RP(1년)외 2건", start: "2028년", flow: grow(60, 3100, 20, 0.045) },
  { code: "1", owner: "본인", inst: "다라자산운용", product: "다라 평생연금저축", start: "2025년 01월", flow: grow(57, 7500, 20, 0.051) },
  (() => {
    const flow = grow(60, 2600, 31, 0);
    for (const a of [65, 70, 75]) flow[a] += 800; // 5년마다 보너스
    return { code: "1", owner: "본인", inst: "마바생명보험", product: "마바연금보험", start: "2028년 07월", flow };
  })(),
  // 가족 행 — 배우자 국민연금. 임포터가 owner=family 로 받는지 확인용
  { code: "3", owner: "가족", inst: "국민연금", product: "노령연금(개시전, 현재가치 0%)", start: "2038년", flow: grow(70, 7200, 21, 0.031) },
];
const total = {};
for (const a of AGES) total[a] = accounts.reduce((s, ac) => s + ac.flow[a], 0);

// ── 워크시트 XML ──
const COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function colName(i) { return i < 26 ? COLS[i] : COLS[Math.floor(i / 26) - 1] + COLS[i % 26]; } // 0-based
function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function cStr(ref, s) { return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(s)}</t></is></c>`; }
function cNum(ref, n) { return `<c r="${ref}"><v>${n}</v></c>`; }

const rows = [];
rows.push(`<row r="1">${cStr("B1", "단위 : 천원")}${cStr("C1", BIRTH)}</row>`);
rows.push(`<row r="2">${cStr("B2", "연령")}${AGES.map((a, i) => cStr(`${colName(5 + i)}2`, `${a}세`)).join("")}${cStr("AP2", "소 계")}</row>`);
accounts.forEach((ac, k) => {
  const r = 3 + k;
  const cells = [
    cStr(`A${r}`, ac.code),
    cStr(`B${r}`, ac.owner),
    cStr(`C${r}`, PAD + ac.inst + PAD),
    cStr(`D${r}`, ac.product),
    cStr(`E${r}`, ac.start),
    ...AGES.map((a, i) => cNum(`${colName(5 + i)}${r}`, ac.flow[a])),
    cNum(`AP${r}`, AGES.reduce((s, a) => s + ac.flow[a], 0)),
  ];
  rows.push(`<row r="${r}">${cells.join("")}</row>`);
});
const tr = 3 + accounts.length;
rows.push(`<row r="${tr}">${cStr(`B${tr}`, "합계")}${AGES.map((a, i) => cNum(`${colName(5 + i)}${tr}`, total[a])).join("")}${cNum(`AP${tr}`, AGES.reduce((s, a) => s + total[a], 0))}</row>`);

const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:AP${tr}"/><cols><col min="1" max="1" width="2" hidden="1"/></cols><sheetData>${rows.join("")}</sheetData></worksheet>`;

const files = {
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="통합연금포탈_예시연금액" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  "xl/worksheets/sheet1.xml": sheet,
};

// ── 최소 zip (stored, 압축 없음) ──
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }
const locals = [], centrals = [];
let offset = 0;
for (const [name, text] of Object.entries(files)) {
  const nameB = Buffer.from(name, "utf8"), data = Buffer.from(text, "utf8"), crc = crc32(data);
  const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameB.length), u16(0), nameB, data]);
  centrals.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameB]));
  locals.push(local);
  offset += local.length;
}
const cd = Buffer.concat(centrals);
const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(centrals.length), u16(centrals.length), u32(cd.length), u32(offset), u16(0)]);
writeFileSync(join(outDir, "demo-k.xlsx"), Buffer.concat([...locals, cd, eocd]));

// ── 기대값 (임포터 테스트가 대조) ──
const expected = {
  birthYearMonth: "1968-07",
  accountCount: accounts.length,
  selfCount: accounts.filter((a) => a.owner === "본인").length,
  familyCount: accounts.filter((a) => a.owner === "가족").length,
  totalByAge: total,
  grandTotal: AGES.reduce((s, a) => s + total[a], 0),
  accounts: accounts.map((a) => ({ code: a.code, owner: a.owner, institution: a.inst, product: a.product, start: a.start, subtotal: AGES.reduce((s, x) => s + a.flow[x], 0) })),
};
writeFileSync(join(outDir, "expected.json"), JSON.stringify(expected, null, 2) + "\n");
console.log(`wrote demo-k.xlsx (${accounts.length} accounts, grand total ${expected.grandTotal.toLocaleString()} 천원)`);

// ── 계약정보 PDF 텍스트 조각 픽스처 (pdfjs getTextContent 출력과 같은 모양: str · x · y · page) ──
// 실물에서 본 것: 표 셀이 같은 x 에 여러 줄로 쪼개지고("207,52" / "9,847"), 행마다 우측에 "계약상세" 버튼이 있으며,
// 셀 하나가 페이지 경계에서 잘려 다음 페이지 머리에 조각이 남는다.
function tableItems(page, headerY, columns, rows, opts = {}) {
  const items = [];
  columns.forEach((c) => c.label.forEach((frag, j) => items.push({ str: frag, x: c.x, y: headerY + 8 - j * 17, page })));
  let y = opts.rowStartY ?? headerY - 40;
  for (const row of rows) {
    const lines = Math.max(...row.cells.map((c) => c.length));
    row.cells.forEach((frags, ci) => frags.forEach((frag, j) => items.push({ str: frag, x: columns[ci].x, y: y + (lines - 1) * 9 - j * 19, page })));
    items.push({ str: row.button ?? "계약상세", x: opts.buttonX ?? 481, y: y + 4, page });
    y -= 19 * lines + 20;
  }
  if (opts.total) {
    items.push({ str: "적립금 합계금액", x: 39, y: y - 10, page });
    items.push({ str: opts.total, x: 347, y: y - 10, page });
  }
  return items;
}
const ACC_COLS = [
  { x: 36, label: ["가입회사"] }, { x: 97, label: ["상품유형"] }, { x: 159, label: ["상품명"] }, { x: 221, label: ["가입일"] },
  { x: 283, label: ["연금개시", "예정일"] }, { x: 344, label: ["적립금", "(원)"] }, { x: 406, label: ["조회기준", "일"] }, { x: 468, label: ["비고"] },
];
const pdfItems = [
  { str: "내연금조회", x: 27, y: 757, page: 1 },
  { str: "국민연금", x: 27, y: 553, page: 1 },
  ...tableItems(1, 467,
    [{ x: 36, label: ["가입자 구분"] }, { x: 115, label: ["연금종류"] }, { x: 211, label: ["연금개시년", "도"] }, { x: 285, label: ["예상연금수령액", "(원/월)"] }, { x: 380, label: ["미래가치", "예상연금액"] }, { x: 456, label: ["비고"] }],
    [{ cells: [["사업장가입", "자"], ["노령연금", "(개시전)"], ["2033 년"], ["1,350,000"], ["미제공"]] }], { buttonX: 468 }),
  { str: "퇴직연금(DB)", x: 27, y: 204, page: 1 },
  ...tableItems(2, 792,
    [{ x: 36, label: ["가입회사"] }, { x: 103, label: ["상품유형"] }, { x: 170, label: ["상품명"] }, { x: 237, label: ["입사", "(중간정산)", "연도"] }, { x: 304, label: ["퇴직예정년", "도"] }, { x: 371, label: ["예상", "적립금(원)"] }, { x: 439, label: ["비고"] }],
    [{ cells: [["보기"], ["DB"], ["퇴직연금", "확정급여", "형(DB)"], ["-"], ["-"], ["퇴직금정", "보 미입력"]], button: "퇴직금정보 입력" }], { buttonX: 451 }),
  { str: "퇴직연금(DC,IRP)", x: 27, y: 557, page: 2 },
  ...tableItems(2, 503, ACC_COLS, [
    { cells: [["가나증권"], ["DC"], ["KODEX", "200외", "3건"], ["2022/0", "5/10"], ["2028/0", "7/20"], ["150,00", "0,000"], ["2026/0", "8/31"]] },
    { cells: [["가나증권"], ["개인", "IRP형"], ["퇴직연금", "RP(1년)", "외 2건"], ["2019/0", "3/02"], ["2028/0", "7/20"], ["40,000,", "000"], ["2026/0", "8/31"]] },
  ], { total: "190,000,000" }),
  { str: "개인연금", x: 27, y: 245, page: 2 },
  ...tableItems(2, 148, ACC_COLS, [
    { cells: [["다라자산", "운용"], ["연금저축", "펀드"], ["다라"], ["2010/0", "1/26"], ["2025/0", "1/26"], ["120,00", "0,000"], ["2026/0", "8/31"]] },
  ]),
  // 페이지 경계 — 상품명 "다라 평생연금저축" 의 뒷조각이 3쪽 머리에 남는다
  ...tableItems(3, 801, ACC_COLS, [
    { cells: [["마바생명", "보험"], ["일반연금", "보험"], ["마바", "연금보험"], ["2003/0", "5/20"], ["2028/0", "7/15"], ["30,000,", "000"], ["2026/0", "8/31"]] },
  ], { total: "150,000,000", rowStartY: 704 }),
  { str: "평생연금", x: 159, y: 768, page: 3 },
  { str: "저축", x: 159, y: 750, page: 3 },
  { str: "추가연금", x: 27, y: 603, page: 3 },
  { str: "추가된 연금이 없습니다.", x: 36, y: 503, page: 3 },
  // 페이지 장식 — 잘린 셀 조각과 같은 띠에 있지만 열 x 에서 8~10px 어긋난다.
  // 실데이터에서 이것이 기관명("OO증권홈")·상품유형("연금저축펀드내연금조회")에 섞여 들어갔다 (2026-09-09).
  { str: "홈", x: 44, y: 772, page: 3 },
  { str: "내연금조회", x: 107, y: 772, page: 3 },
];
writeFileSync(join(outDir, "demo-k.pdf.items.json"), JSON.stringify(pdfItems, null, 1) + "\n");
console.log(`wrote demo-k.pdf.items.json (${pdfItems.length} items)`);
