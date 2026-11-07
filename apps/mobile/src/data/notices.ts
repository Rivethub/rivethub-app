export type NoticeKind = "sample" | "cached";

export interface Notice {
  kind: NoticeKind;
  message: string;
}

export const NO_HUB_NOTICE: Notice = {
  kind: "sample",
  message: "No hub paired. Showing sample memory.",
};

export function fallbackNotice(reason: "timeout" | "offline", cached: boolean): Notice {
  if (reason === "timeout") {
    return cached
      ? { kind: "cached", message: "The hub took too long. Showing saved memory." }
      : { kind: "sample", message: "The hub took too long. Showing sample memory." };
  }
  return cached
    ? { kind: "cached", message: "The hub did not answer. Showing saved memory." }
    : { kind: "sample", message: "The hub did not answer. Showing sample memory." };
}

export const MISSING_NOTICE: Notice = {
  kind: "sample",
  message: "Showing sample memory for what this hub does not serve yet.",
};

export class Notices {
  private standing: Notice | null = null;
  private failures = new Map<string, Notice>();
  private listeners = new Set<() => void>();

  setStanding(notice: Notice | null): void {
    this.standing = notice;
    this.emit();
  }

  fail(key: string, notice: Notice): void {
    this.failures.set(key, notice);
    this.emit();
  }

  ok(key: string): void {
    if (this.failures.delete(key)) this.emit();
  }

  clear(): void {
    this.standing = null;
    this.failures.clear();
    this.emit();
  }

  get(): Notice | null {
    if (this.standing) return this.standing;
    const values = [...this.failures.values()];
    if (!values.length) return null;
    return values.find((notice) => notice.kind === "cached") ?? values[0] ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
