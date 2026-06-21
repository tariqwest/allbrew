import type {
  CaskPayload,
  FormulaPayload,
} from "./template-payload.ts";
import { writeCask, writeFormula } from "./utils.ts";

import renderBinaryRelease from "./templates/formula/binary-release.ts";
import renderSourceBuild from "./templates/formula/source-build.ts";
import renderCargoPackage from "./templates/formula/cargo-package.ts";
import renderGoPackage from "./templates/formula/go-package.ts";
import renderNpmPackage from "./templates/formula/npm-package.ts";
import renderPipPackage from "./templates/formula/pip-package.ts";
import renderBinaryDirect from "./templates/formula/binary-direct.ts";
import renderInstallScript from "./templates/formula/install-script.ts";
import renderArchiveBuild from "./templates/formula/archive-build.ts";
import renderSpmPackage from "./templates/formula/spm-package.ts";
import renderDotnetPackage from "./templates/formula/dotnet-package.ts";
import renderGemPackage from "./templates/formula/gem-package.ts";
import renderMintPackage from "./templates/formula/mint-package.ts";

import renderCaskApp from "./templates/cask/cask-app.ts";
import renderCaskAppRelease from "./templates/cask/cask-app-release.ts";
import renderCaskAppMas from "./templates/cask/cask-app-mas.ts";

const FORMULA_TEMPLATES: Record<
  FormulaPayload["template"],
  (p: any) => string
> = {
  binary_release: renderBinaryRelease,
  source_build: renderSourceBuild,
  cargo_package: renderCargoPackage,
  go_package: renderGoPackage,
  npm_package: renderNpmPackage,
  pip_package: renderPipPackage,
  binary_direct: renderBinaryDirect,
  install_script: renderInstallScript,
  archive_build: renderArchiveBuild,
  spm_package: renderSpmPackage,
  dotnet_package: renderDotnetPackage,
  gem_package: renderGemPackage,
  mint_package: renderMintPackage,
};

const CASK_TEMPLATES: Record<CaskPayload["template"], (p: any) => string> = {
  cask_app: renderCaskApp,
  cask_app_release: renderCaskAppRelease,
  cask_app_mas: renderCaskAppMas,
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
