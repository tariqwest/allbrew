import { stdin } from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { relative } from "node:path";
import { loadManifest, saveManifest } from "./manifest.ts";
import { updateManagedPackage } from "./package-updater.ts";
import { commitAndPushTap } from "./tap-git.ts";
import { loadConfig } from "./config.ts";

const execFileAsync = promisify(execFile);

export type LivecheckEntry = {
  formula?: string;
  cask?: string;
  status?: string;
  version?: {
    current?: string;
    latest?: string;
    outdated?: boolean;
  };
};

export type UpdateFormulasOptions = {
  dryRun?: boolean;
  push?: boolean;
  livecheck?: boolean;
  stdin?: boolean;
  names?: string[];
  tapPath?: string;
  entries?: LivecheckEntry[];
};

export type UpdateFormulasResult = {
  checked: number;
  updated: string[];
  skipped: string[];
  errors: Array<{ name: string; error: string }>;
};

export async function updateFormulas(
  options: UpdateFormulasOptions = {},
): Promise<UpdateFormulasResult> {
  let entries: LivecheckEntry[];
  if (options.entries) {
    entries = options.entries;
  } else if (options.livecheck || stdin.isTTY) {
    entries = await runBrewLivecheck();
  } else {
    entries = await readStdinLivecheck();
    if (entries.length === 0) {
      entries = await runBrewLivecheck();
    }
  }

  const config = await loadConfig();
  const autoPush = options.push ?? config.update?.autoPush ?? true;

  const result: UpdateFormulasResult = {
    checked: 0,
    updated: [],
    skipped: [],
    errors: [],
  };

  const tapCommits = new Map<string, string[]>();

  for (const entry of entries) {
    const name = entry.formula || entry.cask;
    if (!name) continue;
    if (options.names?.length && !options.names.includes(name)) continue;
    if (entry.status === "error") {
      result.skipped.push(name);
      continue;
    }
    if (!entry.version?.outdated) {
      result.skipped.push(name);
      continue;
    }

    result.checked++;

    const manifest = await loadManifest(name);
    if (!manifest) {
      result.skipped.push(name);
      continue;
    }

    if (options.tapPath && manifest.tapPath !== options.tapPath) {
      result.skipped.push(name);
      continue;
    }

    if (options.dryRun) {
      result.updated.push(name);
      continue;
    }

    try {
      if (entry.version?.latest) {
        manifest.recordedVersion = entry.version.latest;
      }
      const updateResult = await updateManagedPackage(manifest);
      manifest.recordedVersion =
        updateResult.recordedVersion || manifest.recordedVersion;
      manifest.recordedAt = new Date().toISOString();
      await saveManifest(manifest);

      const relPath = relative(manifest.tapPath, updateResult.filePath);
      const files = tapCommits.get(manifest.tapPath) || [];
      files.push(relPath);
      tapCommits.set(manifest.tapPath, files);
      result.updated.push(name);
    } catch (err) {
      result.errors.push({
        name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!options.dryRun) {
    for (const [tapPath, files] of tapCommits) {
      if (files.length === 0) continue;
      const names = result.updated.join(", ");
      try {
        await commitAndPushTap(
          tapPath,
          files,
          `chore(allbrew): update ${names}`,
          { push: autoPush },
        );
      } catch (err: any) {
        result.errors.push({
          name: names,
          error: `tap push failed: ${err?.message || err}`,
        });
      }
    }
  }

  return result;
}

async function runBrewLivecheck(): Promise<LivecheckEntry[]> {
  try {
    const { stdout } = await execFileAsync(
      "brew",
      ["livecheck", "--installed", "--newer-only", "--json", "--quiet"],
      {
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          HOMEBREW_DEVELOPER: "1",
          HOMEBREW_NO_AUTO_UPDATE: "1",
          HOMEBREW_NO_REQUIRE_TAP_TRUST: "1",
        },
      },
    );
    return parseLivecheckJson(stdout);
  } catch (error: any) {
    if (error.stdout) {
      return parseLivecheckJson(error.stdout);
    }
    return [];
  }
}

async function readStdinLivecheck(): Promise<LivecheckEntry[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return parseLivecheckJson(Buffer.concat(chunks).toString("utf-8"));
}

function parseLivecheckJson(raw: string): LivecheckEntry[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [];
}
