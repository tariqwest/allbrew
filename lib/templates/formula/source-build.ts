import type { SourceBuildPayload } from "../../template-payload.ts";

export default function renderSourceBuild(p: SourceBuildPayload): string {
  // stdlib venv install no longer needs Virtualenv module, but preserve_rpath is
  // required for native wheels (jiter/pydantic-core) under libexec.
  const pythonBits = p.isPython
    ? "\n  # Native wheels (jiter, pydantic-core, …) ship @rpath dylib IDs; preserve them.\n  preserve_rpath\n"
    : "";
  return `class ${p.className} < Formula${pythonBits}
  desc "${p.desc}"
  homepage "${p.homepage}"
${p.licenseLine}${p.urlLines}  head "https://github.com/${p.fullName}.git", branch: "${p.defaultBranch}"

${p.livecheckBlock}${p.allbrewDependency ? `  depends_on "${p.allbrewDependency}"\n` : ""}${p.dependenciesLines}  def install
${p.installBody}  end

${p.serviceBlock}  test do
    assert_match version.to_s, shell_output("#{bin}/${p.testBinName} --version")
  end
end
`;
}
