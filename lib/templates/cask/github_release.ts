import type { GithubReleaseCaskPayload } from "../../template-payload.ts";

export default function renderGithubReleaseCask(
  p: GithubReleaseCaskPayload,
): string {
  let ruby = `cask "${p.name}" do\n`;
  ruby += `  version "${p.version}"\n`;
  ruby += `  sha256 "${p.sha256}"\n\n`;

  ruby += `  url "${p.url}"\n`;
  ruby += `  name "${p.displayName}"\n`;
  ruby += `  desc "${p.desc}"\n`;
  ruby += `  homepage "${p.homepage}"\n\n`;

  ruby += `  livecheck do\n`;
  ruby += `    url :url\n`;
  ruby += `    strategy :github_latest\n`;
  ruby += `  end\n\n`;

  ruby += `  app "${p.appName}"\n\n`;

  ruby += p.zapBlock;
  ruby += `end\n`;

  return ruby;
}
