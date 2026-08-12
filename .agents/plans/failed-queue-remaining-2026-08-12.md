# Remaining failed queue classification — 2026-08-12 post-P0 wave

Total failed: **34**

## Buckets

### generate_fail (11)

| slug | agent | action | url |
|------|-------|--------|-----|
| snippetbar | `url-0088-snippetbar` | classifier/generator routing | https://snippetbar.app |
| beeref | `url-0173-beeref` | classifier/generator routing | https://pypi.org/project/beeref |
| devdash | `url-0249-devdash` | classifier/generator routing | https://github.com/devdash/devdash |
| snippetbar | `url-0327-snippetbar` | classifier/generator routing | https://snippetbar.app |
| togglepresent | `url-0384-togglepresent` | classifier/generator routing | https://togglepresent.com |
| extraterm | `url-0453-extraterm` | classifier/generator routing | https://npmjs.com/package/extraterm |
| htsgrid | `url-0485-htsgrid` | classifier/generator routing | https://rubygems.org/gems/htsgrid |
| naturalmouse | `url-0624-naturalmouse` | classifier/generator routing | https://naturalmouse.app |
| deputui | `url-0717-deputui` | classifier/generator routing | https://npmjs.com/package/deputui |
| devdash | `url-0740-devdash` | classifier/generator routing | https://devdash.dev |
| resurf | `url-0026-resurf` | classifier/generator routing | https://resurf.app |

### infra (10)

| slug | agent | action | url |
|------|-------|--------|-----|
| ugm | `url-0093-ugm` | requeue after host hygiene | https://github.com/ariasmn/ugm |
| t3code | `url-0188-t3code` | requeue after host hygiene | https://t3code.com |
| t3code | `url-0262-t3code` | requeue after host hygiene | https://t3code.com |
| electrum | `url-0272-electrum` | requeue after host hygiene | https://github.com/spesmilo/electrum |
| dotnet-counters | `url-0344-dotnet-counters` | requeue after host hygiene | https://github.com/dotnet/diagnostics |
| tes3edit | `url-0346-tes3edit` | requeue after host hygiene | https://github.com/rfuzzo/tes3edit |
| recordly | `url-0360-recordly` | requeue after host hygiene | https://github.com/recordly/recordly |
| prefs-editor | `url-0365-prefs-editor` | requeue after host hygiene | https://tenten.co |
| openvox | `url-0695-openvox` | requeue after host hygiene | https://openvox.app |
| openvox | `url-0724-openvox` | requeue after host hygiene | https://openvox.app |

### brew_fail (4)

| slug | agent | action | url |
|------|-------|--------|-----|
| goshot | `url-0078-goshot` | install/link/test residual | https://github.com/janpfeifer/goshot |
| goshot | `url-0270-goshot` | install/link/test residual | https://github.com/janpfeifer/goshot |
| easyfind | `url-0537-easyfind` | install/link/test residual | https://devmate.com |
| depotdownloader | `url-0743-depotdownloader` | install/link/test residual | https://nuget.org/packages/DepotDownloader |

### skip-official-cask-url (3)

| slug | agent | action | url |
|------|-------|--------|-----|
| systemeq | `url-0478-systemeq` | classifier/generator routing | https://formulae.brew.sh/cask/systemeq |
| pasty | `url-0591-pasty` | classifier/generator routing | https://formulae.brew.sh/cask/pasty |
| ia-writer | `url-0686-ia-writer` | classifier/generator routing | https://formulae.brew.sh/cask/ia-writer |

### native-build (2)

| slug | agent | action | url |
|------|-------|--------|-----|
| rrtop | `url-0063-rrtop` | deps / cargo unlock | https://github.com/wojciech-zurek/rrtop |
| jockey | `url-0331-jockey` | deps / cargo unlock | https://github.com/recailai/jockey |

### product-investigate (2)

| slug | agent | action | url |
|------|-------|--------|-----|
| rrtop | `url-0116-rrtop` | triage with summary | https://github.com/wojciech-zurek/rrtop |
| doedit | `url-0293-doedit` | triage with summary | https://github.com/danterobles/doedit |

### skip-nix-multiuser (1)

| slug | agent | action | url |
|------|-------|--------|-----|
| nix | `url-0115-nix` | install/link/test residual | https://github.com/NixOS/nix |

### routing-cask-vs-cli (1)

| slug | agent | action | url |
|------|-------|--------|-----|
| codemantis | `url-0237-codemantis` | isAppAsset / release routing | https://github.com/codemantis-dev/codemantis |

## Recommended disposition

1. **skip-official-cask-url / skip-nix**: mark skipped (catalog noise)
2. **infra**: requeue after host cleanup
3. **generate_fail / routing-cask-vs-cli**: product tickets (classifier)
4. **brew_fail / verify-bin / native-build**: product tickets (generators)
5. **dotnet-experimental**: keep quarantined
6. **product-investigate**: needs per-URL summary deep dive

## Status 2026-08-12 evening

- Official cask URLs + nix: **skipped** in queue
- Infra bucket (10 agents): **requeued to pending** after host cleanup
- Cold bottle smoke **v0.0.31** (`tests/monitored-install-runs/cold-smoke-0.0.31-*`):
  - PASS: starship, nanobot, toolong, television, mailcatcher
  - FAIL: verdaccio (see smoke log; service/github-readme path still flaky on bottle)


## Infra wave execution (2026-08-12T21:29Z)

Parent ran all 10 requeued “infra” items via bottled **0.0.31** `vm-install-one` (concurrency 3).

**Result: 0/10 VERIFY_OK.**

| Outcome | Count | Items |
|---------|------:|-------|
| generate_fail / marketing | 5 | t3code×2, openvox×2, prefs-editor |
| github 404 | 1 | recordly |
| brew_fail product | 4 | ugm, electrum, tes3edit, dotnet-counters |

Post-run disposition: marketing + recordly → **skipped**; product brew fails remain **failed**.

Conclusion: prior “infra” label was misleading for this set — failures reproduce on clean bottle path and are product/catalog, not VM host hygiene.


## Permanent catalog skips (2026-08-12)

Marked `skipped` with `permanentSkip: true` / `skipReason: permanent_catalog_skip`:

| agent | slug | Reasoning |
|-------|------|-----------|
| `url-0093-ugm` | ugm | Linux-only release binaries (no macOS assets). Go source packaging is optional; not a batch unlock target. |
| `url-0344-dotnet-counters` | dotnet-counters | monorepo URL misroutes to cmake source-build; needs NuGet/`dotnet tool` URL. Experimental generator — not batch-ready. |
| `url-0346-tes3edit` | tes3edit | Cargo GUI/editor with heavy native build; brew install failed on bottle path; low catalog value vs cost. |
| `url-0272-electrum` | electrum | Multi-GB Bitcoin wallet desktop app. No stable macOS release assets for cask; HEAD Python build is unstable and unsuitable for batch. |

Do **not** requeue these unless the user explicitly expands product scope (mac go for linux-only, NuGet routing, heavy cargo GUI, or wallet casks).
