import type { CargoPackagePayload } from "../../template-payload.ts";

export default function renderCargoPackage(p: CargoPackagePayload): string {
  // Unlock = strip "--locked" from std_cargo_args (no locked: kwarg in Homebrew).
  const unlocked =
    p.cargoInstallArgsUnlocked ||
    `${p.cargoInstallArgs}.reject { |arg| arg == "--locked" }`;
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}  head "https://github.com/${p.fullName}.git", branch: "${p.defaultBranch}"

${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}  depends_on "rust" => :build

  def install
    # Prefer --locked (std_cargo_args) so builds match Cargo.lock; if the lockfile
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
