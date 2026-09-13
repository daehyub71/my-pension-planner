import type { NextConfig } from "next";

// 서버가 없다 (SPEC N1). 정적 파일만 내보낸다.
// 법제처 검색 키 — 개발 서버에서만 .env.local 의 LAW_OC 를 브라우저에 넣는다 (사용자 요청 2026-09-13).
// 배포 빌드(`next build`)에는 넣지 않는다: 정적 사이트에 실린 키는 누구나 볼 수 있다.
const devLawKey = process.env.NODE_ENV === "development" ? process.env.LAW_OC : undefined;

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  env: devLawKey ? { NEXT_PUBLIC_LAW_OC_DEV: devLawKey } : {},
};

export default nextConfig;
