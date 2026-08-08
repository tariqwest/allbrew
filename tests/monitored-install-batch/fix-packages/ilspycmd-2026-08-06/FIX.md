# Fix: NuGet/dotnet generator prefers prerelease as "latest"

## Package
- **URL**: https://nuget.org/packages/ilspycmd
- **Slug**: ilspycmd
- **Generator**: dotnet-package

## Failure
`fetchNugetData` took `versions[versions.length - 1]` from the NuGet flat container index. That array is SemVer-sorted and **includes prereleases**, so for `ilspycmd` allbrew selected `11.0.0.9335-rc` instead of stable `10.1.1.8388`.

That mismatched NuGet Gallery’s “latest stable” UX and risks `dotnet tool install` / formula `test` failures when prerelease tooling needs a different runtime.

## Root cause
`lib/generators/dotnet-package.ts` → `fetchNugetData` last-element selection with no prerelease filter.

## Fix
- Add `isNugetPrerelease` (SemVer2: hyphen after numeric core).
- Add `pickNugetVersion`: walk versions reverse; return last non-prerelease; fall back to absolute last if only prereleases exist.
- Unit tests for prefer-stable and prerelease-only fallback.

## Validation
- `bun test tests/unit/generators/dotnet-package.test.ts` → 18 pass
- Local generate (worktree) → formula `version "10.1.1.8388"`, url ends with `/10.1.1.8388`
- Host `brew install` of generated formula succeeded (then uninstalled); not used as batch success path

## Batch note
Do not release from this agent. Option A fix-package only.
