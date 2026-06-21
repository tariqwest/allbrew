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

export type BuildFromSourcePayload = FormulaCommonFields & {
  template: "build_from_source";
  fullName: string;
  defaultBranch: string;
  licenseLine: string;
  urlLines: string;
  dependenciesLines: string;
  installBody: string;
  livecheckBlock: string;
};

export type BinaryReleasePayload = FormulaCommonFields & {
  template: "binary_release";
  version: string;
  binName: string;
  licenseLine: string;
  platformBlocks: string;
};

export type ScriptInstallPayload = FormulaCommonFields & {
  template: "script_install";
  url: string;
  sha256: string;
  scriptFilename: string;
  livecheckBlock: string;
};

export type SourceArchivePayload = FormulaCommonFields & {
  template: "source_archive";
  url: string;
  sha256: string;
  dependenciesLines: string;
  installBody: string;
  livecheckBlock: string;
};

export type RawBinaryPayload = FormulaCommonFields & {
  template: "raw_binary";
  url: string;
  sha256: string;
  installBody: string;
  livecheckBlock: string;
};

export type GithubReleaseCaskPayload = {
  template: "github_release";
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

export type MasAppPayload = {
  template: "mas_app";
  name: string;
  appId: string;
  appName: string;
  version: string;
  desc: string;
  homepage: string;
  zapBlock: string;
  livecheckBlock: string;
};

export type SwiftSpmPayload = FormulaCommonFields & {
  template: "swift_spm";
  fullName: string;
  defaultBranch: string;
  licenseLine: string;
  urlLines: string;
  binInstallPaths: string;
  livecheckBlock: string;
};

export type DotnetToolPayload = FormulaCommonFields & {
  template: "dotnet_tool";
  packageName: string;
  version: string;
  licenseLine: string;
  urlLines: string;
  livecheckBlock: string;
};

export type RubyGemPayload = FormulaCommonFields & {
  template: "ruby_gem";
  gemName: string;
  version: string;
  licenseLine: string;
  urlLines: string;
  livecheckBlock: string;
};

export type SwiftMintPayload = FormulaCommonFields & {
  template: "swift_mint";
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
  | BuildFromSourcePayload
  | BinaryReleasePayload
  | ScriptInstallPayload
  | SourceArchivePayload
  | RawBinaryPayload
  | SwiftSpmPayload
  | DotnetToolPayload
  | RubyGemPayload
  | SwiftMintPayload;

export type CaskPayload =
  | GithubReleaseCaskPayload
  | CaskAppPayload
  | MasAppPayload;
