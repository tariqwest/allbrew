#!/usr/bin/env bun

import { FIXTURE_APPS, type FixtureApp } from "./apps.ts";
import * as artifacts from "./artifacts.ts";
import { writeFile } from "node:fs/promises";

const PORT = parseInt(process.env.FIXTURE_PORT || "0", 10);
let actualPort = PORT;

const runtimeVersions: Record<string, string> = {};
for (const [key, app] of Object.entries(FIXTURE_APPS)) {
  runtimeVersions[key] = app.version;
}

function getApp(appKey: string): FixtureApp & { version: string } {
  const app = FIXTURE_APPS[appKey];
  if (!app) throw new Error(`Unknown fixture app: ${appKey}`);
  return { ...app, version: runtimeVersions[appKey] || app.version };
}

type ArtifactCache = Map<string, { buffer: Buffer; sha256: string; filename: string }>;
const artifactCache: ArtifactCache = new Map();

function artifactKey(appKey: string, version: string, suffix?: string): string {
  return suffix ? `${appKey}:${version}:${suffix}` : `${appKey}:${version}`;
}

async function buildArtifact(
  app: FixtureApp & { version: string },
  arch?: string,
): Promise<{ buffer: Buffer; sha256: string; filename: string }> {
  const appKey = Object.entries(FIXTURE_APPS).find(
    ([, a]) => a.name === app.name,
  )?.[0];
  if (!appKey) throw new Error(`No key for app ${app.name}`);

  switch (app.artifactKind) {
    case "binary-tarball": {
      if (arch) {
        const suffix = app.archAssets?.[arch] || arch;
        return artifacts.buildBinaryTarball(app.name, app.version, suffix);
      }
      if (app.archAssets) {
        const firstArch = Object.keys(app.archAssets)[0];
        const suffix = app.archAssets[firstArch];
        return artifacts.buildBinaryTarball(app.name, app.version, suffix);
      }
      return artifacts.buildBinaryTarball(app.name, app.version, "darwin-arm64");
    }
    case "service-binary-tarball": {
      if (arch) {
        const suffix = app.archAssets?.[arch] || arch;
        return artifacts.buildServiceBinaryTarball(app.name, app.version, suffix);
      }
      if (app.archAssets) {
        const firstArch = Object.keys(app.archAssets)[0];
        const suffix = app.archAssets[firstArch];
        return artifacts.buildServiceBinaryTarball(app.name, app.version, suffix);
      }
      return artifacts.buildServiceBinaryTarball(app.name, app.version, "darwin-arm64");
    }
    case "source-tarball":
      return artifacts.buildSourceTarball(app.name, app.version, app.buildSystem || "make");
    case "install-script":
      return artifacts.buildInstallScript(app.name, app.version);
    case "npm-tarball":
      return artifacts.buildNpmTarball(app.packageName!, app.version);
    case "pip-sdist":
      return artifacts.buildPipSdist(app.packageName!, app.version);
    case "crate-tarball":
      return artifacts.buildCrateTarball(app.crateName!, app.version);
    case "go-module-zip":
      return artifacts.buildGoModuleZip(app.goModule!, app.version);
    case "gem-file":
      return artifacts.buildGemFile(app.gemName!, app.version);
    case "nupkg":
      return artifacts.buildNupkg(app.packageName!, app.version);
    case "dmg":
      return artifacts.buildDmg(app.appName || app.name, app.version);
    case "zip-app":
      return artifacts.buildZipApp(app.appName || app.name, app.version);
    case "generic-archive":
      return artifacts.buildGenericArchive(app.name, app.version, "tar.gz");
    default:
      throw new Error(`Unknown artifact kind: ${app.artifactKind}`);
  }
}

async function getArtifact(
  appKey: string,
  arch?: string,
): Promise<{ buffer: Buffer; sha256: string; filename: string }> {
  const app = getApp(appKey);
  const key = artifactKey(appKey, app.version, arch);
  const cached = artifactCache.get(key);
  if (cached) return cached;
  const result = await buildArtifact(app, arch);
  artifactCache.set(key, result);
  return result;
}

