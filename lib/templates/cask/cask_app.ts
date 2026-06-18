import type { CaskAppPayload } from "../../template-payload.ts";

export default function renderCaskApp(p: CaskAppPayload): string {
  let ruby = `cask "${p.name}" do\n`;
  ruby += p.versionLine;
  ruby += `  sha256 "${p.sha256}"\n\n`;

  ruby += `  url "${p.url}"\n`;
  ruby += `  name "${p.displayName}"\n`;
  ruby += `  desc "${p.desc}"\n`;
  ruby += p.homepageLine;
  ruby += `\n`;

  ruby += p.appOrPkgBlock;
  ruby += `end\n`;

  return ruby;
}
