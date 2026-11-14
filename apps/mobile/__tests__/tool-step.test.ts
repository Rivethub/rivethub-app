import { toolLine } from "@rivethub/client-runtime/format";

describe("a tool step on the phone", () => {
  it("shows the tool name once in front of what it did", () => {
    expect(toolLine({ name: "Read", summary: "/tmp/synthetic/tool-marathon-2.txt" })).toBe("Read: /tmp/synthetic/tool-marathon-2.txt");
    expect(toolLine({ name: "Read", summary: "Read: Read /tmp/synthetic/tool-marathon-2.txt" })).not.toMatch(/^Read: Read: Read/);
  });
});
