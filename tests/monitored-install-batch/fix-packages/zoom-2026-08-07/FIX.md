# FIX: zoom (https://zoom.us)

## Failure class
**generate_fail / brew_fail** (wrong artifact) — homepage discovery chose Mac App Store over Zoom's stable CDN PKG installer; generated MAS cask fails `brew install` (`macappstore://` protocol unsupported by curl).

## Independent judgment
| Field | Expected |
|-------|----------|
| generator | `cask-app` (pkg installer) |
| app | `zoom.us.app` |
| service | **false** (GUI cask) |
| artifact | `https://zoom.us/client/latest/zoomusInstallerFull.pkg` (or `Zoom.pkg`) |
| official cask | homebrew/cask `zoom` uses `cdn.zoom.us/prod/.../arm64/zoomusInstallerFull.pkg` |

## Root cause
1. WebView on zoom.com marketing SPA surfaces App Store CTAs (score 90) and never emits `.pkg` network URLs.
2. Stable installer lives at **`https://zoom.us/client/latest/Zoom.pkg`** (and `zoomusInstallerFull.pkg`), not on `zoom.com`.
3. `.pkg` was classified as `archive` (score ~80) so even if discovered it lost to MAS.
4. Generated MAS template uses `url "macappstore://..."` which Homebrew fetches with curl → fail.

## Fix (batch mode — fix-package only, no release)
1. **`lib/classifier.ts`**: classify `.pkg` as `cask-dmg` (macOS installer artifact).
2. **`lib/page-discover.ts`**:
   - `inventClientLatestArtifactUrls` / `enrichClientLatestArtifacts` — HEAD-probe `/client/latest/*.{pkg,dmg}` across dual TLD origins (zoom.com marketing → zoom.us downloads).
   - `preferNativeInstallersOverStore` — demote MAS/Setapp when a native `.dmg`/`.pkg` exists.
   - Tier A.9 after webview in `discoverPageDownloads`.
3. Unit tests for invent / prefer / enrich (mocked HEAD).

## Validation
```text
# After fix, discovery resolves:
Resolved download via discovery (webview): cask-dmg → https://zoom.us/client/latest/zoomusInstallerFull.pkg
# score 125 native beats MAS 90−40

bun test tests/unit/page-discover.test.ts --test-name-pattern 'client/latest'
bun test tests/unit/classifier.test.ts --test-name-pattern 'pkg'
```
Full cask generate downloads ~100MB+ PKG (sha256); host hit **ENOSPC** mid-download on this run — discovery path is validated; install not completed on host.

## VM
- local-1: SSH unavailable
- homeserver: sparsebundle attach failed (`hdiutil attach did not mount at /opt/homebrew`)
→ **env_fail** for brew install/verify; product fix still required for bottle.

## Residual risk
- Collision renames to `zoom-tap` vs official `homebrew/cask` zoom (Case C prefer-official optional).
- Multi-arch: stable URL redirects; arm64-specific CDN path used by official cask may differ from universal `Zoom.pkg`.
- Fan-out HEAD probes add latency (capped at 24).
- MAS cask generator remains broken for true MAS-only apps (`macappstore://` curl).
