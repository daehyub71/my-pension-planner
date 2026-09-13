import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/AppShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

describe("공통 레이아웃", () => {
  it("탭 6개를 띄우고 현재 탭을 표시한다", () => {
    render(<AppShell>본문</AppShell>);
    for (const t of ["목표", "대시보드", "시나리오", "가처분", "데이터", "규칙 근거"]) {
      expect(screen.getByRole("link", { name: t })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "대시보드" })).toHaveAttribute("aria-current", "page");
  });

  it("면책 문구가 항상 보인다 (N5)", () => {
    render(<AppShell>본문</AppShell>);
    expect(screen.getByText(/데이터는 이 브라우저를 떠나지 않습니다/)).toBeInTheDocument();
    expect(screen.getByText(/투자 권유 아님/)).toBeInTheDocument();
  });
});
