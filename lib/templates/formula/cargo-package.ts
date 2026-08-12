import type { CargoPackagePayload } from "../../template-payload.ts";

export default function renderCargoPackage(p: CargoPackagePayload): string {
  const unlocked =
    p.cargoInstallArgsUnlocked ||
    (p.cargoInstallArgs.includes("path:")
      ? p.cargoInstallArgs.replace(
          "*std_cargo_args(",
          "*std_cargo_args(locked: false, ",
        )
      : "*std_cargo_args(locked: false)");
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}  head "https://github.com/${p.fullName}.git", branch: "${p.defaultBranch}"

${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}  depends_on "rust" => :build

  def install
${p.installPreamble}    # Prefer --locked (std_cargo_args) so builds match Cargo.lock; if the lockfile
    # is out of date relative to Cargo.toml (common on crates.io snapshots),
    # retry without --locked so install can still succeed.
    system "cargo", "install", ${p.cargoInstallArgs}
  rescue
    ohai "cargo install --locked failed; retrying without --locked"
    system "cargo", "install", ${unlocked}
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
