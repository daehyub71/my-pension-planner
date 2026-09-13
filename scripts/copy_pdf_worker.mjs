// pdfjs 워커를 public/ 에 둔다 — 정적 export 에서 워커 경로 문제를 피한다 (PLAN 리스크 2). git 에는 넣지 않는다.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
const src = "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs";
if (existsSync(src)) {
  mkdirSync("public", { recursive: true });
  copyFileSync(src, "public/pdf.worker.min.mjs");
}
