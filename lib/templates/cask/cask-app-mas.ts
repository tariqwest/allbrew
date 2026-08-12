import type { CaskAppMasPayload } from "../../template-payload.ts";

export default function renderCaskAppMas(p: CaskAppMasPayload): string {
  // Use HTTPS apps.apple.com (not macappstore://). Homebrew always curl-fetches
  // the cask `url` before running `installer script:`; curl has no macappstore
  // protocol handler, so brew install failed before `mas install` could run.
  // HTTPS is fetchable (HTML shell, sha256 :no_check); the real payload is
  // installed by mas — same pattern as cask-app-setapp (homepage URL + CLI).
  return `cask "${p.name}" do
  version "${p.version}"
  sha256 :no_check

  url "https://apps.apple.com/app/id${p.appId}?mt=12"
  name "${p.appName}"
  desc "${p.desc}"
  homepage "${p.homepage}"

${p.livecheckBlock}  depends_on formula: "mas"

  caveats <<~EOS
    Requires being signed in to the Mac App Store (\`mas signin\` / System Settings).
  EOS

  installer script: {
    executable: "mas",
    args: ["install", "${p.appId}"],
  }

  uninstall delete: "/Applications/${p.appName}.app"

${p.zapBlock}end
`;
}
