import type { GemPackagePayload } from "../../template-payload.ts";

export default function renderGemPackage(p: GemPackagePayload): string {
  return `class ${p.className} < Formula
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}
${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}  depends_on "ruby"

  def install
    ENV["GEM_HOME"] = libexec
    system "gem", "install", ${p.gemName}, "--version", version.to_s, "--no-document", "--bindir", "#{bin}"
    bin.env_script_all_files(libexec/"bin", GEM_HOME: ENV["GEM_HOME"])
  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
