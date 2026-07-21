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

export async function collectPipPackagePayload(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
): Promise<PipPackagePayload> {
  const pypiData = await fetchPypiData(packageName);
  const sdist =
    pypiData.urls.find((u: any) => u.packagetype === "sdist") ||
    pypiData.urls[0];

  if (!sdist)
    throw new Error(`No source distribution found for ${packageName} on PyPI`);

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
    url: rubyEscape(sdist.url),
    sha256: rubyEscape(sdist.digests.sha256),
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
        const sdist =
          depData.urls.find((u: any) => u.packagetype === "sdist") ||
          depData.urls[0];
        if (sdist) {
          resources.push({
            name: depName,
            url: sdist.url,
            sha256: sdist.digests.sha256,
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
