type TimeoutFn = (milliseconds: number) => AbortSignal;

/** The shared client aborts with AbortSignal.timeout and clones fixtures with structuredClone. */
export function installRuntimePolyfills(): void {
  const signal = AbortSignal as unknown as { timeout?: TimeoutFn };
  if (typeof signal.timeout !== "function") {
    signal.timeout = (milliseconds: number) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
      }, milliseconds);
      controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
      return controller.signal;
    };
  }
  if (typeof globalThis.structuredClone !== "function") {
    globalThis.structuredClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  }
}
