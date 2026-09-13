import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GuidePanel } from "@/components/GuidePanel";

const sections = [
  { key: "a", title: "첫째 제목", body: "첫째 본문" },
  { key: "b", title: "둘째 제목", body: "둘째 본문" },
];

describe("F21 GuidePanel", () => {
  it("기본은 접혀 있다", () => {
    render(<GuidePanel sections={sections} intro="소개 한 줄" />);
    const btn = screen.getByRole("button", { name: /이 화면 읽는 법/ });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).toHaveTextContent("펼치기 ▾");
    expect(screen.getByText("소개 한 줄")).toBeInTheDocument();
    expect(screen.queryByText("첫째 제목")).not.toBeInTheDocument();
  });

  it("펼치면 모든 문단의 제목·본문이 보이고, 다시 접힌다", () => {
    render(<GuidePanel sections={sections} intro="소개 한 줄" />);
    const btn = screen.getByRole("button", { name: /이 화면 읽는 법/ });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(btn).toHaveTextContent("접기 ▴");
    for (const s of sections) {
      expect(screen.getByText(s.title)).toBeInTheDocument();
      expect(screen.getByText(s.body)).toBeInTheDocument();
    }
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("둘째 본문")).not.toBeInTheDocument();
  });

  it("banner: 첫 문단은 늘 보이고 나머지는 펼쳐야 보인다", () => {
    render(<GuidePanel variant="banner" sections={sections} />);
    const note = screen.getByRole("note", { name: "읽는 법" });
    expect(note).toHaveTextContent("첫째 본문");
    expect(screen.queryByText("둘째 본문")).not.toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "펼치기 ▾" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("둘째 제목")).toBeInTheDocument();
    expect(screen.getByText("둘째 본문")).toBeInTheDocument();
  });
});
