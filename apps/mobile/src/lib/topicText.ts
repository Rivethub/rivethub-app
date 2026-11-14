/** A line under a topic title. The title already shows the name, so the name is not an article. */
export function textUnderTitle(name: string, text: string | undefined): string | null {
  const trimmed = text?.trim() ?? "";
  if (trimmed === "" || trimmed.toLowerCase() === name.trim().toLowerCase()) return null;
  return trimmed;
}
