# Dogfood Fix

The GitHub npm detector selected the private root workspace package `@deepseek-ai/dsh-root`, causing a registry 404. The fix resolves private npm workspaces to a publishable child package exposing a binary, selecting `@deepseek-ai/dsh` and its `dsh` executable. A focused unit test covers the resolver.

Validation: `bun run check` passed in the disposable worktree; the focused resolver test passed. Existing bin-name integration tests fail under Bun 1.3.14 because their mocked response lacks `response.headers`, unrelated to this change.
