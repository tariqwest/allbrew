import { arch as osArch } from "node:os";
import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { pypiLivecheckBlock } from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { PipPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

/** Python version used by the pip formula template (`depends_on "python@3.13"`). */
export const PIP_FORMULA_PYTHON = { major: 3, minor: 13 } as const;

type PypiUrl = {
  packagetype?: string;
  python_version?: string;
  filename?: string;
  url?: string;
  yanked?: boolean;
  digests?: { sha256?: string };
};

type SelectedDist = { url: string; sha256: string; filename: string; kind: "wheel" | "sdist" };

export async function collectPipPackagePayload(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
): Promise<PipPackagePayload> {
  const pypiData = await fetchPypiData(packageName);
  const dist = selectBestDistribution(pypiData.urls || [], {
    preferWheel: options.preferWheel !== false,
  });

  if (!dist)
    throw new Error(
      `No suitable wheel or source distribution found for ${packageName} on PyPI`,
    );

  const deps = await resolveTransitiveDeps(packageName, new Set());

  const name = options.name || toFormulaName(packageName);
  const className = toClassName(name);
  const desc =
    options.desc ||
    pypiData.info.summary ||
    repoInfo?.description ||
    `Install ${packageName}`;
  const homepage =
    pypiData.info.home_page ||
    pypiData.info.project_url ||
    repoInfo?.homepage ||
    `https://pypi.org/project/${packageName}/`;
  const license = guessLicenseIdentifier(
    pypiData.info.license || repoInfo?.license,
  );

  return {
    template: "pip_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    url: rubyEscape(dist.url),
    sha256: rubyEscape(dist.sha256),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    livecheckBlock: pypiLivecheckBlock(packageName),
    resourcesBlock: buildResourcesBlock(deps),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(options.binName || name),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

function buildResourcesBlock(
  deps: Array<{ name: string; url: string; sha256: string }>,
) {
  if (deps.length === 0) return "";

  let block = "";
  for (const dep of deps) {
    block += `  resource ${rubyString(dep.name)} do\n`;
    block += `    url ${rubyString(dep.url)}\n`;
    block += `    sha256 ${rubyString(dep.sha256)}\n`;
    block += `  end\n\n`;
  }
  return block;
}

export async function generatePipPackage(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
) {
  const payload = await collectPipPackagePayload(
    packageName,
    repoInfo,
    options,
  );
  return writeRenderedFormula(payload, options.tapPath);
}

async function fetchPypiData(packageName: string) {
  const pypiBase = process.env.PYPI_URL || "https://pypi.org";
  const response = await fetch(
    `${pypiBase}/pypi/${encodeURIComponent(packageName)}/json`,
    {
      headers: { Accept: "application/json", "User-Agent": "allbrew/1.0" },
    },
  );
  if (!response.ok)
    throw new Error(
      `PyPI lookup failed for ${packageName}: ${response.status}`,
    );
  return response.json();
}

function toSelectedDist(url: PypiUrl, kind: "wheel" | "sdist"): SelectedDist | null {
  if (!url?.url || !url?.digests?.sha256) return null;
  return {
    url: url.url,
    sha256: url.digests.sha256,
    filename: url.filename || url.url.split("/").pop() || "",
    kind,
  };
}

function hostMacArch(): "arm64" | "x86_64" | null {
  const a = osArch();
  if (a === "arm64") return "arm64";
  if (a === "x64") return "x86_64";
  return null;
}

function parseWheelTags(filename: string): {
  pythonTags: string[];
  abiTags: string[];
  platformTags: string[];
} | null {
  // {distribution}-{version}(-{build})?-{python}-{abi}-{platform}.whl
  if (!filename.toLowerCase().endsWith(".whl")) return null;
  const stem = filename.slice(0, -4);
  const parts = stem.split("-");
  if (parts.length < 5) return null;
  const platformTags = parts[parts.length - 1].split(".");
  const abiTags = parts[parts.length - 2].split(".");
  const pythonTags = parts[parts.length - 3].split(".");
  return { pythonTags, abiTags, platformTags };
}

function pythonTagCompatible(
  tag: string,
  py = PIP_FORMULA_PYTHON,
): { ok: boolean; pure: boolean; score: number } {
  const t = tag.toLowerCase();
  // pure-python tags: py3, py3.x, py2.py3
  if (t === "py2.py3" || t === "py3" || /^py3(\.\d+)?$/.test(t)) {
    return { ok: true, pure: true, score: 100 };
  }
  const cp = t.match(/^cp(\d)(\d+)$/);
  if (cp) {
    const major = Number(cp[1]);
    const minor = Number(cp[2]);
    if (major === py.major && minor === py.minor) {
      return { ok: true, pure: false, score: 90 };
    }
    return { ok: false, pure: false, score: 0 };
  }
  return { ok: false, pure: false, score: 0 };
}

function abiTagCompatible(tag: string, py = PIP_FORMULA_PYTHON): boolean {
  const t = tag.toLowerCase();
  if (t === "none") return true;
  if (t === "abi3") return true;
  // cp313, cp313t, etc.
  const m = t.match(/^cp(\d)(\d+)t?$/);
  if (!m) return false;
  return Number(m[1]) === py.major && Number(m[2]) === py.minor;
}

function platformTagCompatible(
  tag: string,
  macArch: "arm64" | "x86_64" | null,
): { ok: boolean; score: number } {
  const t = tag.toLowerCase();
  if (t === "any") return { ok: true, score: 50 };

  if (process.platform === "darwin" || macArch) {
    if (t.includes("universal2")) return { ok: true, score: 70 };
    if (macArch === "arm64" && /macosx_\d+_\d+_arm64/.test(t)) {
      return { ok: true, score: 80 };
    }
    if (macArch === "x86_64" && /macosx_\d+_\d+_x86_64/.test(t)) {
      return { ok: true, score: 80 };
    }
  }

  // Linux hosts (rare for allbrew, but keep a basic path)
  if (process.platform === "linux") {
    if (macArch === "arm64" && /manylinux.*_aarch64|musllinux.*_aarch64/.test(t)) {
      return { ok: true, score: 80 };
    }
    if (macArch === "x86_64" && /manylinux.*_x86_64|musllinux.*_x86_64/.test(t)) {
      return { ok: true, score: 80 };
    }
  }

  return { ok: false, score: 0 };
}

function isPurePythonWheel(filename: string): boolean {
  return /[.-]py3[^-]*-none-any\.whl$/i.test(filename);
}

/**
 * Score a wheel for the pip formula.
 *
 * Homebrew's stock `virtualenv_install_with_resources` only special-cases pure
 * `py3-none-any` wheels. Our generated install block also installs host-arch
 * platform wheels by feeding pip the `.whl` file path directly (see template),
 * so platform / abi3 wheels are valid when they match python@3.13 + host arch.
 */
function scoreWheel(url: PypiUrl, macArch: "arm64" | "x86_64" | null): number {
  if (url.yanked) return -1;
  if (url.packagetype && url.packagetype !== "bdist_wheel") return -1;
  const filename = url.filename || url.url?.split("/").pop() || "";
  const tags = parseWheelTags(filename);
  if (!tags) return -1;

  // Free-threaded builds are not the formula target.
  if (
    tags.pythonTags.some((t) => /t$/i.test(t)) ||
    tags.abiTags.some((t) => /t$/i.test(t))
  ) {
    return -1;
  }

  if (isPurePythonWheel(filename)) {
    const hasPy3 = tags.pythonTags.some((t) => {
      const r = pythonTagCompatible(t);
      return r.ok && r.pure;
    });
    if (!hasPy3) return -1;
    const exactPy3 = tags.pythonTags.some((t) => t.toLowerCase() === "py3");
    // Prefer pure wheels over platform wheels (portable formulas).
    return exactPy3 ? 300 : 290;
  }

  // Platform / abi3 wheels for python@3.13 + host arch.
  let bestPy = { ok: false, pure: false, score: 0 };
  for (const pt of tags.pythonTags) {
    const r = pythonTagCompatible(pt);
    if (r.ok && r.score >= bestPy.score) bestPy = r;
  }
  const hasAbi3 = tags.abiTags.some((t) => t.toLowerCase() === "abi3");
  if (!bestPy.ok && hasAbi3) {
    for (const pt of tags.pythonTags) {
      const m = pt.toLowerCase().match(/^cp(\d)(\d+)$/);
      if (!m) continue;
      const major = Number(m[1]);
      const minor = Number(m[2]);
      if (major === PIP_FORMULA_PYTHON.major && minor <= PIP_FORMULA_PYTHON.minor) {
        bestPy = { ok: true, pure: false, score: 85 };
        break;
      }
    }
  }
  if (!bestPy.ok) return -1;

  const abiOk = tags.abiTags.some(
    (t) =>
      abiTagCompatible(t) ||
      t.toLowerCase() === "none" ||
      (hasAbi3 && t.toLowerCase() === "abi3"),
  );
  if (!abiOk) return -1;

  let bestPlat = { ok: false, score: 0 };
  for (const plat of tags.platformTags) {
    const r = platformTagCompatible(plat, macArch);
    if (r.ok && r.score >= bestPlat.score) bestPlat = r;
  }
  if (!bestPlat.ok) return -1;

  return bestPy.score + bestPlat.score;
}

/**
 * Prefer a pure-python wheel, then a host-compatible platform wheel.
 * Fall back to sdist when no usable wheel exists.
 */
export function selectBestDistribution(
  urls: PypiUrl[],
  options: { preferWheel?: boolean; macArch?: "arm64" | "x86_64" | null } = {},
): SelectedDist | null {
  const preferWheel = options.preferWheel !== false;
  const macArch = options.macArch === undefined ? hostMacArch() : options.macArch;
  const candidates = (urls || []).filter((u) => u && !u.yanked && u.url && u.digests?.sha256);

  if (preferWheel) {
    let best: { score: number; url: PypiUrl } | null = null;
    for (const u of candidates) {
      if (u.packagetype !== "bdist_wheel" && !String(u.filename || "").endsWith(".whl")) {
        continue;
      }
      const score = scoreWheel(u, macArch);
      if (score < 0) continue;
      if (!best || score > best.score) best = { score, url: u };
    }
    if (best) {
      const selected = toSelectedDist(best.url, "wheel");
      if (selected) return selected;
    }
  }

  const sdist =
    candidates.find((u) => u.packagetype === "sdist") ||
    candidates.find((u) => /\.(tar\.gz|tgz|zip)$/i.test(u.filename || u.url || "")) ||
    null;
  if (sdist) return toSelectedDist(sdist, "sdist");

  // Last resort: first URL with digests.
  if (candidates[0]) {
    const kind =
      candidates[0].packagetype === "bdist_wheel" ||
      String(candidates[0].filename || "").endsWith(".whl")
        ? "wheel"
        : "sdist";
    return toSelectedDist(candidates[0], kind);
  }
  return null;
}

async function resolveTransitiveDeps(
  packageName: string,
  visited: Set<string>,
  maxDepth = 3,
  depth = 0,
): Promise<Array<{ name: string; url: string; sha256: string }>> {
  if (depth >= maxDepth || visited.has(packageName.toLowerCase())) return [];
  visited.add(packageName.toLowerCase());

  const resources: Array<{ name: string; url: string; sha256: string }> = [];

  try {
    const pypiData = await fetchPypiData(packageName);
    const requires = pypiData.info.requires_dist || [];

    for (const req of requires) {
      const match = req.match(/^([a-zA-Z0-9_.-]+)/);
      if (!match) continue;

      if (/extra\s*==/.test(req)) continue;

      const depName = match[1];
      if (visited.has(depName.toLowerCase())) continue;

      try {
        const depData = await fetchPypiData(depName);
        const dist = selectBestDistribution(depData.urls || []);
        if (dist) {
          resources.push({
            name: depName,
            url: dist.url,
            sha256: dist.sha256,
          });
        }

        const transitive = await resolveTransitiveDeps(
          depName,
          visited,
          maxDepth,
          depth + 1,
        );
        resources.push(...transitive);
      } catch {
        // skip deps that fail to resolve
      }
    }
  } catch {
    // skip
  }

  return resources;
}
