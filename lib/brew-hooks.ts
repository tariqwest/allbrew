import { execFile } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { homedir } from "node:os";

const execFileAsync = promisify(execFile);

export async function getBrewPrefix() {
  const { stdout } = await execFileAsync("brew", ["--prefix"]);
  return stdout.trim();
}

export function brewWrapPath(prefix: string) {
  return join(prefix, "etc", "allbrew-brew-wrap");
}

export const BREW_WRAP_CONTENT = `# allbrew brew update hook
# Source from your shell profile:
#   source "$(brew --prefix)/etc/allbrew-brew-wrap"

allbrew_brew() {
  command brew "$@"
  local ret=$?
  if [ $ret -eq 0 ] && [ "$1" = "update" ]; then
    brew livecheck --installed --newer-only --json --quiet 2>/dev/null | allbrew update-formulas
  fi
  return $ret
}

# Opt in by aliasing brew:
# alias brew=allbrew_brew
`;

export async function installBrewHooks(prefix?: string) {
  const brewPrefix = prefix ?? await getBrewPrefix();
  const wrapPath = brewWrapPath(brewPrefix);
  await mkdir(join(brewPrefix, "etc"), { recursive: true });
  await writeFile(wrapPath, BREW_WRAP_CONTENT, "utf-8");
  return wrapPath;
}

export async function uninstallBrewHooks(prefix?: string) {
  const brewPrefix = prefix ?? await getBrewPrefix();
  const wrapPath = brewWrapPath(brewPrefix);
  try {
    await unlink(wrapPath);
  } catch {
    // ignore
  }
  return wrapPath;
}

export function shellSnippet(wrapPath: string) {
  return `source "${wrapPath}"\n# alias brew=allbrew_brew`;
}

export function zshrcMarkerPath() {
  return join(homedir(), ".zshrc");
}
