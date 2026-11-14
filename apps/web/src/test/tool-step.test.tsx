import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolStep } from "../components/tool-step";

describe("ToolStep", () => {
  it("prints the tool name once when the summary is what the tool did", () => {
    render(<ToolStep name="Read" summary="/tmp/synthetic/tool-marathon-2.txt" />);
    expect(screen.getByText("› Read: /tmp/synthetic/tool-marathon-2.txt")).toBeInTheDocument();
  });

  it("does not prefix a summary that already starts with the tool name", () => {
    render(<ToolStep name="Read" summary="Read /tmp/synthetic/tool-marathon-2.txt" />);
    expect(screen.getByText("› Read /tmp/synthetic/tool-marathon-2.txt")).toBeInTheDocument();
    expect(screen.queryByText(/Read: Read/)).not.toBeInTheDocument();
  });
});
