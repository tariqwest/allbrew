import type { CaskAppReleasePayload } from "../../template-payload.ts";

export default function renderCaskAppRelease(
  p: CaskAppReleasePayload,
): string {
  const containerBlock = p.containerBlock || "";
  return `cask "${p.name}" do
  version "${p.version}"
  sha256 "${p.sha256}"

  url "${p.url}"
  name "${p.displayName}"
  desc "${p.desc}"
  homepage "${p.homepage}"

${containerBlock}  app "${p.appName}"

${p.livecheckBlock}${p.zapBlock}end
`;
}
