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
  allbrewDependency?: string;
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
  /** Full body line(s) inside `test do` (pre-indented). */
  testDoBody: string;
  /** Homebrew python formula minor tag, e.g. "3.12" for depends_on "python@3.12". */
  pythonFormula?: string;
  /** virtualenv_create interpreter name, e.g. "python3.12". */
  pythonBin?: string;
  /** Extra depends_on lines (portaudio, etc.), each ending with newline. */
  extraDependsBlock?: string;
};

export type CargoPackagePayload = FormulaCommonFields & {
  template: "cargo_package";
  fullName: string;
  defaultBranch: string;
  licenseLine: string;
  urlLines: string;
  livecheckBlock: string;
  /** Pre-rendered `*std_cargo_args` or `*std_cargo_args(path: "…")` fragment. */
  cargoInstallArgs: string;
  /**
   * Same as cargoInstallArgs but with `locked: false` for the lockfile-mismatch
   * rescue path (gobang / oatmeal / rainfrog class of failures).
   */
  cargoInstallArgsUnlocked: string;
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
  /** Full body of `def install` (e.g. bin.install or bare-binary rename). */
  installBody: string;
  licenseLine: string;
  platformBlocks: string;
  livecheckBlock: string;
};

export type SetappCliPayload = Omit<BinaryReleasePayload, "template"> & {
  template: "setapp_cli";
};

export type InstallScriptPayload = FormulaCommonFields & {
  template: "install_script";
  version: string;
  url: string;
  licenseLine: string;
  sha256: string;
  scriptFilename: string;
  livecheckBlock: string;
  /** Extra ENV lines inside `def install` (pre-indented, trailing newline or empty). */
  installEnvLines: string;
  /** Ruby fragment after `cached_download.to_s` for script args, e.g. `, "--yes"`. */
  installArgsRuby: string;
  /** Whether to `mkdir -p` BIN_DIR before running the script. */
  ensureBinDir: boolean;
  /** Shell for `system "…", cached_download` (`sh` for POSIX-only scripts like starship). */
  scriptShell?: "sh" | "bash";
  /** When true, vendor the script to buildpath and rewrite hardcoded install paths / sudo. */
  installScriptRewrite?: boolean;
};

export type ArchiveBuildPayload = FormulaCommonFields & {
  template: "archive_build";
  url: string;
  licenseLine: string;
  sha256: string;
  dependenciesLines: string;
  installBody: string;
  livecheckBlock: string;
};

export type BinaryDirectPayload = FormulaCommonFields & {
  template: "binary_direct";
  url: string;
  licenseLine: string;
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
  /** Pre-rendered stanza including trailing newline, or empty string. */
  containerBlock: string;
  livecheckBlock: string;
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
  /** Pre-rendered `zap trash:` block or empty string. */
  zapBlock: string;
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
  /** Pre-indented `bin.write_exec_script libexec/"…"` lines (one per binary). */
  binWriteExecScripts: string;
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
  /** Extra `depends_on` lines (build tools / native libs), each with trailing newline. */
  dependsOnLines: string;
  /** Full `test do` body lines (pre-indented), default bin --version. */
  testDoBody: string;
  /**
   * Pre-rendered install-method lines that symlink the gem executable to the
   * hyphenated formula token when they differ (e.g. license_finder → license-finder).
   * Empty string when primary bin already matches the formula name.
   */
  binAliasBlock: string;
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
