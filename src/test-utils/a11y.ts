import axe from 'axe-core';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Runs axe-core and returns readable violations. Colour contrast needs real
 * layout, which jsdom lacks, so it is checked in the browser instead.
 */
export async function axeViolations(context: Element | Document, includeBestPractice = false): Promise<string[]> {
  const results = await axe.run(context, {
    runOnly: { type: 'tag', values: includeBestPractice ? [...WCAG_TAGS, 'best-practice'] : WCAG_TAGS },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}
