import type { CargoPackagePayload } from "../../template-payload.ts";

export default function renderCargoPackage(p: CargoPackagePayload): string {
  // Homebrew's std_cargo_args may not accept locked: false on all versions;
  // strip --locked from the argv list on the rescue path (gobang/oatmeal class).
  const unlocked =
    p.cargoInstallArgsUnlocked ||
    `${p.cargoInstallArgs}.reject { |arg| arg == "--locked" }`;
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}  head "https://github.com/${p.fullName}.git", branch: "${p.defaultBranch}"

${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}  # Rust toolchain is provided by the pre-installed rustup on allbrew test VMs,
  # not by the Homebrew rust formula, to avoid heavy rebuilds in small guests.

  def install
    ENV.prepend_path "PATH", Dir.home + "/.cargo/bin"
    ENV["CC"] = "/usr/bin/clang"
    ENV["CXX"] = "/usr/bin/clang++"

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
