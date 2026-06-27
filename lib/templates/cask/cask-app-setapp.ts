import type { CaskAppSetappPayload } from "../../template-payload.ts";

export default function renderCaskAppSetapp(p: CaskAppSetappPayload): string {
  return `cask "${p.name}" do
  version "${p.version}"
  sha256 :no_check

  url "${p.homepage}"
  name "${p.appName}"
  desc "${p.desc}"
  homepage "${p.homepage}"

${p.livecheckBlock}  depends_on formula: "setapp-cli"
  depends_on cask: "setapp"

  caveats <<~EOS
    Requires an active Setapp subscription and being signed in to Setapp.
  EOS

  installer script: {
    executable: "setapp-cli",
    args: ["install", "${p.appName}"],
  }

  uninstall script: {
    executable: "setapp-cli",
    args: ["remove", "${p.appName}"],
  }

${p.zapBlock}end
`;
}
