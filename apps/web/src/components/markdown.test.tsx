import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "./markdown";

describe("markdown link hardening", () => {
  it("renders same-origin path links and blocks protocol-relative // or /\\ links", () => {
    render(
      <Markdown
        source={[
          "[ok](/topics/123)",
          "[scheme-rel](//evil.example/phish)",
          String.raw`[backslash](/\evil.example/phish)`,
          "[js](javascript:alert(1))",
        ].join(" ")}
      />,
    );
    const ok = screen.getByRole("link", { name: "ok" });
    expect(ok.getAttribute("href")).toBe("/topics/123");
    expect(screen.queryByRole("link", { name: "scheme-rel" })).toBeNull();
    expect(screen.queryByRole("link", { name: "backslash" })).toBeNull();
    expect(screen.queryByRole("link", { name: "js" })).toBeNull();
    expect(screen.getByText(/scheme-rel/)).toBeTruthy();
    expect(screen.getByText(/backslash/)).toBeTruthy();
  });
});
