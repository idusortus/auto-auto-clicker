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

const sourceFiles = [
  ...collectTypeScript(join(engineRoot, 'src')),
  ...collectTypeScript(join(engineRoot, 'save')),
];

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
});
