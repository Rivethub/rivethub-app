import { describe, expect, it } from "vitest";
import { splitInjected } from "../src/injected.js";

describe("splitInjected", () => {
  it("folds harness blocks and unwraps the person's request", () => {
    const text = "<t3_code_instructions>\n## Mode\nBe brief.\n</t3_code_instructions>\n\n<user_request>\nBuild the app.\n</user_request>";
    expect(splitInjected(text)).toEqual([
      { kind: "injected", tag: "t3_code_instructions", text: "## Mode\nBe brief." },
      { kind: "said", text: "Build the app." },
    ]);
  });

  it("keeps a one-line block and the text around it", () => {
    expect(splitInjected("look at this\n<runtime_info>In T3.</runtime_info>\nthanks")).toEqual([
      { kind: "said", text: "look at this" },
      { kind: "injected", tag: "runtime_info", text: "In T3." },
      { kind: "said", text: "thanks" },
    ]);
  });

  it("leaves prose with inline tags alone", () => {
    const text = "wrap it in <b>bold</b> and keep <div>going</div>";
    expect(splitInjected(text)).toEqual([{ kind: "said", text }]);
  });
});

it("handles multiline blocks, hyphenated tags and CRLF without losing the request", () => {
  expect(splitInjected("<system-reminder>\r\nKeep this context.\r\n</system-reminder>\r\n<user_query>\r\nWhat changed?\r\n</user_query>")).toEqual([
    { kind: "injected", tag: "system-reminder", text: "Keep this context." },
    { kind: "said", text: "What changed?" },
  ]);
});

it("also classifies a person's line-start custom-element example as context", () => {
  // Known ambiguity: callers must not apply this heuristic to assistant markup examples.
  expect(splitInjected("Explain this component:\n<my-widget>Save</my-widget>")).toEqual([
    { kind: "said", text: "Explain this component:" },
    { kind: "injected", tag: "my-widget", text: "Save" },
  ]);
});
