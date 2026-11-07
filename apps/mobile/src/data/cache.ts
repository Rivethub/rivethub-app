const LIMIT = 40;
const MAX_CHARS = 800_000;

export interface ResponseCache {
  peek<T>(key: string): T | undefined;
  set(key: string, value: unknown): Promise<void>;
}

export class MemoryCache {
  private map = new Map<string, unknown>();
  private order: string[] = [];

  async hydrate(load: (key: string) => Promise<string | null>, storageKey: string): Promise<void> {
    const raw = await load(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { order?: unknown; entries?: unknown };
      if (!parsed.entries || typeof parsed.entries !== "object") return;
      this.map = new Map(Object.entries(parsed.entries as Record<string, unknown>));
      this.order = Array.isArray(parsed.order) ? parsed.order.filter((key): key is string => typeof key === "string") : [...this.map.keys()];
    } catch {
      this.map.clear();
      this.order = [];
    }
  }

  peek<T>(key: string): T | undefined {
    return this.map.has(key) ? (this.map.get(key) as T) : undefined;
  }

  async set(key: string, value: unknown, save: (key: string, value: string) => Promise<void>, storageKey: string): Promise<void> {
    this.map.set(key, value);
    this.order = [...this.order.filter((item) => item !== key), key];
    while (this.order.length > LIMIT) {
      const oldest = this.order.shift();
      if (oldest) this.map.delete(oldest);
    }
    const payload = JSON.stringify({ order: this.order, entries: Object.fromEntries(this.map) });
    if (payload.length > MAX_CHARS) return;
    await save(storageKey, payload);
  }
}
