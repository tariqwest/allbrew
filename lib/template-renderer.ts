import type {
  CaskPayload,
  FormulaPayload,
} from "./template-payload.ts";
import { writeCask, writeFormula } from "./utils.ts";

import renderBinaryRelease from "./templates/formula/binary-release.ts";
import renderBuildFromSource from "./templates/formula/build-from-source.ts";
import renderCargoPackage from "./templates/formula/cargo-package.ts";
import renderGoPackage from "./templates/formula/go-package.ts";
import renderNpmPackage from "./templates/formula/npm-package.ts";
import renderPipPackage from "./templates/formula/pip-package.ts";
import renderRawBinary from "./templates/formula/raw-binary.ts";
import renderScriptInstall from "./templates/formula/script-install.ts";
import renderSourceArchive from "./templates/formula/source-archive.ts";
import renderSwiftSpm from "./templates/formula/swift-spm.ts";
import renderDotnetTool from "./templates/formula/dotnet-tool.ts";
import renderRubyGem from "./templates/formula/ruby-gem.ts";
import renderMint from "./templates/formula/mint.ts";

import renderCaskApp from "./templates/cask/cask-app.ts";
import renderGithubReleaseCask from "./templates/cask/github-release.ts";
import renderMasApp from "./templates/cask/mas-app.ts";

const FORMULA_TEMPLATES: Record<
  FormulaPayload["template"],
  (p: any) => string
> = {
  binary_release: renderBinaryRelease,
  build_from_source: renderBuildFromSource,
  cargo_package: renderCargoPackage,
  go_package: renderGoPackage,
  npm_package: renderNpmPackage,
  pip_package: renderPipPackage,
  raw_binary: renderRawBinary,
  script_install: renderScriptInstall,
  source_archive: renderSourceArchive,
  swift_spm: renderSwiftSpm,
  dotnet_tool: renderDotnetTool,
  ruby_gem: renderRubyGem,
  mint: renderMint,
};

const CASK_TEMPLATES: Record<CaskPayload["template"], (p: any) => string> = {
  cask_app: renderCaskApp,
  github_release: renderGithubReleaseCask,
  mas_app: renderMasApp,
};

export function renderFormula(payload: FormulaPayload): string {
  const fn = FORMULA_TEMPLATES[payload.template];
  if (!fn) {
    throw new Error(`Unknown formula template: ${payload.template}`);
  }
  return fn(payload);
}

export function renderCask(payload: CaskPayload): string {
  const fn = CASK_TEMPLATES[payload.template];
  if (!fn) {
    throw new Error(`Unknown cask template: ${payload.template}`);
  }
  return fn(payload);
}

export async function writeRenderedFormula(
  payload: FormulaPayload,
  tapPath: string,
) {
  const ruby = renderFormula(payload);
  const filePath = await writeFormula(payload.name, ruby, tapPath);
  return {
    filePath,
    name: payload.name,
    className: payload.className,
    type: "formula" as const,
  };
}

export async function writeRenderedCask(
  payload: CaskPayload,
  tapPath: string,
) {
  const ruby = renderCask(payload);
  const filePath = await writeCask(payload.name, ruby, tapPath);
  return { filePath, name: payload.name, type: "cask" as const };
}
