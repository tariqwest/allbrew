export async function mutateFixtureVersion(
  baseUrl: string,
  appKey: string,
  newVersion: string,
): Promise<void> {
  const response = await fetch(`${baseUrl}/mutate/${appKey}/${newVersion}`, {
    method: "PUT",
  });
  if (!response.ok) {
    throw new Error(`Failed to mutate ${appKey}: ${response.status}`);
  }
}

export async function resetFixtures(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/reset`, { method: "PUT" });
  if (!response.ok) {
    throw new Error(`Failed to reset fixtures: ${response.status}`);
  }
}
