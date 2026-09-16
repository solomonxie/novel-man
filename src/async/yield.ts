/**
 * Hands the JS thread back so touches and animation get a turn. Long parses
 * must call this between chunks or the whole UI freezes for their duration.
 */
export function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
