#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT_DIR = join(import.meta.dir, "..");
const PACKAGE_JSON_PATH = join(ROOT_DIR, "package.json");

const SOURCE_REPO = process.env.GITHUB_REPOSITORY || "tariqwest/allbrew";
const TAP_REPO = process.env.HOMEBREW_TAP_REPO || SOURCE_REPO;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
};

type ReleaseArtifact = {
  filePath: string;
  fileName: string;
  sha256: string;
  tempDir: string;
};

function logInfo(message: string) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function logSuccess(message: string) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logWarn(message: string) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logError(message: string) {
  console.error(`${colors.red}✗${colors.reset} ${message}`);
}

function logStep(message: string) {
  console.log(`\n${colors.blue}▶${colors.reset} ${message}`);
}

function run(command: string, args: string[], options: any = {}) {
  logInfo(`${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    ...options,
  });
}

function output(command: string, args: string[], options: any = {}) {
  return execFileSync(command, args, {
    cwd: ROOT_DIR,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path: string, value: any) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseVersion(version: string) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(a: string, b: string) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (const part of ["major", "minor", "patch"] as const) {
    if (left[part] > right[part]) return 1;
    if (left[part] < right[part]) return -1;
  }
  return 0;
}

function resolveVersion(currentVersion: string, requested: string) {
  const current = parseVersion(currentVersion);

  switch (requested) {
    case "major":
      return `${current.major + 1}.0.0`;
    case "minor":
      return `${current.major}.${current.minor + 1}.0`;
    case "patch":
      return `${current.major}.${current.minor}.${current.patch + 1}`;
    default:
      parseVersion(requested);
      return requested;
  }
}

function ensureCleanWorkingTree() {
  const status = output("git", ["status", "--porcelain"]);
  if (status) {
    throw new Error(
      "Working tree is not clean. Commit or stash changes before running a real release.",
    );
  }
}

function ensureTagDoesNotExist(tagName: string) {
  const localTag = output("git", ["tag", "--list", tagName]);
  if (localTag) {
    throw new Error(`Tag ${tagName} already exists locally.`);
  }

  const remoteTag = output("git", ["ls-remote", "--tags", "origin", tagName]);
  if (remoteTag) {
    throw new Error(`Tag ${tagName} already exists on origin.`);
  }
}

function tapName(repo: string) {
  const [owner, name] = repo.split("/");
  return `${owner}/${name.replace(/^homebrew-/, "")}`;
}

function repoCloneUrl(repo: string) {
  return `https://github.com/${repo}.git`;
}

function artifactName(version: string) {
  return `allbrew-v${version}.tar.gz`;
}

function artifactUrl(version: string) {
  return `https://github.com/${SOURCE_REPO}/releases/download/v${version}/${artifactName(version)}`;
}

function sha256File(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function generateFormula(version: string, sha256: string) {
  return `class Allbrew < Formula
  desc "Generate Homebrew formulas and casks from arbitrary URLs"
  homepage "https://github.com/${SOURCE_REPO}"
  url "${artifactUrl(version)}"
  sha256 "${sha256}"
  license "MIT"

  livecheck do
    url :stable
    strategy :github_latest
  end

  depends_on "bun"

  def install
    libexec.install Dir["*"]

    (libexec/"allbrew").install libexec/"scripts"/"update-managed.sh"
    (libexec/"allbrew").chmod 0755, "update-managed.sh"

    (etc/"allbrew-brew-wrap").write <<~EOS
      # allbrew brew update hook
      # Source from your shell profile:
      #   source "$(brew --prefix)/etc/allbrew-brew-wrap"

      allbrew_brew() {
        command brew "$@"
        local ret=$?
        if [ $ret -eq 0 ] && [ "$1" = "update" ]; then
          brew livecheck --installed --newer-only --json --quiet 2>/dev/null | #{bin}/allbrew update-formulas
          command brew update
        fi
        return $ret
      }

      # Opt in by aliasing brew:
      # alias brew=allbrew_brew
    EOS

    (bin/"allbrew").write <<~EOS
      #!/bin/bash
      exec "#{Formula["bun"].opt_bin}/bun" "#{libexec}/bin/allbrew.ts" "$@"
    EOS
    chmod 0755, bin/"allbrew"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/allbrew --version")
  end
end
`;
}

function buildReleaseArtifact(version: string): ReleaseArtifact {
  const tempDir = mkdtempSync(join(tmpdir(), "allbrew-release-"));
  const stagingDir = join(tempDir, `allbrew-${version}`);
  const fileName = artifactName(version);
  const filePath = join(tempDir, fileName);

  mkdirSync(stagingDir, { recursive: true });

  for (const item of [
    "bin",
    "lib",
    "package.json",
    "bun.lock",
    "tsconfig.json",
  ]) {
    cpSync(join(ROOT_DIR, item), join(stagingDir, item), { recursive: true });
  }

  mkdirSync(join(stagingDir, "scripts"), { recursive: true });
  cpSync(
    join(ROOT_DIR, "scripts", "update-managed.sh"),
    join(stagingDir, "scripts", "update-managed.sh"),
  );

  const stagedPackageJsonPath = join(stagingDir, "package.json");
  const stagedPackageJson = readJson(stagedPackageJsonPath);
  stagedPackageJson.version = version;
  writeJson(stagedPackageJsonPath, stagedPackageJson);

  run("bun", ["install", "--frozen-lockfile", "--production"], {
    cwd: stagingDir,
  });
  run("tar", ["-czf", filePath, "-C", stagingDir, "."], { cwd: tempDir });

  return {
    filePath,
    fileName,
    sha256: sha256File(filePath),
    tempDir,
  };
}

async function githubRequest(path: string, options: any = {}) {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is required to publish GitHub releases.");
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "allbrew-release-script",
      ...(options.headers || {}),
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub API request failed: ${response.status} ${response.statusText}\n${text}`,
    );
  }

  if (response.status === 204) return null;
  return response.json();
}

async function createOrUpdateRelease(version: string, sha256: string) {
  const tagName = `v${version}`;
  const releaseBody = `## allbrew ${version}

Homebrew release asset SHA256:

\`\`\`
${sha256}
\`\`\`

Install or upgrade:

\`\`\`bash
brew tap ${tapName(TAP_REPO)}
brew install allbrew
brew upgrade allbrew
\`\`\`
`;

  const existing = await githubRequest(
    `/repos/${SOURCE_REPO}/releases/tags/${encodeURIComponent(tagName)}`,
  );

  if (existing) {
    const updated = await githubRequest(
      `/repos/${SOURCE_REPO}/releases/${existing.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: tagName,
          body: releaseBody,
          draft: false,
          prerelease: false,
        }),
      },
    );
    logSuccess(`Updated GitHub release ${tagName}`);
    return updated;
  }

  const created = await githubRequest(`/repos/${SOURCE_REPO}/releases`, {
    method: "POST",
    body: JSON.stringify({
      tag_name: tagName,
      name: tagName,
      body: releaseBody,
      draft: false,
      prerelease: false,
    }),
  });
  logSuccess(`Created GitHub release ${tagName}`);
  return created;
}

async function uploadAsset(release: any, artifact: ReleaseArtifact) {
  if (!release) return;

  const existingAsset = release.assets?.find(
    (asset: any) => asset.name === artifact.fileName,
  );

  if (existingAsset) {
    await githubRequest(
      `/repos/${SOURCE_REPO}/releases/assets/${existingAsset.id}`,
      {
        method: "DELETE",
      },
    );
    logWarn(`Deleted existing release asset ${artifact.fileName}`);
  }

  const uploadUrl = release.upload_url.replace("{?name,label}", "");
  const fileBuffer = readFileSync(artifact.filePath);
  const response = await fetch(
    `${uploadUrl}?name=${encodeURIComponent(artifact.fileName)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/gzip",
        "Content-Length": String(fileBuffer.length),
        "User-Agent": "allbrew-release-script",
      },
      body: fileBuffer,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to upload release asset: ${response.status} ${response.statusText}\n${text}`,
    );
  }

  logSuccess(`Uploaded release asset ${artifact.fileName}`);
}

function publishFormulaToTap(version: string, sha256: string) {
  const tempDir = mkdtempSync(join(tmpdir(), "allbrew-tap-"));
  const tapDir = join(tempDir, "tap");

  try {
    logStep(`Publishing Homebrew formula to ${tapName(TAP_REPO)}`);
    run("git", ["clone", repoCloneUrl(TAP_REPO), tapDir], { cwd: tempDir });

    const formulaDir = join(tapDir, "Formula");
    const formulaPath = join(formulaDir, "allbrew.rb");
    mkdirSync(formulaDir, { recursive: true });
    writeFileSync(formulaPath, generateFormula(version, sha256));

    run("ruby", ["-c", formulaPath], { cwd: tapDir });

    const status = output("git", ["status", "--porcelain"], { cwd: tapDir });
    if (!status) {
      logWarn("Homebrew tap formula is already up to date.");
      return;
    }

    run("git", ["add", "Formula/allbrew.rb"], { cwd: tapDir });
    run(
      "git",
      ["commit", "-m", `chore: update allbrew formula for v${version}`],
      {
        cwd: tapDir,
      },
    );

    const branch = output("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: tapDir,
    });
    run("git", ["push", "origin", branch], { cwd: tapDir });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function printUsage() {
  console.log(`Usage: bun run release <patch|minor|major|version>

Examples:
  bun run release patch
  bun run release 1.2.3
  DRY_RUN=1 bun run release minor

Environment:
  GITHUB_TOKEN             Token used to create/update the GitHub release
  GITHUB_REPOSITORY        Source repository, default: ${SOURCE_REPO}
  HOMEBREW_TAP_REPO        Tap repository for install docs, default: ${TAP_REPO}
  DRY_RUN=1                Validate and preview without mutating project files
`);
}

async function main() {
  const requestedVersion = process.argv[2];
  if (
    !requestedVersion ||
    requestedVersion === "--help" ||
    requestedVersion === "-h"
  ) {
    printUsage();
    process.exit(requestedVersion ? 0 : 1);
  }

  const pkg = readJson(PACKAGE_JSON_PATH);
  const currentVersion = pkg.version;
  const nextVersion = resolveVersion(currentVersion, requestedVersion);
  const tagName = `v${nextVersion}`;
  let artifact: ReleaseArtifact | null = null;

  if (compareVersions(nextVersion, currentVersion) <= 0) {
    throw new Error(
      `Release version ${nextVersion} must be greater than current version ${currentVersion}.`,
    );
  }

  logStep(`Preparing allbrew ${nextVersion}`);
  logInfo(`Current version: ${currentVersion}`);
  logInfo(`Next version: ${nextVersion}`);
  logInfo(`Source repository: ${SOURCE_REPO}`);
  logInfo(`Homebrew tap: ${tapName(TAP_REPO)}`);

  if (DRY_RUN) {
    logWarn(
      "Dry run enabled; project files, commits, tags, releases, and pushes will not be changed.",
    );
  } else {
    if (!GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN is required for a real release.");
    }
    ensureCleanWorkingTree();
    ensureTagDoesNotExist(tagName);
  }

  try {
    logStep("Validating Bun project");
    run("bun", ["install", "--frozen-lockfile"]);
    run("bun", ["run", "build"]);
    const currentCliVersion = output("bun", [
      "run",
      "bin/allbrew.ts",
      "--version",
    ]);
    logSuccess(`CLI currently reports version ${currentCliVersion}`);

    logStep("Building release artifact");
    artifact = buildReleaseArtifact(nextVersion);
    logSuccess(`${artifact.fileName}: ${artifact.sha256}`);

    if (DRY_RUN) {
      const previewFormula = generateFormula(nextVersion, artifact.sha256);
      logStep("Formula preview");
      console.log(previewFormula);
      logSuccess(`Dry run complete for ${tagName}`);
      return;
    }

    logStep("Committing version bump");
    pkg.version = nextVersion;
    writeJson(PACKAGE_JSON_PATH, pkg);
    run("bun", ["run", "build"]);
    const nextCliVersion = output("bun", [
      "run",
      "bin/allbrew.ts",
      "--version",
    ]);
    if (nextCliVersion !== nextVersion) {
      throw new Error(
        `Expected CLI version ${nextVersion}, but got ${nextCliVersion}.`,
      );
    }

    run("git", ["add", "package.json"]);
    if (existsSync(join(ROOT_DIR, "bun.lock"))) {
      run("git", ["add", "bun.lock"]);
    }
    run("git", ["commit", "-m", `chore: release ${tagName}`]);
    run("git", ["tag", "-a", tagName, "-m", tagName]);

    const branch = output("git", ["rev-parse", "--abbrev-ref", "HEAD"]);

    logStep("Pushing release tag");
    run("git", ["push", "origin", branch]);
    run("git", ["push", "origin", tagName]);

    logStep("Publishing GitHub release asset");
    const release = await createOrUpdateRelease(nextVersion, artifact.sha256);
    await uploadAsset(release, artifact);

    publishFormulaToTap(nextVersion, artifact.sha256);

    logSuccess(`Released ${tagName}`);
    console.log(
      `\nInstall with:\n  brew tap ${tapName(TAP_REPO)}\n  brew install allbrew`,
    );
  } finally {
    if (artifact) {
      rmSync(artifact.tempDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
