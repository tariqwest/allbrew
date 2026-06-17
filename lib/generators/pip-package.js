import {
  toFormulaName,
  toClassName,
  rubyString,
  guessLicenseIdentifier,
  writeFormula,
} from "../utils.js";
import { buildServiceBlock, serviceFromOptions } from "./service.js";

export async function generatePipPackage(
  packageName,
  repoInfo = null,
  options = {},
) {
  const pypiData = await fetchPypiData(packageName);
  const latestVersion = pypiData.info.version;
  const sdist =
    pypiData.urls.find((u) => u.packagetype === "sdist") || pypiData.urls[0];

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

  let ruby = `class ${className} < Formula\n`;
  ruby += `  include Language::Python::Virtualenv\n\n`;
  ruby += `  desc ${rubyString(desc)}\n`;
  ruby += `  homepage ${rubyString(homepage)}\n`;
  ruby += `  url ${rubyString(sdist.url)}\n`;
  ruby += `  sha256 ${rubyString(sdist.digests.sha256)}\n`;
  if (license) ruby += `  license ${rubyString(license)}\n`;
  ruby += `\n`;
  ruby += `  depends_on "python@3.13"\n\n`;

  for (const dep of deps) {
    ruby += `  resource ${rubyString(dep.name)} do\n`;
    ruby += `    url ${rubyString(dep.url)}\n`;
    ruby += `    sha256 ${rubyString(dep.sha256)}\n`;
    ruby += `  end\n\n`;
  }

  ruby += `  def install\n`;
  ruby += `    virtualenv_install_with_resources\n`;
  ruby += `  end\n\n`;

  ruby += buildServiceBlock(serviceFromOptions(options, name), name);

  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${name} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  const filePath = await writeFormula(name, ruby, options.tapPath);
  return { filePath, name, className, type: "formula" };
}

async function fetchPypiData(packageName) {
  const response = await fetch(
    `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`,
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
  packageName,
  visited,
  maxDepth = 3,
  depth = 0,
) {
  if (depth >= maxDepth || visited.has(packageName.toLowerCase())) return [];
  visited.add(packageName.toLowerCase());

  const resources = [];

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
          depData.urls.find((u) => u.packagetype === "sdist") ||
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
