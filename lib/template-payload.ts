/**
 * Payloads consumed by the template renderer.
 *
 * Every field is the exact Ruby fragment that should appear in the rendered
 * output. Template modules under `lib/templates/` only do interpolation; all
 * escaping, conditional blocks, and stanza shaping happen in TypeScript inside
 * each generator's `collect*Payload()` function.
 *
 * Optional sections (license, livecheck, service, etc.) are pre-rendered to a
 * complete multi-line string with appropriate trailing whitespace, or to an
 * empty string when omitted.
 */

export type FormulaCommonFields = {
  name: string;
  className: string;
  desc: string;
  homepage: string;
  allbrewDependency: string;
  testBinName: string;
  serviceBlock: string;
};

export type NpmPackagePayload = FormulaCommonFields & {
  template: "npm_package";
  url: string;
  sha256: string;
  licenseLine: string;
  livecheckBlock: string;
};

export type PipPackagePayload = FormulaCommonFields & {
  template: "pip_package";
  url: string;
  sha256: string;
  licenseLine: string;
  livecheckBlock: string;
  resourcesBlock: string;
};

export type CargoPackagePayload = FormulaCommonFields & {
  template: "cargo_package";
  fullName: string;
  defaultBranch: string;
  licenseLine: string;
  urlLines: string;
  livecheckBlock: string;
};

export type GoPackagePayload = FormulaCommonFields & {
  template: "go_package";
  fullName: string;
  defaultBranch: string;
  licenseLine: string;
  urlLines: string;
  livecheckBlock: string;
};

export type SourceBuildPayload = FormulaCommonFields & {
  template: "source_build";
  fullName: string;
  defaultBranch: string;
  licenseLine: string;
  urlLines: string;
  dependenciesLines: string;
  installBody: string;
  livecheckBlock: string;
  isPython?: boolean;
};

export type BinaryReleasePayload = FormulaCommonFields & {
  template: "binary_release";
  version: string;
  binName: string;
  licenseLine: string;
  platformBlocks: string;
};

export type SetappCliPayload = Omit<BinaryReleasePayload, "template"> & {
  template: "setapp_cli";
};

export type InstallScriptPayload = FormulaCommonFields & {
  template: "install_script";
  url: string;
  sha256: string;
  scriptFilename: string;
  livecheckBlock: string;
};

export type ArchiveBuildPayload = FormulaCommonFields & {
  template: "archive_build";
  url: string;
  sha256: string;
  dependenciesLines: string;
  installBody: string;
  livecheckBlock: string;
};

export type BinaryDirectPayload = FormulaCommonFields & {
  template: "binary_direct";
  url: string;
  sha256: string;
  installBody: string;
  livecheckBlock: string;
};

export type CaskAppReleasePayload = {
  template: "cask_app_release";
  name: string;
  version: string;
  sha256: string;
  url: string;
  displayName: string;
  appName: string;
  desc: string;
  homepage: string;
  zapBlock: string;
};

export type CaskAppPayload = {
  template: "cask_app";
  name: string;
  sha256: string;
  url: string;
  displayName: string;
  desc: string;
  versionLine: string;
  homepageLine: string;
  appOrPkgBlock: string;
  livecheckBlock: string;
};

export type CaskAppMasPayload = {
  template: "cask_app_mas";
  name: string;
  appId: string;
  appName: string;
  version: string;
  desc: string;
  homepage: string;
  zapBlock: string;
  livecheckBlock: string;
};

export type CaskAppSetappPayload = {
  template: "cask_app_setapp";
  name: string;
  slug: string;
  appName: string;
  version: string;
  desc: string;
  homepage: string;
  zapBlock: string;
  livecheckBlock: string;
};

export type SpmPackagePayload = FormulaCommonFields & {
  template: "spm_package";
  fullName: string;
  defaultBranch: string;
  licenseLine: string;
  urlLines: string;
  binInstallPaths: string;
  livecheckBlock: string;
};

export type DotnetPackagePayload = FormulaCommonFields & {
  template: "dotnet_package";
  packageName: string;
  version: string;
  licenseLine: string;
  urlLines: string;
  livecheckBlock: string;
};

export type GemPackagePayload = FormulaCommonFields & {
  template: "gem_package";
  gemName: string;
  version: string;
  licenseLine: string;
  urlLines: string;
  livecheckBlock: string;
};

export type MintPackagePayload = FormulaCommonFields & {
  template: "mint_package";
  fullName: string;
  defaultBranch: string;
  licenseLine: string;
  urlLines: string;
  binName: string;
  livecheckBlock: string;
};

export type FormulaPayload =
  | NpmPackagePayload
  | PipPackagePayload
  | CargoPackagePayload
  | GoPackagePayload
  | SourceBuildPayload
  | BinaryReleasePayload
  | SetappCliPayload
  | InstallScriptPayload
  | ArchiveBuildPayload
  | BinaryDirectPayload
  | SpmPackagePayload
  | DotnetPackagePayload
  | GemPackagePayload
  | MintPackagePayload;

export type CaskPayload =
  | CaskAppReleasePayload
  | CaskAppPayload
  | CaskAppMasPayload
  | CaskAppSetappPayload;
