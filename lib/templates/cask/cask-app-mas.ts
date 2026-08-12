import type { CaskAppMasPayload } from "../../template-payload.ts";

export default function renderCaskAppMas(p: CaskAppMasPayload): string {
  return `cask "${p.name}" do
  version "${p.version}"
  sha256 :no_check

  url "https://apps.apple.com/app/id${p.appId}?mt=12"
  name "${p.appName}"
  desc "${p.desc}"
  homepage "${p.homepage}"

${p.livecheckBlock}  depends_on formula: "mas"

  caveats <<~EOS
    Requires being signed in to the Mac App Store (Apple ID) so mas install can run.
  EOS

  installer script: {
    executable: "#{HOMEBREW_PREFIX}/bin/mas",
    args: ["install", "${p.appId}"],
  }

  uninstall delete: "/Applications/${p.appName}.app"

${p.zapBlock}end
`;
}
