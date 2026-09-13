"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSnapshot } from "@/src/useSession";

const TABS = [
  { href: "/", label: "목표" },
  { href: "/dashboard", label: "대시보드" },
  { href: "/scenarios", label: "시나리오" },
  { href: "/disposable", label: "가처분" },
  { href: "/data", label: "데이터" },
  { href: "/rules", label: "규칙 근거" },
] as const;

export function AppShell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const pathname = usePathname();
  const { demo } = useSnapshot();
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="flex h-15 items-center gap-7 border-b border-rule bg-surface px-9">
        <span className="font-title text-lg font-bold">내 연금 시뮬레이터</span>
        <nav className="flex gap-5 text-sm font-medium text-ink-2">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={active ? "border-b-2 border-navy py-4 font-bold text-navy" : "py-4 hover:text-ink"}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-[13px] text-ink-3">
          {demo && (
            <Link href="/data" className="inline-flex items-center gap-1.5 rounded-full bg-warn-bg px-3.5 py-1 text-[13px] font-bold text-warn hover:underline" title="내 데이터를 불러오면 데모가 사라집니다">
              데모 모드 — 가상 사례 K씨
            </Link>
          )}
          {right}
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="flex justify-between border-t border-rule px-9 py-3.5 text-xs text-ink-3">
        <span>데이터는 이 브라우저를 떠나지 않습니다 · 세제 단순화 모델 · 투자 권유 아님</span>
        <span>최종 확인은 통합연금포털·공단 원문 기준</span>
      </footer>
    </div>
  );
}
