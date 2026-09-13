import type { Metadata } from "next";
import { Hahmlet, IBM_Plex_Sans_KR } from "next/font/google";
import "./globals.css";

// DESIGN §3 — 제목 Hahmlet, 본문 IBM Plex Sans KR. 빌드 시점에만 받는다 (런타임 네트워크 0, N1).
const hahmlet = Hahmlet({ variable: "--font-hahmlet", weight: ["600", "700"], subsets: ["latin"] });
const plexKr = IBM_Plex_Sans_KR({ variable: "--font-plex-kr", weight: ["400", "500", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "내 연금 시뮬레이터",
  description: "통합연금포털 데이터로 시나리오·실질가치·세후 가처분을 나란히 본다. 데이터는 브라우저를 떠나지 않는다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${hahmlet.variable} ${plexKr.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
