import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const engineRoot = fileURLToPath(new URL('..', import.meta.url));

function collectTypeScript(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...collectTypeScript(full));
    else if (entry.endsWith('.ts')) files.push(full);
  }
  return files;
}

/**
 * Blank out comments (and optionally string/template literals) so the boundary
 * scan only inspects the code or the import specifiers it intends to. Without
 * this a comment/string that merely mentions `document`, `react`, or a module
 * name would produce a false positive.
 */
function stripComments(source: string, stripStrings: boolean): string {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i] as string;
    const next = source[i + 1];

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (stripStrings && (ch === '"' || ch === "'" || ch === '`')) {
      i += 1;
      while (i < n) {
        const c = source[i];
        if (c === '\\') {
          i += 2;
          continue;
        }
        i += 1;
        if (c === ch) break;
      }
      out += ' ';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Identifier reference, so `document.title` fails but `documentation` does not. */
function identifierPattern(name: string): RegExp {
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`);
}

/** Import/require of a module, tolerant of subpaths: `from 'react-dom'`, `require('jsdom')`. */
function importPattern(name: string): RegExp {
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`(?:from|import|require)\\s*\\(?\\s*['"]${escaped}(?:/[^'"]*)?['"]`);
}

const sourceFiles = [
  ...collectTypeScript(join(engineRoot, 'src')),
  ...collectTypeScript(join(engineRoot, 'save')),
];

// DOM/React-Native globals that must never appear as identifiers in the engine.
const forbiddenGlobals = ['document', 'window', 'react', 'react-native', 'jsdom'];
// Packages that must never be imported (also catches `react-dom`, `react-native-web`).
const forbiddenModules = ['react', 'react-native', 'jsdom'];

describe('engine-core boundary', () => {
  it('has source files to scan', () => {
    expect(sourceFiles.length).toBeGreaterThan(5);
  });

  it('never imports from the web workspace', () => {
    const webImport = /from\s+['"][^'"]*web[^'"]*['"]/;
    const offenders = sourceFiles.filter((file) => webImport.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('contains no nondeterministic or network globals', () => {
    const forbidden = [
      { name: 'Math.random', pattern: /Math\.random\s*\(/ },
      { name: 'Date.now', pattern: /Date\.now\s*\(/ },
      { name: 'performance.now', pattern: /performance\.now\s*\(/ },
      { name: 'setTimeout', pattern: /setTimeout\s*\(/ },
      { name: 'fetch', pattern: /\bfetch\s*\(/ },
    ];

    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      for (const rule of forbidden) {
        expect(rule.pattern.test(source), `${rule.name} found in ${file}`).toBe(false);
      }
    }
  });

  it('never references DOM or React Native globals as identifiers', () => {
    for (const file of sourceFiles) {
      const code = stripComments(readFileSync(file, 'utf8'), true);
      for (const name of forbiddenGlobals) {
        expect(
          identifierPattern(name).test(code),
          `${name} referenced as an identifier in ${file}`,
        ).toBe(false);
      }
    }
  });

  it('never imports React, React Native, or jsdom', () => {
    for (const file of sourceFiles) {
      // Comments are removed but strings are kept so import specifiers survive.
      const code = stripComments(readFileSync(file, 'utf8'), false);
      for (const name of forbiddenModules) {
        expect(importPattern(name).test(code), `${name} imported in ${file}`).toBe(false);
      }
    }
  });
});
