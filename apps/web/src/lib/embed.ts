/**
 * Embedded when a host bridge is present, or when the URL asks with `embed=1`.
 * One decision. The shell reads it through `useEmbedded`. Nothing else looks at `window`.
 */
export function decideEmbed(input: { host: boolean; embed: unknown }): boolean {
  return input.host || input.embed === "1" || input.embed === 1;
}
