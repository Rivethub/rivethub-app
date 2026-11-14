import { z } from "zod";

/** Descriptive wire values are open: retain the raw label for a plain UI fallback. */
export function descriptive<const T extends readonly [string, ...string[]]>(known: T) {
  return z.union([z.enum(known), z.string()]);
}

/** A bad row must not hide its usable neighbors. Warn without logging private payloads. */
export function rows<T extends z.ZodTypeAny>(schema: T) {
  return z.array(z.unknown()).transform((items): z.output<T>[] => items.flatMap((item, index) => {
    const result = schema.safeParse(item);
    if (result.success) return [result.data];
    console.warn(`Dropped unusable hub row ${index}: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    return [];
  }));
}
