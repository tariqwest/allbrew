import type { CaskAppPayload } from "../../template-payload.ts";

export default function renderCaskApp(p: CaskAppPayload): string {
  return `cask "${p.name}" do
${p.versionLine}  sha256 "${p.sha256}"

  url "${p.url}"
  name "${p.displayName}"
  desc "${p.desc}"
${p.homepageLine}
${p.appOrPkgBlock}end
`;
}
