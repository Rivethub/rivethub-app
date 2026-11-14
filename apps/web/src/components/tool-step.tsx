import { toolLine } from "@rivethub/client-runtime/format";

/** One tool step, with the tool's name printed once. Web and the phone share `toolLine`. */
export function ToolStep({ name, summary }: { name: string; summary: string }) {
  return <span className="text-[13px] text-muted-foreground">› {toolLine({ name, summary })}</span>;
}
