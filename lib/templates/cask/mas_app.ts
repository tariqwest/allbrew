import type { MasAppPayload } from "../../template-payload.ts";

export default function renderMasApp(p: MasAppPayload): string {
  let ruby = `cask "${p.name}" do\n`;
  ruby += `  version "${p.version}"\n`;
  ruby += `  sha256 :no_check\n\n`;

  ruby += `  url "macappstore://apps.apple.com/app/id${p.appId}?mt=12"\n`;
  ruby += `  name "${p.appName}"\n`;
  ruby += `  desc "${p.desc}"\n`;
  ruby += `  homepage "${p.homepage}"\n\n`;

  ruby += `  depends_on formula: "mas"\n\n`;

  ruby += `  installer script: {\n`;
  ruby += `    executable: "mas",\n`;
  ruby += `    args: ["install", "${p.appId}"],\n`;
  ruby += `  }\n\n`;

  ruby += `  uninstall delete: "/Applications/${p.appName}.app"\n\n`;

  ruby += p.zapBlock;
  ruby += `end\n`;

  return ruby;
}
