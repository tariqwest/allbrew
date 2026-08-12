import type { CaskAppMasPayload } from "../../template-payload.ts";

export default function renderCaskAppMas(p: CaskAppMasPayload): string {
  // Use https App Store URL — Homebrew fetches url via curl, which does not
  // support the macappstore:// scheme (curl: Protocol "macappstore" not supported).
  // Install is performed by the mas CLI installer script, not the downloaded HTML.
  const appBundle = p.appBundleName || p.appName;
  return `cask "${p.name}" do
  version "${p.version}"
  sha256 :no_check

  url "https://apps.apple.com/app/id${p.appId}?mt=12"
  name "${p.appName}"
  desc "${p.desc}"
  homepage "${p.homepage}"

${p.livecheckBlock}  depends_on formula: "mas"

  installer script: {
    executable: "mas",
    args: ["install", "${p.appId}"],
  }

  uninstall delete: "/Applications/${appBundle}.app"

${p.zapBlock}end
`;
}