function findAppByOwnerRepo(owner: string, repo: string): string | null {
  for (const [key, app] of Object.entries(FIXTURE_APPS)) {
    if (app.github?.owner === owner && app.github?.repo === repo) return key;
  }
  return null;
}

function findAppByPackageName(pkgName: string): string | null {
  for (const [key, app] of Object.entries(FIXTURE_APPS)) {
    if (app.packageName === pkgName) return key;
  }
  return null;
}

function findAppByGemName(gemName: string): string | null {
  for (const [key, app] of Object.entries(FIXTURE_APPS)) {
    if (app.gemName === gemName) return key;
  }
  return null;
}

function findAppByCrateName(crateName: string): string | null {
  for (const [key, app] of Object.entries(FIXTURE_APPS)) {
    if (app.crateName === crateName) return key;
  }
  return null;
}

function findAppByGoModule(modPath: string): string | null {
  for (const [key, app] of Object.entries(FIXTURE_APPS)) {
    if (app.goModule === modPath) return key;
  }
  return null;
}

function findAppByName(name: string): string | null {
  for (const [key, app] of Object.entries(FIXTURE_APPS)) {
    if (app.name === name) return key;
  }
  return null;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function binaryResponse(buffer: Buffer, contentType: string, filename?: string): Response {
  const headers: Record<string, string> = { "Content-Type": contentType };
  if (filename) headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  return new Response(buffer, { headers });
}

async function handleRequest(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  if (method === "GET" && path === "/health") {
    return jsonResponse({ status: "ok" });
  }

  // Mutation endpoint: PUT /mutate/:appKey/:newVersion
  const mutateMatch = path.match(/^\/mutate\/([^/]+)\/([^/]+)$/);
  if (mutateMatch && method === "PUT") {
    const [, appKey, newVersion] = mutateMatch;
    if (!FIXTURE_APPS[appKey]) return jsonResponse({ error: "Unknown app" }, 404);
    runtimeVersions[appKey] = newVersion;
    return jsonResponse({ ok: true, appKey, version: newVersion });
  }

  // Reset endpoint: PUT /reset
  if (path === "/reset" && method === "PUT") {
    for (const [key, app] of Object.entries(FIXTURE_APPS)) {
      runtimeVersions[key] = app.version;
    }
    artifactCache.clear();
    return jsonResponse({ ok: true });
  }

  const baseUrl = `http://localhost:${actualPort}`;

  // GitHub API: /api/repos/:owner/:repo
  const repoMatch = path.match(/^\/api\/repos\/([^/]+)\/([^/]+)$/);
  if (repoMatch && method === "GET") {
    const [, owner, repo] = repoMatch;
    const appKey = findAppByOwnerRepo(owner, repo);
    if (!appKey) return jsonResponse({ message: "Not Found" }, 404);
    const app = getApp(appKey);
    return jsonResponse({
      name: app.github!.repo,
      full_name: `${owner}/${repo}`,
      description: app.github!.description,
      html_url: `https://github.com/${owner}/${repo}`,
      homepage: `https://github.com/${owner}/${repo}`,
      license: { spdx_id: app.github!.license },
      default_branch: "main",
      topics: [],
      language: null,
    });
  }

  // GitHub API: /api/repos/:owner/:repo/releases/latest
  const releaseMatch = path.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/releases\/latest$/);
  if (releaseMatch && method === "GET") {
    const [, owner, repo] = releaseMatch;
    const appKey = findAppByOwnerRepo(owner, repo);
    if (!appKey) return jsonResponse({ message: "Not Found" }, 404);
    const app = getApp(appKey);
    const tag = `v${app.version}`;

    const assets: any[] = [];
    if (
      (app.artifactKind === "binary-tarball" ||
        app.artifactKind === "service-binary-tarball") &&
      app.archAssets
    ) {
      for (const [, suffix] of Object.entries(app.archAssets)) {
        const filename = `${app.name}-${app.version}-${suffix}.tar.gz`;
        assets.push({
          name: filename,
          browser_download_url: `${baseUrl}/assets/${owner}/${repo}/${filename}`,
          size: 0,
          content_type: "application/gzip",
        });
      }
    } else if (app.artifactKind === "dmg") {
      const filename = `${app.appName || app.name}-${app.version}.dmg`;
      assets.push({
        name: filename,
        browser_download_url: `${baseUrl}/assets/${owner}/${repo}/${filename}`,
        size: 0,
        content_type: "application/octet-stream",
      });
    }

    const tarballUrl = `${baseUrl}/tarballs/${owner}/${repo}/${tag}.tar.gz`;

    return jsonResponse({
      tag_name: tag,
      name: tag,
      body: `Release ${app.version}`,
      assets,
      tarball_url: tarballUrl,
      zipball_url: tarballUrl.replace(".tar.gz", ".zip"),
    });
  }

  // GitHub release asset: /assets/:owner/:repo/:filename
  const assetMatch = path.match(/^\/assets\/([^/]+)\/([^/]+)\/(.+)$/);
  if (assetMatch && method === "GET") {
    const [, owner, repo, filename] = assetMatch;
    const appKey = findAppByOwnerRepo(owner, repo);
    if (!appKey) return jsonResponse({ message: "Not Found" }, 404);
    const app = getApp(appKey);

    if (
      (app.artifactKind === "binary-tarball" ||
        app.artifactKind === "service-binary-tarball") &&
      app.archAssets
    ) {
      for (const [arch, suffix] of Object.entries(app.archAssets)) {
        const expected = `${app.name}-${app.version}-${suffix}.tar.gz`;
        if (filename === expected) {
          const r = await getArtifact(appKey, arch);
          return binaryResponse(r.buffer, "application/gzip", r.filename);
        }
      }
    } else if (app.artifactKind === "dmg") {
      const expected = `${app.appName || app.name}-${app.version}.dmg`;
      if (filename === expected) {
        const r = await getArtifact(appKey);
        return binaryResponse(r.buffer, "application/octet-stream", r.filename);
      }
    }
    return jsonResponse({ message: "Not Found" }, 404);
  }

  // GitHub tarball: /tarballs/:owner/:repo/:tag.tar.gz
  const tarballMatch = path.match(/^\/tarballs\/([^/]+)\/([^/]+)\/(.+\.tar\.gz)$/);
  if (tarballMatch && method === "GET") {
    const [, owner, repo] = tarballMatch;
    const appKey = findAppByOwnerRepo(owner, repo);
    if (!appKey) return jsonResponse({ message: "Not Found" }, 404);
    const app = getApp(appKey);
    if (app.artifactKind === "source-tarball" || app.artifactKind === "crate-tarball") {
      const r = await getArtifact(appKey);
      return binaryResponse(r.buffer, "application/gzip", r.filename);
    }
    const r = await getArtifact(appKey);
    return binaryResponse(r.buffer, "application/gzip", r.filename);
  }

  // npm registry: /npm/:pkg (packument)
  const npmPackumentMatch = path.match(/^\/npm\/([^/]+)$/);
  if (npmPackumentMatch && method === "GET") {
    const pkgName = decodeURIComponent(npmPackumentMatch[1]);
    const appKey = findAppByPackageName(pkgName);
    if (!appKey) return jsonResponse({ error: "Not found" }, 404);
    const app = getApp(appKey);
    const tarballUrl = `${baseUrl}/npm/${pkgName}/-/${pkgName}-${app.version}.tgz`;
    return jsonResponse({
      "dist-tags": { latest: app.version },
      versions: {
        [app.version]: {
          version: app.version,
          description: `Fake npm package ${pkgName}`,
          license: "MIT",
          dist: { tarball: tarballUrl },
        },
      },
    });
  }

  // npm tarball: /npm/:pkg/-/:filename
  const npmTarballMatch = path.match(/^\/npm\/(.+)\/-\/(.+\.tgz)$/);
  if (npmTarballMatch && method === "GET") {
    const pkgName = decodeURIComponent(npmTarballMatch[1]);
    const appKey = findAppByPackageName(pkgName);
    if (!appKey) return jsonResponse({ error: "Not found" }, 404);
    const r = await getArtifact(appKey);
    return binaryResponse(r.buffer, "application/octet-stream", r.filename);
  }

  // npm latest: /npm/:pkg/latest  (for livecheck)
  const npmLatestMatch = path.match(/^\/npm\/([^/]+)\/latest$/);
  if (npmLatestMatch && method === "GET") {
    const pkgName = decodeURIComponent(npmLatestMatch[1]);
    const appKey = findAppByPackageName(pkgName);
    if (!appKey) return jsonResponse({ error: "Not found" }, 404);
    const app = getApp(appKey);
    return jsonResponse({ version: app.version });
  }

  // PyPI: /pypi/:pkg/json
  const pypiMatch = path.match(/^\/pypi\/([^/]+)\/json$/);
  if (pypiMatch && method === "GET") {
    const pkgName = decodeURIComponent(pypiMatch[1]);
    const appKey = findAppByPackageName(pkgName);
    if (!appKey) return jsonResponse({ message: "Not Found" }, 404);
    const app = getApp(appKey);
    const sdistUrl = `${baseUrl}/pypi/packages/${pkgName}/${app.version}/${pkgName}-${app.version}.tar.gz`;
    const r = await getArtifact(appKey);
    return jsonResponse({
      info: {
        version: app.version,
        summary: `Fake pip package ${pkgName}`,
        home_page: `https://example.com/${pkgName}`,
        project_url: `https://example.com/${pkgName}`,
        license: "MIT",
        requires_dist: [],
      },
      urls: [
        { packagetype: "sdist", url: sdistUrl, digests: { sha256: r.sha256 } },
      ],
    });
  }

  // PyPI sdist: /pypi/packages/:pkg/:version/:filename
  const pypiPkgMatch = path.match(/^\/pypi\/packages\/([^/]+)\/([^/]+)\/(.+)$/);
  if (pypiPkgMatch && method === "GET") {
    const pkgName = decodeURIComponent(pypiPkgMatch[1]);
    const appKey = findAppByPackageName(pkgName);
    if (!appKey) return jsonResponse({ message: "Not Found" }, 404);
    const r = await getArtifact(appKey);
    return binaryResponse(r.buffer, "application/octet-stream", r.filename);
  }

  // crates.io: /crates/api/v1/crates/:crate
  const cratesMatch = path.match(/^\/crates\/api\/v1\/crates\/([^/]+)$/);
  if (cratesMatch && method === "GET") {
    const crateName = decodeURIComponent(cratesMatch[1]);
    const appKey = findAppByCrateName(crateName);
    if (!appKey) return jsonResponse({ message: "Not Found" }, 404);
    const app = getApp(appKey);
    return jsonResponse({
      crate: { name: crateName, max_stable_version: app.version, newest_version: app.version },
      max_stable_version: app.version,
      newest_version: app.version,
    });
  }

  // Go proxy: /go/:mod/@latest
  const goLatestMatch = path.match(/^\/go\/(.+)\/@latest$/);
  if (goLatestMatch && method === "GET") {
    const modPath = decodeURIComponent(goLatestMatch[1]);
    const appKey = findAppByGoModule(modPath);
    if (!appKey) return jsonResponse({ message: "Not Found" }, 404);
    const app = getApp(appKey);
    return jsonResponse({ Version: `v${app.version}` });
  }

  // Go proxy: /go/:mod/@v/:version.zip
  const goZipMatch = path.match(/^\/go\/(.+)\/@v\/(.+\.zip)$/);
  if (goZipMatch && method === "GET") {
    const modPath = decodeURIComponent(goZipMatch[1]);
    const appKey = findAppByGoModule(modPath);
    if (!appKey) return jsonResponse({ message: "Not Found" }, 404);
    const r = await getArtifact(appKey);
    return binaryResponse(r.buffer, "application/zip", r.filename);
  }

  // RubyGems: /gems/api/v1/gems/:gem.json
  const gemMatch = path.match(/^\/gems\/api\/v1\/gems\/([^/]+)\.json$/);
  if (gemMatch && method === "GET") {
    const gemName = decodeURIComponent(gemMatch[1]);
    const appKey = findAppByGemName(gemName);
    if (!appKey) return jsonResponse({ message: "Not Found" }, 404);
    const app = getApp(appKey);
    const gemUri = `${baseUrl}/gems/gems/${gemName}-${app.version}.gem`;
    return jsonResponse({
      version: app.version,
      gem_uri: gemUri,
      info: `Fake gem ${gemName}`,
      homepage_uri: `https://example.com/${gemName}`,
      licenses: ["MIT"],
    });
  }

  // RubyGems download: /gems/gems/:filename
  const gemDlMatch = path.match(/^\/gems\/gems\/(.+\.gem)$/);
  if (gemDlMatch && method === "GET") {
    const filename = gemDlMatch[1];
    const gemName = filename.replace(/-\d+[^-]*\.gem$/, "");
    const appKey = findAppByGemName(gemName);
    if (!appKey) return jsonResponse({ message: "Not Found" }, 404);
    const r = await getArtifact(appKey);
    return binaryResponse(r.buffer, "application/octet-stream", r.filename);
  }

  // NuGet index: /nuget/v3-flatcontainer/:pkg/index.json
  const nugetIndexMatch = path.match(/^\/nuget\/v3-flatcontainer\/([^/]+)\/index\.json$/);
  if (nugetIndexMatch && method === "GET") {
    const pkgName = decodeURIComponent(nugetIndexMatch[1]);
    const appKey = findAppByPackageName(pkgName);
    if (!appKey) return jsonResponse({ message: "Not Found" }, 404);
    const app = getApp(appKey);
    return jsonResponse({ versions: [app.version] });
  }

  // NuGet package: /nuget/api/v2/package/:pkg/:version
  const nugetPkgMatch = path.match(/^\/nuget\/api\/v2\/package\/([^/]+)\/([^/]+)$/);
  if (nugetPkgMatch && method === "GET") {
    const pkgName = decodeURIComponent(nugetPkgMatch[1]);
    const appKey = findAppByPackageName(pkgName);
    if (!appKey) return jsonResponse({ message: "Not Found" }, 404);
    const r = await getArtifact(appKey);
    return binaryResponse(r.buffer, "application/zip", r.filename);
  }

  // Direct download: /direct/:name/:version/:filename
  const directMatch = path.match(/^\/direct\/([^/]+)\/([^/]+)\/(.+)$/);
  if (directMatch && (method === "GET" || method === "HEAD")) {
    const appName = decodeURIComponent(directMatch[1]);
    const appKey = findAppByName(appName);
    if (!appKey) return jsonResponse({ message: "Not Found" }, 404);
    const app = getApp(appKey);
    const filename = directMatch[3];

    const r = await getArtifact(appKey);
    const contentType = filename.endsWith(".zip")
      ? "application/zip"
      : filename.endsWith(".dmg")
      ? "application/octet-stream"
      : filename.endsWith(".sh")
      ? "text/x-shellscript"
      : "application/gzip";
    const disposition = `attachment; filename="${r.filename}"`;
    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": disposition,
          "Content-Length": String(r.buffer.length),
        },
      });
    }
    return binaryResponse(r.buffer, contentType, r.filename);
  }

  return jsonResponse({ message: "Not Found", path }, 404);
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255,
  fetch: async (req) => {
    const url = new URL(req.url);
    try {
      return await handleRequest(req, url);
    } catch (err) {
      console.error(`[fixture-server] Error handling ${req.method} ${url.pathname}:`, err);
      return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  },
});

actualPort = server.port;

console.log(`[fixture-server] Listening on http://localhost:${server.port}`);

const portFile = process.env.ALLBREW_FIXTURE_PORT_FILE;
if (portFile) {
  await writeFile(portFile, String(server.port));
}

process.on("SIGINT", () => server.stop());
process.on("SIGTERM", () => server.stop());
