// Runs the real ESLint config so a dropped plugin or rule set fails the suite.
// @vitest-environment node
import { ESLint } from 'eslint';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FILE = path.join(ROOT, 'src/components/LintProbe.jsx');

async function lint(code) {
  const eslint = new ESLint({ cwd: ROOT });
  const [result] = await eslint.lintText(code, { filePath: FILE });
  return result.messages;
}

function errorRules(messages) {
  return messages.filter((m) => m.severity === 2).map((m) => m.ruleId);
}

describe('eslint config', () => {
  it('ignores Claude worktrees nested in the checkout', async () => {
    const eslint = new ESLint({ cwd: ROOT });
    expect(await eslint.isPathIgnored(path.join(ROOT, '.claude/worktrees/x/src/main.jsx'))).toBe(
      true,
    );
  });

  it('passes clean JSX', async () => {
    const messages = await lint(
      'export default function LintProbe() {\n  return <img src="/a.png" alt="A" />;\n}\n',
    );
    expect(messages).toEqual([]);
  });

  it('reports words written straight into JSX, which belong in en.json (#19)', async () => {
    const messages = await lint(
      'export default function LintProbe() {\n  return <p>Find my precinct</p>;\n}\n',
    );
    expect(errorRules(messages)).toContain('react/jsx-no-literals');
  });

  it('allows punctuation in JSX between a sentence and its link', async () => {
    const messages = await lint(
      'export default function LintProbe({ a }) {\n  return (\n    <p>\n      {a}.\n    </p>\n  );\n}\n',
    );
    expect(messages).toEqual([]);
  });

  it('reports a missing alt attribute as a jsx-a11y error', async () => {
    const messages = await lint(
      'export default function LintProbe() {\n  return <img src="/a.png" />;\n}\n',
    );
    expect(errorRules(messages)).toContain('jsx-a11y/alt-text');
  });

  it('reports a conditional hook call as a react-hooks error', async () => {
    const messages = await lint(
      "import { useState } from 'react';\n" +
        'export default function LintProbe({ on }) {\n' +
        '  if (on) useState(0);\n' +
        '  return null;\n' +
        '}\n',
    );
    expect(errorRules(messages)).toContain('react-hooks/rules-of-hooks');
  });

  it('reports an unescaped JSX entity as a react error', async () => {
    const messages = await lint(
      "export default function LintProbe() {\n  return <p>Don't</p>;\n}\n",
    );
    expect(errorRules(messages)).toContain('react/no-unescaped-entities');
  });
});
