import { collectBinaryReleasePayload } from "./binary-release.ts";
import type { SetappCliPayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

export async function collectSetappCliPayload(
  repoInfo: any,
  release: any,
  options: any = {},
): Promise<SetappCliPayload> {
  const base = await collectBinaryReleasePayload(repoInfo, release, options);
  return { ...base, template: "setapp_cli" };
}

export async function generateSetappCliFormula(
  repoInfo: any,
  release: any,
  options: any = {},
) {
  const payload = await collectSetappCliPayload(repoInfo, release, options);
  return writeRenderedFormula(payload, options.tapPath);
}
