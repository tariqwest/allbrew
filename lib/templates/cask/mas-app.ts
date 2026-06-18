import type { MasAppPayload } from "../../template-payload.ts";

export default function renderMasApp(p: MasAppPayload): string {
  return `cask "${p.name}" do
  version "${p.version}"
  sha256 :no_check

  url "macappstore://apps.apple.com/app/id${p.appId}?mt=12"
  name "${p.appName}"
  desc "${p.desc}"
  homepage "${p.homepage}"

${p.livecheckBlock}  depends_on formula: "mas"

  installer script: {
    executable: "mas",
    args: ["install", "${p.appId}"],
  }

  uninstall delete: "/Applications/${p.appName}.app"

${p.zapBlock}end
`;
}
