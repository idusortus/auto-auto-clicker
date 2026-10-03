#!/usr/bin/env node
// Dependency-free version tooling for auto-auto-clicker.
//
// Single source of truth: `mobile/package.json` `version`.
// Derived files: `mobile/app.json` `expo.version` and root `package.json` `version`.
// `expo.android.versionCode` is NEVER derived from semver and is left untouched
// (it stays a monotonic commit-count integer produced by the release workflow).
//
// Modes:
//   sync          propagate the source version to the derived files
//   bump <x.y.z>  set the source version, then propagate
//   check         fail non-zero on derived-file drift or a tag/version mismatch
//
// No imports beyond node:fs/node:path/node:child_process; no new dependencies.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE_FILE = "mobile/package.json";
const APP_FILE = "mobile/app.json";
const ROOT_FILE = "package.json";

// A deliberately basic semver-ish shape check: no dependency, just enough to
// reject obvious mistakes (empty strings, missing numeric parts, stray spaces).
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function readJson(relPath) {
  const abs = resolve(REPO_ROOT, relPath);
  return JSON.parse(readFileSync(abs, "utf8"));
}

function writeJson(relPath, value) {
  const abs = resolve(REPO_ROOT, relPath);
  writeFileSync(abs, JSON.stringify(value, null, 2) + "\n");
}

function declaredVersion() {
  return readJson(SOURCE_FILE).version;
}

// Writes `version` into both derived files without touching
// `expo.android.versionCode`. Returns the list of files actually changed.
function propagate(version) {
  const changed = [];

  const app = readJson(APP_FILE);
  if (app.expo.version !== version) {
    app.expo.version = version;
    writeJson(APP_FILE, app);
    changed.push(APP_FILE);
  }

  const root = readJson(ROOT_FILE);
  if (root.version !== version) {
    root.version = version;
    writeJson(ROOT_FILE, root);
    changed.push(ROOT_FILE);
  }

  return changed;
}

function sync() {
  const version = declaredVersion();
  const changed = propagate(version);
  console.log(`version:sync source ${SOURCE_FILE} = ${version}`);
  if (changed.length === 0) {
    console.log("version:sync derived files already in sync; no changes");
  } else {
    for (const file of changed) {
      console.log(`version:sync wrote ${file}`);
    }
  }
  return 0;
}

function bump(rawVersion) {
  if (!rawVersion || !SEMVER_RE.test(rawVersion)) {
    console.error(
      `ERROR: bump requires a semver-ish version like 1.2.3 (got ${JSON.stringify(rawVersion)})`
    );
    return 1;
  }

  const mobile = readJson(SOURCE_FILE);
  const changed = [];
  if (mobile.version !== rawVersion) {
    mobile.version = rawVersion;
    writeJson(SOURCE_FILE, mobile);
    changed.push(SOURCE_FILE);
  }
  console.log(`version:bump set ${SOURCE_FILE} = ${rawVersion}`);

  for (const file of propagate(rawVersion)) {
    changed.push(file);
  }

  if (changed.length === 0) {
    console.log("version:bump no files changed; everything already at " + rawVersion);
  } else {
    for (const file of changed) {
      console.log(`version:bump wrote ${file}`);
    }
  }
  return 0;
}

// Returns the candidate tag version (without the leading `v`) and how it was
// resolved, or null when no tag is resolvable. `via` is "env" | "git".
function resolveTagVersion() {
  const ref = process.env.GITHUB_REF_NAME;
  if (ref) {
    if (!ref.startsWith("v")) {
      throw new Error(
        `GITHUB_REF_NAME is set to ${JSON.stringify(ref)}, which is not a v* tag`
      );
    }
    return { version: ref.slice(1), via: "env", tag: ref };
  }

  try {
    const out = execFileSync(
      "git",
      ["describe", "--exact-match", "--tags", "--match", "v*"],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
    if (!out) return null;
    return { version: out.replace(/^v/, ""), via: "git", tag: out };
  } catch (err) {
    // `git describe --exact-match` exits 128 (fatal), not a clean "no tag", on
    // an untagged HEAD. Any git failure here is treated as "no tag resolvable";
    // the caller decides whether that is a local skip or a CI fail-closed.
    if (err && err.code === "ENOENT") {
      throw new Error("git executable not found; cannot resolve a tag");
    }
    return null;
  }
}

function check() {
  const version = declaredVersion();
  const failures = [];

  // (a) Derived-file drift.
  const app = readJson(APP_FILE);
  if (app.expo.version !== version) {
    failures.push(
      `${APP_FILE} expo.version (${JSON.stringify(app.expo.version)}) != ${SOURCE_FILE} version (${version})`
    );
  }

  const root = readJson(ROOT_FILE);
  if (root.version !== version) {
    failures.push(
      `${ROOT_FILE} version (${JSON.stringify(root.version)}) != ${SOURCE_FILE} version (${version})`
    );
  }

  // (b) Tag/version agreement (fail-closed in CI).
  const ciEnv = Boolean(process.env.CI || process.env.GITHUB_REF_NAME);
  try {
    const tag = resolveTagVersion();
    if (tag === null) {
      if (ciEnv) {
        failures.push(
          "no resolvable v* tag found while CI is set; refusing to skip the tag check (fail-closed)"
        );
      } else {
        console.log("version:check no local v* tag; skipping tag check (local development)");
      }
    } else if (tag.version !== version) {
      failures.push(
        `tag ${tag.tag} version (${tag.version}) != ${SOURCE_FILE} version (${version})`
      );
    }
  } catch (err) {
    failures.push(err.message);
  }

  if (failures.length > 0) {
    console.error("version:check FAILED:");
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    return 1;
  }

  console.log(`version:check OK (declared version ${version})`);
  return 0;
}

function usage() {
  console.error("Usage: node scripts/version.mjs <sync|bump <x.y.z>|check>");
  return 2;
}

const [, , mode, arg] = process.argv;

let exitCode;
switch (mode) {
  case "sync":
    exitCode = sync();
    break;
  case "bump":
    exitCode = bump(arg);
    break;
  case "check":
    exitCode = check();
    break;
  default:
    exitCode = usage();
}

process.exit(exitCode);
