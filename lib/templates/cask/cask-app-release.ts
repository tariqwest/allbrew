import type { CaskAppReleasePayload } from "../../template-payload.ts";

export default function renderCaskAppRelease(
  p: CaskAppReleasePayload,
): string {
  return `cask "${p.name}" do
  version "${p.version}"
  sha256 "${p.sha256}"

  url "${p.url}"
  name "${p.displayName}"
  desc "${p.desc}"
  homepage "${p.homepage}"

  app "${p.appName}"

${p.livecheckBlock}${p.zapBlock}end
`;
}
