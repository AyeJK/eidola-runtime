import type { LoadedEngram } from '../engram/types.js';
import { computeSoulHash } from './hash.js';
import type { CompiledCursorRule } from './types.js';

function escapeYamlDoubleQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const FRONTMATTER_DELIMITER = '---';

function buildFrontmatter(description: string): string {
  const safeDescription = escapeYamlDoubleQuoted(description);
  return [
    FRONTMATTER_DELIMITER,
    'alwaysApply: true',
    `description: "${safeDescription}"`,
    FRONTMATTER_DELIMITER,
    '',
  ].join('\n');
}

/** Split compiled `.mdc` into frontmatter block and Soul body. */
export function parseCompiledCursorRule(content: string): { frontmatter: string; body: string } {
  if (!content.startsWith(`${FRONTMATTER_DELIMITER}\n`)) {
    throw new Error('Compiled Cursor rule is missing YAML frontmatter.');
  }

  const closeIndex = content.indexOf(`\n${FRONTMATTER_DELIMITER}\n`, FRONTMATTER_DELIMITER.length + 1);
  if (closeIndex === -1) {
    throw new Error('Compiled Cursor rule frontmatter is not closed.');
  }

  const frontmatterEnd = closeIndex + 1 + `${FRONTMATTER_DELIMITER}\n`.length;
  return {
    frontmatter: content.slice(0, frontmatterEnd),
    body: content.slice(frontmatterEnd),
  };
}

/**
 * Compile Engram Soul prose into a Cursor always-on rule (`.mdc`).
 * Body is SOUL.md verbatim — no YAML or frontmatter leakage into Soul prose.
 */
export function compileSoulToCursorRule(engram: LoadedEngram): CompiledCursorRule {
  const soul = engram.soul.replace(/\r\n/g, '\n');
  const soulHash = computeSoulHash(soul);
  const frontmatter = buildFrontmatter(engram.engram.name);
  const content = `${frontmatter}${soul}`;

  return {
    engramId: engram.engram.id,
    name: engram.engram.name,
    soulHash,
    content,
  };
}

/** Patch `alwaysApply` in an existing compiled `.mdc` rule. */
export function setCursorRuleAlwaysApply(content: string, alwaysApply: boolean): string {
  const { frontmatter, body } = parseCompiledCursorRule(content);
  const value = alwaysApply ? 'true' : 'false';
  const updated = frontmatter.includes('alwaysApply:')
    ? frontmatter.replace(/alwaysApply:\s*(true|false)/, `alwaysApply: ${value}`)
    : frontmatter.replace(
        `${FRONTMATTER_DELIMITER}\n`,
        `${FRONTMATTER_DELIMITER}\nalwaysApply: ${value}\n`,
      );
  return `${updated}${body}`;
}
