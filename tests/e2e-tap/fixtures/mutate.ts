import { runCommand } from "../helpers/run.ts";

export function mutateFixtureVersion(
  baseUrl: string,
  appKey: string,
  newVersion: string,
): void {
  const result = runCommand([
    "curl",
    "-s",
    "-X",
    "PUT",
    `${baseUrl}/mutate/${appKey}/${newVersion}`,
  ]);
  if (result.code !== 0) {
    throw new Error(`Failed to mutate ${appKey}: ${result.stderr || result.code}`);
  }
}

export function resetFixtures(baseUrl: string): void {
  const result = runCommand(["curl", "-s", "-X", "PUT", `${baseUrl}/reset`]);
  if (result.code !== 0) {
    throw new Error(`Failed to reset fixtures: ${result.stderr || result.code}`);
  }
}
