import type { GemPackagePayload } from "../../template-payload.ts";

export default function renderGemPackage(p: GemPackagePayload): string {
  const extraDepends = p.dependsOnLines || "";
  const testBody =
    p.testDoBody ||
    `    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")`;
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}
${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}${extraDepends}  depends_on "ruby"

  def install
    ENV["GEM_HOME"] = libexec
    system "gem", "install", ${p.gemName}, "--version", version.to_s, "--no-document", "--bindir", "#{bin}"
    bin.env_script_all_files(libexec/"bin", GEM_HOME: ENV["GEM_HOME"])
${p.binAliasBlock}  end

${p.serviceBlock}  test do
${testBody}
  end
end
`;
}
