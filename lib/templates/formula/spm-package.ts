import type { SpmPackagePayload } from "../../template-payload.ts";

export default function renderSpmPackage(p: SpmPackagePayload): string {
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}  head "https://github.com/${p.fullName}.git", branch: "${p.defaultBranch}"

${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}  depends_on "swift" => :build

  def install
    system "swift", "build", "--disable-sandbox", "-c", "release"
    # Install binaries + any SPM resource bundles into libexec so Bundle.module
    # resolution finds co-located *.bundle (e.g. TUIkit_TUIkit.bundle) next to
    # the real executable. Then expose CLI entrypoints via thin wrappers in bin/.
    libexec.install ${p.binInstallPaths}
    Dir.glob(".build/release/*.bundle").each { |b| libexec.install b }
${p.binWriteExecScripts}  end

${p.serviceBlock}  test do
    assert_path_exists bin/"${p.testBinName}"
  end
end
`;
}
