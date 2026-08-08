import type { CargoPackagePayload } from "../../template-payload.ts";

export default function renderCargoPackage(p: CargoPackagePayload): string {
  const headLine =
    p.fullName && p.fullName !== "unknown/unknown"
      ? `  head "https://github.com/${p.fullName}.git", branch: "${p.defaultBranch}"\n`
      : "";
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}${headLine}
${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
