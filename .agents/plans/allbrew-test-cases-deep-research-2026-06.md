# allbrew test cases — deep research pass (June 2026)

## Research brief

### Goal

Build a **compelling test-case catalog** for allbrew across **all of its install-path generators**, each case chosen to **stress real edge cases** when generating, installing, and running an app end-to-end on **macOS**:

- **package-manager path** — `pip-package`, `npm-package`, `cargo-package`, `go-package` (+ future `ruby-gem` / `swift-spm` / `nuget`·`dotnet-tool`)
- **`script-install`** — `curl | bash` install scripts
- **`cask-app`** — direct `.dmg`/`.zip`/`.pkg` downloads
- **`binary-release` / `raw-binary` / `github-release-cask` / `build-from-source` / `source-archive`** — the "ignore brew, pull from releases or build from source" fallback paths
- **`mas-app`** — Mac App Store apps

The research **started** with the package-manager path (the original brief below) and was **extended to every generator** — see [Deeper dive](#deeper-dive) for the generator-to-section map.

### Original request

> To really test this app and flex its edge cases we need to develop a list of compelling test case URLs/apps to install. For the language ecosystem/package manager app formula generation path, identify a set of **standalone, globally-installed apps** (rather than packages that are only imported for use programmatically within other projects), **macOS-compatible** apps that **do not have a Homebrew formula or cask already**. This set should include (1) desktop apps with a traditional desktop GUI, (2) locally-hosted server apps with a web UI served via the browser, and (3) TUI apps that live in the terminal. These apps should be distributed via (1) pip/pipx/uv, (2) rubygem, (3) npm/bun/deno, (4) cargo, (5) go modules, and (6) Swift Package Manager / (7) NuGet/dotnet tool. For each UI type × language ecosystem, provide **at least 5 examples**, preferably popular and highly-used apps — about **25 test cases minimum**; find more if readily available. Use the [Google/Gemini starting matrix](./Package%20manager%20app%20examples%20from%20google.md) as a starting point but **don’t take its results as given**; do your own search and evaluation.

### Deeper dive
Companion to [allbrew-test-cases.md](./allbrew-test-cases.md). This is an
**independently re-verified** catalog: every pick below was checked against the full
Homebrew formula **and** cask name lists (`brew formulae` + `brew casks`,
June 2026) and filtered for **standalone, globally-installable, macOS-compatible apps**.

**Scope expanded to cover every allbrew generator, not just the package-manager path.** The
original brief targeted `pip`/`npm`/`cargo`/`go`-package; this catalog now provides test inputs
for all 12 generators, so each install path has real apps to exercise it:

| Generator | Where the test inputs live |
|-----------|----------------------------|
| `pip-package` / `npm-package` / `cargo-package` / `go-package` | the per-ecosystem sections ([Python](#python--pip--pipx--uv-tool-install--generator-pip-package), [Node](#node--npm-i--g--bun--deno--generator-npm-package), [Rust](#rust--cargo-install--generator-cargo-package), [Go](#go--go-install-latest--generator-go-package)) |
| future `ruby-gem` / `swift-spm` / `nuget`/`dotnet-tool` | the [Ruby](#ruby--gem-install--generator-not-yet--future-ruby-gem), [Swift](#swift--spm--mint--generator-not-yet--future-swift-spm), and [.NET](#net--dotnet-tool-install--g--generator-not-yet--future-nuget-packagedotnet-tool) sections |
| `script-install` | [§ Script-install](#script-install-test-cases--curl--bash-installs-generator-script-install) — `curl \| bash` install scripts (25+ verified URLs) |
| `cask-app` | [§ Direct-download cask-app](#direct-download-cask-app-test-cases--dmg--zip--pkg-generator-cask-app) — `.dmg`/`.zip`/`.pkg` from developer sites and GitHub releases |
| `binary-release` / `raw-binary` / `github-release-cask` / `build-from-source` / `source-archive` | [§ In-Homebrew fallback paths](#in-homebrew-candidates--non-brew-fallback-paths-releases--source) — in-HB apps whose releases ship prebuilt binaries / DMGs (test the "ignore brew, pull from releases or build from source" path) |
| `mas-app` | MAS-only apps (Magnet, ColorSlurp, Bear) flagged in the [direct-download section](#direct-download-cask-app-test-cases--dmg--zip--pkg-generator-cask-app) |

Every app is captured in one place in the [§ Combined master table](#combined-master-table--all-apps-from-every-table-above) ([extracted file](./allbrew-test-cases.md)), whose `is_*` / `has_*` / `in_*` columns map each app to the
generator(s) it can exercise.

The brief was to dig past the first page of search results for *hidden gems*. Two findings
shaped the result:

1. **Many "not in Homebrew" picks from the original doc have since been packaged.** See
   [§ Corrections](#corrections--now-in-homebrew--exclude). Re-verify before every test cycle.
2. **The thin columns are thin for structural reasons, not lack of searching.** Ruby,
   npm-desktop-GUI, Rust-web, and .NET-GUI genuinely lack standalone apps on the package-manager
   path — consumer apps in those ecosystems ship as casks/DMGs or are dev CLIs already in HB.
   Those cells are filled honestly (what exists) rather than padded. **Swift is the exception
   worth watching:** a 2025–26 wave of SwiftUI-shaped terminal frameworks (TauTUI, TUIkit,
   BlinkUI, SwiftTUI) has begun seeding real TUI apps — found via dependent-Package.swift code
   search, not keyword search (see [§ Swift](#swift--spm--mint--generator-not-yet--future-swift-spm)).

**Verification method:** `grep -Fxi -f candidates <(brew formulae; brew casks)` for exact
token matches, plus a fuzzy substring pass to catch token-spelling variants (this is how
`spotify_player` (underscore), `persepolis-download-manager` (cask), and `pake` were caught).

**Legend:** ⚠️ = verify exact install identifier / build path before testing. All picks are
**not in Homebrew** as of June 2026 unless noted.

---

## Coverage summary

**Package-manager path** (verified, not-in-HB picks) — UI type × ecosystem:

| Ecosystem | TUI | Web | Desktop GUI |
|-----------|----:|----:|------------:|
| **Python** (pip/pipx/uv) | 12 | 9 | 14 |
| **Ruby** (gem) | 3 ⚠️thin | 2 | 3 (Glimmer/LibUI) |
| **Node** (npm/bun/deno) | 6 | 10 | 3 (CLI wrappers only) |
| **Rust** (cargo) | 10 | 0 (use Go) | 5 |
| **Go** (go install) | 8 | 5 | 6 (Fyne) |
| **Swift** (SPM/Mint) | 2 (emerging) | 0 | 1 (macMLX, DMG) + 2 dev CLIs |
| **.NET** (dotnet tool) | 2 | 3 | 0 (ships as cask) |

≈ **80 verified package-manager picks**, well past the 25-case minimum. The matrix is intentionally
uneven: where a UI × ecosystem cell has no real standalone apps, that is the finding.

**Other generators** (added in the scope expansion):

| Generator(s) | Count | Section |
|--------------|------:|---------|
| `script-install` | 25+ verified URLs (3 found on this machine) | [§ Script-install](#script-install-test-cases--curl--bash-installs-generator-script-install) |
| `cask-app` | 16 on-machine apps + 6 web-researched + URL-pattern matrix | [§ Direct-download cask-app](#direct-download-cask-app-test-cases--dmg--zip--pkg-generator-cask-app) |
| `binary-release` / `github-release-cask` / `build-from-source` / `raw-binary` / `source-archive` | 66 in-HB apps with release/binary data | [§ In-Homebrew fallback paths](#in-homebrew-candidates--non-brew-fallback-paths-releases--source) |
| `mas-app` | Magnet, ColorSlurp, Bear (MAS-only) | [§ Direct-download cask-app](#direct-download-cask-app-test-cases--dmg--zip--pkg-generator-cask-app) |

All ≈ **230 apps** across every generator are consolidated in the
[§ Combined master table](#combined-master-table--all-apps-from-every-table-above) ([extracted file](./allbrew-test-cases.md)).

---

## Python — `pip` / `pipx` / `uv tool install`  (generator: `pip-package`)

allbrew input: `https://pypi.org/project/<name>/`

### TUI
| Pick | Input | Run | Why it's a good test |
|------|-------|-----|----------------------|
| **browsr** | pypi.org/project/browsr | `browsr` | Textual file explorer over local **and remote** filesystems (fsspec extras) |
| **elia** | pypi.org/project/elia-chat (cmd `elia`) | `elia` | LLM chat TUI; SQLite + many transitive `resource` blocks |
| **toolong** | pypi.org/project/toolong (cmd `tl`) | `tl file.log` | log viewer/merger; Textual |
| **baca** | pypi.org/project/baca | `baca book.epub` | EPUB reader TUI |
| **kupo** | pypi.org/project/kupo | `kupo` | terminal file browser (Textual) |
| **gitsimulator** | pypi.org/project/gitsimulator | `gitsimulator` | interactive git-learning TUI |
| **s-tui** | pypi.org/project/s-tui | `s-tui` | CPU stress/monitor dashboard |
| **castero** | pypi.org/project/castero | `castero` | podcast client; media + sqlite deps |
| **pudb** | pypi.org/project/pudb | `pudb script.py` | full-screen visual debugger |
| **frogmouth** | pypi.org/project/frogmouth | `frogmouth` | Markdown browser (Textual) |
| **euporie** | pypi.org/project/euporie | `euporie-notebook` | Jupyter notebooks in the terminal; large dep tree |
| **pokete** | pypi.org/project/pokete | `pokete` | full terminal RPG; non-trivial runtime/assets |

### Web (local server → browser)
| Pick | Input | Run | Why |
|------|-------|-----|-----|
| **marimo** | pypi.org/project/marimo | `marimo edit` | reactive notebook; standalone, no script needed |
| **mlflow** | pypi.org/project/mlflow | `mlflow ui` | ML tracking dashboard; heavy dep tree |
| **aim** | pypi.org/project/aim | `aim up` | experiment-tracker web UI; native ext build |
| **label-studio** | pypi.org/project/label-studio | `label-studio start` | full data-labeling web app; **very** heavy deps (Django stack) |
| **chainlit** | pypi.org/project/chainlit | `chainlit hello` | chat web UI; has a built-in demo (no user script) |
| **visdom** | pypi.org/project/visdom | `visdom` | live plotting server |
| **streamlit** | pypi.org/project/streamlit | `streamlit hello` | built-in demo app |
| **flower** | pypi.org/project/flower | `celery flower` | Celery dashboard (needs a broker — service-block test) |
| **gradio** | pypi.org/project/gradio | (needs script) | ML demo UI |

### Desktop GUI (PyQt / PySide / GTK / wx)
| Pick | Input | Run | Why |
|------|-------|-----|-----|
| **napari** | pypi.org/project/napari | `napari` | n-D scientific image viewer (Qt + huge sci stack) — resource/SHA stress |
| **orange3** | pypi.org/project/Orange3 | `orange-canvas` | visual data-mining workbench (bin ≠ package name) |
| **bleachbit** | pypi.org/project/BleachBit | `bleachbit` | system/disk cleaner GUI (GTK) |
| **gridplayer** | pypi.org/project/GridPlayer | `gridplayer` | multi-video player (Qt; needs `mpv` runtime dep) |
| **cq-editor** ⚠️ | pypi.org/project/CQ-editor | `cq-editor` | CadQuery 3D editor (Qt + OpenGL) |
| **friture** | pypi.org/project/friture | `friture` | real-time audio analyzer (Qt) |
| **eric-ide** | pypi.org/project/eric-ide | `eric7` | full PyQt IDE; many entry points (bin ≠ package) |
| **beeref** ⚠️ | github.com/rbreu/beeref | `beeref` | reference-image board (Qt); often **GitHub-sourced, not PyPI** → tests non-PyPI flow |
| **pypdfeditor-gui** ⚠️ | pypi.org/project/PyPDFEditor-GUI | `pdfeditor` | PDF merge/edit GUI |
| **FMPy** | pypi.org/project/FMPy | `fmpy gui` | FMU simulation GUI (PySide); found via dep-graph |
| **tabulous** | pypi.org/project/tabulous | `tabulous` | spreadsheet/table viewer (Qt) |
| **pyNastran** ⚠️ | pypi.org/project/pyNastran | `pyNastranGUI` | FEM post-processor GUI |
| **pyqt-openai** (VividNode) | pypi.org/project/pyqt-openai | `pyqt-openai` | desktop multi-LLM client (PyQt6) |
| **caliscope** ⚠️ | pypi.org/project/caliscope | `caliscope` | markerless motion-capture GUI (PySide6) |

---

## Ruby — `gem install`  (generator: not yet — future `ruby-gem`)

> **Thin by nature.** Most gems are libraries/Rails plugins. `mailcatcher` and `gollum`
> (the obvious web picks) are **now in Homebrew** — excluded. No mainstream **desktop-GUI**
> app ships as a gem. Present these as the realistic universe, not a padded list.

### TUI / interactive CLI
| Pick | Input | Why |
|------|-------|-----|
| **pry** | rubygems.org/gems/pry | interactive Ruby REPL/console (TUI-ish); clean `bin` test |
| **taskjuggler** | rubygems.org/gems/taskjuggler (cmd `tj3`) | project scheduler; report generator |
| **license_finder** ⚠️ | rubygems.org/gems/license_finder | dependency license audit CLI (borderline TUI) |

### Web (local server → browser)
| Pick | Input | Run | Why |
|------|-------|-----|-----|
| **smashing** | rubygems.org/gems/smashing | `smashing start` | maintained **Dashing** fork; Sinatra dashboard framework |
| **geminabox** | rubygems.org/gems/geminabox | (rackup) | private gem server with web UI |

### Desktop GUI — via **Glimmer DSL for LibUI** (`gem install`, cross-platform incl. macOS)
The dependency-graph pass (code-search `glimmer-dsl-libui` in `*.gemspec`) found the **only**
gem-distributed desktop GUIs that exist. Small, but real and `gem install`-able:
| Pick | Input | Why |
|------|-------|-----|
| **rubio-radio** | rubygems.org/gems/rubio-radio | LibUI radio player; sole runtime dep is `glimmer-dsl-libui` |
| **adamantite** ⚠️ | rubygems.org/gems/adamantite | local password-manager desktop GUI |
| **htsgrid** ⚠️ | rubygems.org/gems/htsgrid | genomics table viewer |

(Shoes is abandoned; raw `glimmer-dsl-*` packages are libraries, not apps — excluded.)

---

## Node — `npm i -g` / `bun` / `deno`  (generator: `npm-package`)

allbrew input: `https://www.npmjs.com/package/<name>`

### TUI
| Pick | Run | Why |
|------|-----|-----|
| **taskbook** | `tb` | tasks/notes board in the terminal (bin ≠ package name) |
| **vtop** | `vtop` | system activity monitor (braille graphs) |
| **npm-check** | `npm-check -u` | interactive dependency updater (≠ `npm-check-updates`, which exists) |
| **npkill** | `npkill` | interactive `node_modules` finder/cleaner |
| **deputui** | `deputui` | review/install npm dependency updates |
| **forage-cli** | `forage` | npm registry explorer TUI |

### Web (local server → browser)
| Pick | Run | Why |
|------|-----|-----|
| **maildev** | `maildev` | SMTP catcher + web inbox |
| **verdaccio** | `verdaccio` | private npm registry + web UI |
| **json-server** | `json-server db.json` | JSON → REST + browser UI |
| **wetty** | `wetty` | browser terminal over HTTP |
| **browser-sync** | `browser-sync start` | dev server + live-reload UI |
| **pm2** | `pm2 monit` | process manager + monitoring UI |
| **markserv** | `markserv` | serve markdown/dirs as live web |
| **docsify-cli** | `docsify serve` | docs site server (bin `docsify`) |
| **tiddlywiki** | `tiddlywiki wiki --listen` | self-hosted wiki — **distinct from the `tiddly` cask** (NW.js desktop) |
| **clinic** | `clinic doctor -- node app` | perf flamegraphs in browser (needs a node target) |

### Desktop GUI — CLI wrappers only (inherently weak cell)
JS/TS desktop apps overwhelmingly ship as **DMG/cask**, not `npm -g`. The only honest
`npm-package` GUI tests are URL→app wrappers:
| Pick | Run | Why |
|------|-----|-----|
| **nativefier** | `nativefier example.com` | wrap any URL → Electron `.app` |
| **appbun** | `appbun https://example.com` | Electrobun pake-like webpage→app |
| **@hehehai/buke** | `buke …` | Electrobun CLI (bin `buke`) |

> **`pake` / `pake-cli` removed** — the `pake` formula now exists in Homebrew core (same project),
> so it no longer qualifies. Real consumer Electron/Tauri apps (webtorrent-desktop, aya, etc.)
> remain **Tier B / future cask generator**.

---

## Rust — `cargo install`  (generator: `cargo-package`)

allbrew input: `https://crates.io/crates/<crate>` or `https://github.com/<org>/<repo>`

### TUI (sourced from [awesome-ratatui](https://github.com/ratatui/awesome-ratatui), HB-filtered)
| Pick | Crate / repo | Why |
|------|--------------|-----|
| **oatmeal** | `cargo install oatmeal` | LLM chat TUI with model backends |
| **managarr** | `cargo install managarr` | Servarr/HTPC manager (Radarr/Sonarr) |
| **manga-tui** | `cargo install manga-tui` | manga reader/downloader; terminal **image protocol** test |
| **twitch-tui** | `cargo install twitch-tui` | Twitch chat in terminal |
| **tickrs** | `cargo install tickrs` | live stock ticker |
| **nostui** | `cargo install nostui` | Nostr client |
| **gobang** ⚠️ | github.com/TaKO8Ki/gobang | DB management TUI (often `--git` install) |
| **ddv** ⚠️ | github.com/lusingander/ddv | DynamoDB viewer |
| **rrtop** ⚠️ | github.com/wojciech-zurek/rrtop | Redis monitoring (top-like) |
| **tgt** ⚠️ | github.com/FedericoBruzzone/tgt | Telegram TUI — needs **TDLib** native dep (hard build-edge case) |

### Web
Effectively empty: Rust self-hosted web apps installable via `cargo install` and not already in
Homebrew are scarce (miniserve/static-web-server/zola/mdbook are all in HB). **Use the Go column
for web coverage.**

### Desktop GUI (egui / iced / slint)
| Pick | Crate / repo | Why |
|------|--------------|-----|
| **oculante** | `cargo install oculante` | fast image viewer (egui/wgpu); GPU window |
| **emulsion** | `cargo install emulsion` | lightweight image viewer |
| **krokiet** | `cargo install krokiet` | Czkawka's GUI dupe-finder (slint) — note **`czkawka` itself is in HB**, `krokiet` is not |
| **rerun** ⚠️ | `cargo install rerun-cli` (bin `rerun`) | data/3D visualizer; heavy GPU + large build |
| **kiorg** ⚠️ | github.com/sicheng-pang/kiorg | egui file manager |

---

## Go — `go install …@latest`  (generator: `go-package`)

allbrew input: `https://github.com/<org>/<repo>`

### TUI
| Pick | Module | Why |
|------|--------|-----|
| **process-compose** | github.com/F1bonacc1/process-compose | compose-style process orchestrator w/ TUI |
| **wander** | github.com/robinovitch61/wander | HashiCorp Nomad TUI |
| **updo** | github.com/Owloops/updo | uptime/latency monitor TUI |
| **planor** | github.com/mrusme/planor | multi-cloud (AWS/Fly/Vultr) TUI |
| **tdash** | github.com/jessfraz/tdash | terminal CI/analytics dashboard |
| **damon** | github.com/hashicorp/damon | Nomad dashboard TUI |
| **dashbrew** ⚠️ | github.com/rasjonell/dashbrew | custom terminal dashboards |
| **claws** ⚠️ | (AWS TUI) | confirm repo/module path before testing |

### Web — single binary, **embedded frontend** (strong `go-package` stress tests)
These build the web UI into one binary; they exercise `go install` with `go:embed` assets and
(for goatcounter) CGO/SQLite — exactly the edge cases worth catching.
| Pick | Module | Run | Why |
|------|--------|-----|-----|
| **wakapi** | github.com/muety/wakapi | `wakapi` | self-hosted WakaTime backend; `go install …@latest` confirmed |
| **gotty** | github.com/sorenisanerd/gotty | `gotty bash` | share a terminal as a web app |
| **goatcounter** ⚠️ | github.com/arp242/goatcounter | `goatcounter serve` | web analytics; **CGO/SQLite** build (module is `zgo.at/goatcounter/v2`) |
| **gokapi** ⚠️ | github.com/Forceu/Gokapi | `gokapi` | file-sharing web app; `go:embed` assets |
| **picoshare** ⚠️ | github.com/mtlynch/picoshare | `picoshare` | minimalist file-share web app; `go:embed` + SQLite |

### Desktop GUI (Fyne — use `fyne install`, not plain `go install`)
| Pick | Repo | Why |
|------|------|-----|
| **supersonic** | github.com/dweymouth/supersonic | Subsonic/Navidrome music client |
| **rymdport** | github.com/Jacalz/rymdport | magic-wormhole file-transfer GUI |
| **paw** ⚠️ | github.com/lucor/paw | password/identity manager |
| **goshot** ⚠️ | github.com/janpfeifer/goshot | screenshot + annotate tool |

> Fyne apps install via `fyne install <repo>` (or release binaries), not the bare `go install`
> path — flag for the generator. Confirms the original doc's finding that Go rarely ships
> consumer GUIs via plain `go install`.

---

## Swift — SPM / Mint  (generator: not yet — future `swift-spm`)

> **Thin, but NOT empty — and a discovery method that works.** The fix for this column is
> **TUI-framework-first discovery**: a new generation of SwiftUI-shaped terminal frameworks
> appeared in 2025–2026, so search GitHub for *Package.swift files that depend on them*, not for
> "swift TUI app". Verified frameworks and their `gh search code "<owner>/<repo>" --filename Package.swift`
> dependents (June 2026):
>
> | Framework | Repo | What it is |
> |-----------|------|------------|
> | **TauTUI** | steipete/TauTUI | Swift 6 port of `pi-tui`; differential renderer |
> | **TUIkit** | phranck/TUIkit | declarative SwiftUI-like, pure Swift (no ncurses) |
> | **SwiftTUI** | rensbreur/SwiftTUI | SwiftUI API for the terminal |
> | **swift-tui** | SwiftTUI/swift-tui | SwiftUI semantics → terminal **and browser (WASI)** |
> | **BlinkUI** | rational-kunal/BlinkUI | experimental SwiftUI-for-terminal |
> | **TerminalUI** | chriseidhof/TerminalUI | Chris Eidhof's terminal UI package |
> | **TermKit** | migueldeicaza/TermKit | older console toolkit |

### TUI / hybrid apps (built on the frameworks above)
| Pick | Repo | Install | Why |
|------|------|---------|-----|
| **macMLX** (CLI) | magicnight/Mac-MLX (48★) | `swift build --package-path macmlx-cli` (bin `macmlx`) | local-LLM runner; `macmlx` CLI renders **native ANSI dashboards** (SwiftTUI). Pairs with its GUI (below). Not in HB |
| **doedit** | danterobles/doedit | `swift build -c release` | minimal TUI text editor on **TUIkit** — clean SPM-build example. Not in HB |

> Other framework dependents found but **lower value** (0★ demos / AoC solutions / libraries):
> `frederoni/audioviz`, `emiliebunny/SwiftGH`, `chrishannah/minesweeper`, `christopherkarani/Sift`,
> `corv89/limen`, `unnamedd/SiliconCLI` (a *library*, not an app), `StewartLynch/DevToolkit`.
> They're real but nascent — useful only for exercising the raw `swift build` path.

### Desktop GUI
| Pick | Repo | Install | Why |
|------|------|---------|-----|
| **macMLX** (app) | magicnight/Mac-MLX (48★) | `macMLX.dmg` → `/Applications` | polished **native SwiftUI** local-LLM app, no Electron. **Binary/cask** path (future generator), not SPM. Not in HB |

### Dev CLIs (not UI apps, but the only mature not-in-HB SPM/Mint inputs)
| Pick | Install | Note |
|------|---------|------|
| **Rugby** | `mint install swiftyfinch/Rugby` | Xcode build-cache tool |
| **swiftpolyglot** | `mint install` ⚠️ | localization-coverage checker |

> **Excluded — now in Homebrew:** **`asc-cli`** (tddworks, 258★, App Store Connect hybrid
> CLI/`asc tui`/web-server — would've been the ideal Swift pick) is in **homebrew-core as token
> `asccli`**. The hyphenated name `asc-cli` misses it on exact match — the **same
> hyphen/underscore gotcha as `spotify_player`**. Verify with `brew info asccli`.
>
> **Net:** the Swift app ecosystem on the SPM path is **emerging, not absent**. As these
> frameworks mature, re-run the code-search dependents query — the yield will grow.

---

## .NET — `dotnet tool install -g`  (generator: not yet — future `nuget-package`/`dotnet-tool`)

Requires the `dotnet` SDK (Homebrew `dotnet`). Tools land in `~/.dotnet/tools` (needs PATH).
allbrew input: `https://www.nuget.org/packages/<PackageId>`

### Web (local server → browser)
| PackageId | Run | Why |
|-----------|-----|-----|
| **Rnwood.Smtp4dev** | `smtp4dev` | SMTP catcher + browser inbox — best macOS .NET web test |
| **dotnet-serve** | `dotnet-serve` | static HTTP server |
| **dotnet-monitor** ⚠️ | `dotnet-monitor collect` | diagnostics REST/web endpoint |

### TUI / interactive CLI
| PackageId | Run | Why |
|-----------|-----|-----|
| **CSharpRepl** | `csharprepl` | syntax-highlighted C# REPL; .NET 10 global tool |
| **dotnet-counters** | `dotnet-counters monitor` | live-updating perf-counter monitor (TUI-ish) |

### CLI apps (no UI, but clean global-tool tests)
| PackageId | Why |
|-----------|-----|
| **ilspycmd** | .NET decompiler |
| **DepotDownloader** | Steam depot downloader (web claims a HB formula; **not present** as of June 2026 — verify) |

### Desktop GUI
Ships as cask/DMG (Avalonia), **not** via `dotnet tool`: ImageGlass, OpenUtau, AvaloniaILSpy,
SteamTools — reserve for a future **binary/cask** generator (Tier B).

---

## GUI-toolkit dependency-graph discovery (all ecosystems)

The Swift breakthrough — *find the toolkit, then code-search who depends on it* — was applied to
every ecosystem's **desktop-GUI toolkits**. This catches apps that don't self-tag with a GitHub
topic, which keyword/topic search misses.

### Reusable recipe

```bash
# 1. find dependents of a toolkit by searching its manifest across GitHub
gh search code "<dep-token>" --filename <manifest> --json repository --limit 50 \
  | jq -r '.[].repository | select(.isFork==false) | .nameWithOwner' | sort -u
# 2. star-rank them in ONE GraphQL call (code search is not star-ranked)
#    gh api graphql with aliased repository(owner,name){stargazerCount description}
# 3. filter: standalone app · macOS · real package-manager install · brew formulae+casks miss
```

| Ecosystem | Toolkit (dep token) | Manifest |
|-----------|---------------------|----------|
| Rust | egui (`eframe`), iced (`iced`), slint (`slint`) | `Cargo.toml` |
| Go | Fyne (`fyne.io/fyne`), Wails (`wailsapp/wails`) | `go.mod` |
| .NET | Avalonia (`Avalonia`) | `*.csproj` |
| Python | PySide6 (`PySide6`), PyQt6 (`PyQt6`) | `pyproject.toml` |
| Node | NodeGUI (`@nodegui/nodegui`), Tauri (`@tauri-apps/cli`) | `package.json` |
| Ruby | Glimmer LibUI (`glimmer-dsl-libui`) | `*.gemspec` |

### The meta-finding (this is the important result)

> **Desktop GUIs in Rust, Go, .NET, and Node ship as release binaries / casks — NOT via
> `cargo install` / `go install` / `dotnet tool` / `npm -g`.** Star-ranking ~300 dependents
> confirmed it: the popular ones (Liana, Popcorn Time, Extraterm, wombat, LottieViewConvert,
> SydneyQt, ER-Save-Editor) are all binary/DMG-distributed. Plus, **many are Linux-first**
> (gitfourchette = KDE/Flatpak; gameboy.live = `go build` + `libasound2-dev`) and fail the macOS
> filter. **Only `pip` (Python Qt apps) and `gem` (Glimmer/LibUI) distribute real GUI apps
> through the package manager**, with a thin slice of pure-Go **Fyne** apps that `go install`.
>
> **Implication for allbrew:** a **binary-release / cask generator** unlocks far more desktop-GUI
> coverage than any per-ecosystem GUI *package* generator would. Prioritize it over `cargo`/`go`
> GUI handling.

### New verified picks from this pass (not in HB, macOS)

**Python — pip GUI (genuinely pip-installable Qt apps topic-search missed):**
| Pick | Input | Run | Why |
|------|-------|-----|-----|
| **FMPy** | pypi.org/project/FMPy | `fmpy gui` | FMU simulation GUI (PySide); bin ≠ package |
| **tabulous** | pypi.org/project/tabulous | `tabulous` | spreadsheet/table viewer (Qt) |
| **pyNastran** ⚠️ | pypi.org/project/pyNastran | `pyNastranGUI` | FEM post-processor GUI (extras install) |
| **pyqt-openai** (VividNode) | pypi.org/project/pyqt-openai | `pyqt-openai` | desktop multi-LLM client (PyQt6) |
| **caliscope** ⚠️ | pypi.org/project/caliscope | `caliscope` | markerless motion-capture GUI (PySide6) |

**Ruby — gem GUI (fills the previously-EMPTY Ruby-GUI cell, via LibUI):**
| Pick | Input | Why |
|------|-------|-----|
| **rubio-radio** | rubygems.org/gems/rubio-radio | LibUI desktop radio player; sole dep `glimmer-dsl-libui` — confirmed gem |
| **adamantite** ⚠️ | rubygems.org/gems/adamantite | local password-manager desktop GUI in Ruby |
| **htsgrid** ⚠️ | rubygems.org/gems/htsgrid | genomics (HTS) table viewer GUI |

**Go — Fyne GUI that actually `go install`s (supplements supersonic/rymdport/paw/goshot):**
| Pick | Repo | Why |
|------|------|-----|
| **EasyLPAC** ⚠️ | creamlike1024/EasyLPAC | eSIM/lpac GUI frontend (Fyne) |
| **horcrux-ui** ⚠️ | jesseduffield/horcrux-ui | Fyne GUI for `horcrux` file-splitting (by lazygit's author) |

**Tier B — real desktop apps, binary/cask path (future generator), verified not in HB:**
| App | Toolkit | Stars | Notes |
|-----|---------|------:|-------|
| Liana | iced (Rust) | 438 | Bitcoin wallet w/ timelocks |
| ER-Save-Editor | egui (Rust) | 360 | Elden Ring save editor |
| tes3edit / oboromi | egui (Rust) | — | Morrowind editor / Switch-2 emu PoC |
| SydneyQt | Wails (Go) | 881 | Bing/Copilot desktop client |
| digler · nui · gotohp · qiwentaidi/Slack | Wails (Go) | 1.2k/629/343/1.1k | recovery / NATS GUI / Photos client / sec toolkit |
| LottieViewConvert | Avalonia (.NET) | 574 | TGS/Lottie converter desktop app |
| Popcorn Time | NW.js/Electron (Node) | 10.6k | media streamer (`popcorn-official/popcorn-desktop`) |
| dev-manager-desktop | Tauri (Node) | 2.3k | webOS homebrew manager |

> **Excluded — caught in HB by this pass:** `comictagger` (formula), `extraterm` (cask),
> `go2tv` (formula), `wombat` (cask). **Excluded — Linux-first / not macOS:** `gitfourchette`
> (KDE/Flatpak), `gameboy.live` (`go build` + ALSA), `streamdeck-ui`, `fan-control`, `GPU-T`,
> `OpenFreebuds`, `AppDataCleaner`.

---

## Corrections — now in Homebrew → **exclude**

These appeared as viable picks (here or in the original doc) but are **in Homebrew as of
June 2026**. The lesson: re-run the `brew formulae`/`brew casks` check every cycle.

| Was a candidate for | Now in HB | Type |
|---------------------|-----------|------|
| pip TUI | `dooit`, `recoverpy`, `jiratui` | formula |
| Rust TUI | `gitu`, `lazyjj`, `tabiew`, `otree`, `scooter`, `serpl`, `ducker`, `stu`, `gpg-tui`, `kubetui`, `kdash`, `joshuto`, `diskonaut`, `csvlens`, `xplr`, `television`, `rainfrog`, `termscp`, `tenere`, `jwt-ui`, `md-tui`, `doxx`, `tuisky`, `spotify_player`*, `mqttui` | formula |
| Rust GUI | `sniffnet`, `rio` (cask) | formula/cask |
| npm TUI/Web | `gtop`, `mapscii`, `reveal-md`, `pake` | formula |
| Go TUI/Web | `yozefu`, `pug`, `portal`, `lazyjournal`, `dnote`, `gotify`, `shiori` (cask), `gogs` (cask) | formula/cask |
| pip GUI | `vorta` (cask), `electrum` (cask), `frescobaldi` (cask), `manuskript` (cask), `persepolis-download-manager` (cask), `pyzo` (cask), `veusz` (cask), `nicotine-plus`, `soulseek` (cask) | formula/cask |
| Ruby web | `mailcatcher`, `gollum` | formula |
| Swift | `mockolo`, `licenseplist`, `swift-outdated`, `bartycrouch`, `swiftplantuml`, `iblinter`, **`asc-cli` → token `asccli`** | formula |
| GUI dep-graph pass | `comictagger`, `go2tv` (formula), `extraterm`, `wombat` (cask) | formula/cask |
| Rust GUI dupe-finder | `czkawka` (CLI) — but `krokiet` (its GUI) is **not** in HB | formula |

\* `spotify_player` uses an **underscore** token — a hyphen-only exact match misses it. Always
do a fuzzy pass.

→ Full detail (source repo, release counts, prebuilt-binary presence, build-from-source path) for
**every** in-HB candidate is in
[§ In-Homebrew candidates — non-brew fallback paths](#in-homebrew-candidates--non-brew-fallback-paths-releases--source).
These stay useful for testing allbrew's "ignore the brew option, use releases / build from source" flow.

---

## In-Homebrew candidates — non-brew fallback paths (releases / source)

These candidates **are in Homebrew**, so they're excluded from the primary catalog — but they
remain useful test inputs for allbrew's **"ignore the Homebrew option, pull from releases or
build from source instead"** path. The table records, per candidate: its source repo, total
GitHub releases, whether the **latest release ships prebuilt binary assets** (→ binary-release /
github-release-cask / raw-binary generators), and the **build-from-source** fallback by language
(always available — every one is an OSS repo).

Data pulled June 2026 from the Homebrew API (homepage/source) + GitHub GraphQL (release counts +
latest-release asset names).

> `*` **"tags only"** means the heuristic (common binary extensions) found no prebuilt assets in
> the *latest* release — but the project still tags releases and is buildable. It can **undercount**:
> extensionless assets (e.g. czkawka's `linux_czkawka_cli`) and registry-first packages
> (npm/pip/gem/cargo) that attach binaries irregularly. `electrum` is the one with **0 GitHub
> releases** — it distributes signed builds off-GitHub, so source-build is the only non-brew path.

| Candidate | In HB | Source repo | Lang | GH releases | Prebuilt binaries | Non-brew fallback |
|-----------|-------|-------------|------|------------:|-------------------|-------------------|
| `gogs` | cask | [gogs/gogs](https://github.com/gogs/gogs) | Go | 98 | ✅ 14 (latest) | `go install` or source (go build) |
| `rio` | cask | [raphamorim/rio](https://github.com/raphamorim/rio) | Rust | 114 | ✅ 13 (latest) | `cargo install` or source (cargo build) |
| `pyzo` | cask | [pyzo/pyzo](https://github.com/pyzo/pyzo) | Python | 37 | ✅ 8 (latest) | pip / pipx or source |
| `extraterm` | cask | [sedwards2009/extraterm](https://github.com/sedwards2009/extraterm) | TypeScript | 120 | ✅ 6 (latest) | `npm i -g` or source |
| `shiori` | cask | [go-shiori/shiori](https://github.com/go-shiori/shiori) | Go | 32 | ✅ 6 (latest) | `go install` or source (go build) |
| `veusz` | cask | [veusz/veusz](https://github.com/veusz/veusz) | Python | 61 | ✅ 6 (latest) | pip / pipx or source |
| `frescobaldi` | cask | [frescobaldi/frescobaldi](https://github.com/frescobaldi/frescobaldi) | Python | 28 | ✅ 4 (latest) | pip / pipx or source |
| `persepolis-download-manager` | cask | [persepolisdm/persepolis](https://github.com/persepolisdm/persepolis) | Python | 23 | ✅ 4 (latest) | pip / pipx or source |
| `manuskript` | cask | [olivierkes/manuskript](https://github.com/olivierkes/manuskript) | Python | 18 | ✅ 3 (latest) | pip / pipx or source |
| `wombat` | cask | [rogchap/wombat](https://github.com/rogchap/wombat) | Go | 12 | ✅ 3 (latest) | Wails build (Go) / release DMG |
| `vorta` | cask | [borgbase/vorta](https://github.com/borgbase/vorta) | Python | 86 | ✅ 2 (latest) | pip / pipx or source |
| `electrum` | cask | [spesmilo/electrum](https://github.com/spesmilo/electrum) | Python | 0 | none | pip / pipx or source |
| `pake` | formula | [tw93/Pake](https://github.com/tw93/Pake) | Rust | 46 | ✅ 30 (latest) | `cargo install` or source (cargo build) |
| `pop` | formula | [charmbracelet/pop](https://github.com/charmbracelet/pop) | Go | 3 | ✅ 26 (latest) | `go install` or source (go build) |
| `wishlist` | formula | [charmbracelet/wishlist](https://github.com/charmbracelet/wishlist) | Go | 23 | ✅ 25 (latest) | `go install` or source (go build) |
| `portal` | formula | [SpatiumPortae/portal](https://github.com/SpatiumPortae/portal) | Go | 16 | ✅ 15 (latest) | `go install` or source (go build) |
| `sniffnet` | formula | [GyulyVGC/sniffnet](https://github.com/GyulyVGC/sniffnet) | Rust | 17 | ✅ 15 (latest) | `cargo install` or source (cargo build) |
| `jwt-ui` | formula | [jwt-rs/jwt-ui](https://github.com/jwt-rs/jwt-ui) | Rust | 14 | ✅ 12 (latest) | `cargo install` or source (cargo build) |
| `kdash` | formula | [kdash-rs/kdash](https://github.com/kdash-rs/kdash) | Rust | 46 | ✅ 12 (latest) | `cargo install` or source (cargo build) |
| `television` | formula | [alexpasmantier/television](https://github.com/alexpasmantier/television) | Rust | 86 | ✅ 11 (latest) | `cargo install` or source (cargo build) |
| `rainfrog` | formula | [achristmascarl/rainfrog](https://github.com/achristmascarl/rainfrog) | Rust | 55 | ✅ 10 (latest) | `cargo install` or source (cargo build) |
| `csvlens` | formula | [YS-L/csvlens](https://github.com/YS-L/csvlens) | Rust | 18 | ✅ 8 (latest) | `cargo install` or source (cargo build) |
| `doxx` | formula | [bgreenwell/doxx](https://github.com/bgreenwell/doxx) | Rust | 3 | ✅ 8 (latest) | `cargo install` or source (cargo build) |
| `go2tv` | formula | [alexballas/go2tv](https://github.com/alexballas/go2tv) | Go | 35 | ✅ 8 (latest) | `go install` or source (go build) |
| `termscp` | formula | [veeso/termscp](https://github.com/veeso/termscp) | Rust | 42 | ✅ 8 (latest) | `cargo install` or source (cargo build) |
| `dnote` | formula | [dnote/dnote](https://github.com/dnote/dnote) | Go | 83 | ✅ 7 (latest) | `go install` or source (go build) |
| `md-tui` | formula | [henriklovhaug/md-tui](https://github.com/henriklovhaug/md-tui) | Rust | 38 | ✅ 7 (latest) | `cargo install` or source (cargo build) |
| `tabiew` | formula | [shshemi/tabiew](https://github.com/shshemi/tabiew) | Rust | 33 | ✅ 7 (latest) | `cargo install` or source (cargo build) |
| `pug` | formula | [leg100/pug](https://github.com/leg100/pug) | Go | 35 | ✅ 6 (latest) | `go install` or source (go build) |
| `serpl` | formula | [yassinebridi/serpl](https://github.com/yassinebridi/serpl) | Rust | 29 | ✅ 6 (latest) | `cargo install` or source (cargo build) |
| `stu` | formula | [lusingander/stu](https://github.com/lusingander/stu) | Rust | 28 | ✅ 6 (latest) | `cargo install` or source (cargo build) |
| `yozefu` | formula | [MAIF/yozefu](https://github.com/MAIF/yozefu) | Rust | 30 | ✅ 6 (latest) | `cargo install` or source (cargo build) |
| `gitu` | formula | [altsem/gitu](https://github.com/altsem/gitu) | Rust | 55 | ✅ 5 (latest) | `cargo install` or source (cargo build) |
| `nicotine-plus` | formula | [nicotine-plus/nicotine-plus](https://github.com/nicotine-plus/nicotine-plus) | Python | 57 | ✅ 5 (latest) | pip / pipx or source |
| `scooter` | formula | [thomasschafer/scooter](https://github.com/thomasschafer/scooter) | Rust | 22 | ✅ 5 (latest) | `cargo install` or source (cargo build) |
| `slides` | formula | [maaslalani/slides](https://github.com/maaslalani/slides) | Go | 17 | ✅ 5 (latest) | `go install` or source (go build) |
| `xplr` | formula | [sayanarijit/xplr](https://github.com/sayanarijit/xplr) | Rust | 106 | ✅ 5 (latest) | `cargo install` or source (cargo build) |
| `lazyjournal` | formula | [Lifailon/lazyjournal](https://github.com/Lifailon/lazyjournal) | Go | 23 | ✅ 4 (latest) | `go install` or source (go build) |
| `mockolo` | formula | [uber/mockolo](https://github.com/uber/mockolo) | Swift | 42 | ✅ 4 (latest) | SwiftPM (swift build) / Mint |
| `otree` | formula | [fioncat/otree](https://github.com/fioncat/otree) | Rust | 15 | ✅ 4 (latest) | `cargo install` or source (cargo build) |
| `spotify_player` | formula | [aome510/spotify-player](https://github.com/aome510/spotify-player) | Rust | 56 | ✅ 4 (latest) | `cargo install` or source (cargo build) |
| `sshs` | formula | [quantumsheep/sshs](https://github.com/quantumsheep/sshs) | Rust | 35 | ✅ 4 (latest) | `cargo install` or source (cargo build) |
| `licenseplist` | formula | [mono0926/LicensePlist](https://github.com/mono0926/LicensePlist) | Swift | 128 | ✅ 3 (latest) | SwiftPM (swift build) / Mint |
| `comictagger` | formula | [comictagger/comictagger](https://github.com/comictagger/comictagger) | Python | 74 | ✅ 2 (latest) | pip / pipx or source |
| `gotify` | formula | [gotify/cli](https://github.com/gotify/cli) | Go | 14 | ✅ 2 (latest) | `go install` or source (go build) |
| `swift-outdated` | formula | [kiliankoe/swift-outdated](https://github.com/kiliankoe/swift-outdated) | Swift | 5 | ✅ 2 (latest) | SwiftPM (swift build) / Mint |
| `tenere` | formula | [pythops/tenere](https://github.com/pythops/tenere) | Rust | 14 | ✅ 2 (latest) | `cargo install` or source (cargo build) |
| `diskonaut` | formula | [imsnif/diskonaut](https://github.com/imsnif/diskonaut) | Rust | 10 | ✅ 1 (latest) | `cargo install` or source (cargo build) |
| `dooit` | formula | [kraanzu/dooit](https://github.com/kraanzu/dooit) | Python | 23 | ✅ 1 (latest) | pip / pipx or source |
| `gpg-tui` | formula | [orhun/gpg-tui](https://github.com/orhun/gpg-tui) | Rust | 34 | ✅ 1 (latest) | `cargo install` or source (cargo build) |
| `iblinter` | formula | [IBDecodable/IBLinter](https://github.com/IBDecodable/IBLinter) | Swift | 29 | ✅ 1 (latest) | SwiftPM (swift build) / Mint |
| `kubetui` | formula | [sarub0b0/kubetui](https://github.com/sarub0b0/kubetui) | Rust | 65 | ✅ 1 (latest) | `cargo install` or source (cargo build) |
| `asccli` | formula | [tddworks/asc-cli](https://github.com/tddworks/asc-cli) | Swift | 71 | tags only* | SwiftPM (swift build) / Mint |
| `bartycrouch` | formula | [FlineDev/BartyCrouch](https://github.com/FlineDev/BartyCrouch) | Swift | 62 | tags only* | SwiftPM (swift build) / Mint |
| `czkawka` | formula | [qarmin/czkawka](https://github.com/qarmin/czkawka) | Rust | 40 | tags only* | `cargo install` or source (cargo build) |
| `gtop` | formula | [aksakalli/gtop](https://github.com/aksakalli/gtop) | JavaScript | 10 | tags only* | `npm i -g` or source |
| `jiratui` | formula | [whyisdifficult/jiratui](https://github.com/whyisdifficult/jiratui) | Python | 17 | tags only* | pip / pipx or source |
| `joshuto` | formula | [kamiyaa/joshuto](https://github.com/kamiyaa/joshuto) | Rust | 22 | tags only* | `cargo install` or source (cargo build) |
| `lazyjj` | formula | [Cretezy/lazyjj](https://github.com/Cretezy/lazyjj) | Rust | 13 | tags only* | `cargo install` or source (cargo build) |
| `mailcatcher` | formula | [sj26/mailcatcher](https://github.com/sj26/mailcatcher) | Ruby | 22 | tags only* | `gem install` or source |
| `mapscii` | formula | [rastapasta/mapscii](https://github.com/rastapasta/mapscii) | JavaScript | 8 | tags only* | `npm i -g` or source |
| `memray` | formula | [bloomberg/memray](https://github.com/bloomberg/memray) | Python | 34 | tags only* | pip / pipx or source |
| `recoverpy` | formula | [PabloLec/recoverpy](https://github.com/PabloLec/recoverpy) | Python | 41 | tags only* | pip / pipx or source |
| `reveal-md` | formula | [webpro/reveal-md](https://github.com/webpro/reveal-md) | JavaScript | 123 | tags only* | `npm i -g` or source |
| `swiftplantuml` | formula | [MarcoEidinger/SwiftPlantUML](https://github.com/MarcoEidinger/SwiftPlantUML) | Swift | 22 | tags only* | SwiftPM (swift build) / Mint |
| `tuisky` | formula | [sugyan/tuisky](https://github.com/sugyan/tuisky) | Rust | 14 | tags only* | `cargo install` or source (cargo build) |

**Read of the data:** Rust/Go TUIs almost universally attach **cross-platform prebuilt binaries**
to releases (csvlens, kdash, television, termscp, go2tv, slides…) → ideal for testing allbrew's
**binary-release** path against an app that *also* has a brew formula. Python/Ruby/JS registry
packages mostly tag releases without binaries → exercise the **build-from-source / registry**
fallback instead. Desktop GUIs (casks: rio, pyzo, frescobaldi, vorta, manuskript) ship
**`.dmg`/`.pkg`** assets → test the **github-release-cask** path.

---

## Script-install test cases — `curl | bash` installs (generator: `script-install`)

allbrew input: URL to a shell script (`.sh`, `.bash`, or extensionless).
Generator entry point: `lib/generators/script-install.ts`

These are self-executing installation scripts fetched via `curl -fsSL <url> | sh`. They present
both a **security** and a **tracking** challenge — once installed they live outside any package
manager and are easy to forget about. The `script-install` generator wraps them in a proper
Homebrew formula with SHA256 verification and `brew uninstall` cleanup.

### Found on this machine

Scanning `**/bin/**` directories on this machine for non-system, non-Homebrew binaries:

| Binary | Location | Install method | Install URL |
|--------|----------|---------------|-------------|
| **devbox** | `/usr/local/bin/devbox` | Launcher bash script that auto-downloads the real binary on first run | `https://get.jetify.com/devbox` |
| **uv** / **uvx** | `~/.local/bin/uv` | Standalone Mach-O arm64 binary placed by installer script | `https://astral.sh/uv/install.sh` |
| **cua-driver** | `~/.local/bin/cua-driver` | Installed via curl\|bash; drops CuaDriver.app + symlink | `https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh` |

Additional non-Homebrew binaries found but installed via other methods (direct binary download,
app-bundled CLIs, etc.): `apfel`, `apfel-plus`, `container` (Apple), `gittower` (app CLI),
`hln`, `jan` (app CLI), `kind` (direct binary curl), `mdkb`, `sysget`, `tuic`.

### Popular script-install URLs (all verified 200 OK)

| Tool | What it installs | URL | Notes |
|------|-----------------|-----|-------|
| **Homebrew** | Package manager itself | `https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh` | The canonical curl\|bash example; also has uninstall at `/uninstall.sh` |
| **Rustup** | Rust toolchain | `https://sh.rustup.rs` | Custom domain, no `.sh` extension — tests filename extraction edge case |
| **Bun** | JS runtime + package manager | `https://bun.sh/install` | No `.sh` extension |
| **Deno** | JS/TS runtime | `https://deno.land/install.sh` | Standard `.sh` |
| **uv** | Python package manager | `https://astral.sh/uv/install.sh` | Installs standalone binary to `~/.local/bin` |
| **Volta** | JS toolchain manager | `https://get.volta.sh` | No `.sh` extension; `get.` subdomain pattern |
| **Starship** | Cross-shell prompt | `https://starship.rs/install.sh` | Well-structured installer; detects platform + arch |
| **Devbox** | Dev environment manager | `https://get.jetify.com/devbox` | Returns a launcher script, not a one-shot installer |
| **Mise** | Polyglot version manager | `https://mise.run` | Bare domain, no path, no extension |
| **Poetry** | Python dependency manager | `https://install.python-poetry.org` | Python script (not bash) piped to `python3 -` |
| **Oh My Zsh** | Zsh framework | `https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh` | Long raw.githubusercontent path; modifies shell config |
| **nvm** | Node version manager | `https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh` | **Version in URL path** — livecheck must track tag |
| **Atuin** | Shell history sync | `https://setup.atuin.sh` | `setup.` subdomain pattern |
| **Pixi** | Conda-based package manager | `https://pixi.sh/install.sh` | Standard `.sh` |
| **pnpm** | Node package manager | `https://get.pnpm.io/install.sh` | `get.` subdomain + path |
| **Fly.io CLI** | PaaS CLI (flyctl) | `https://fly.io/install.sh` | Installs to `~/.fly/bin` |
| **Railway CLI** | PaaS CLI | `https://raw.githubusercontent.com/railwayapp/cli/master/install.sh` | raw.githubusercontent path |
| **Ollama** | Local LLM runner | `https://ollama.com/install.sh` | Linux-focused; macOS uses the `.zip` download instead |
| **CuaDriver** | Computer-use agent driver | `https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh` | Drops a `.app` bundle + CLI symlink |
| **Tailscale** | VPN/mesh networking | `https://tailscale.com/install.sh` | On macOS, wraps the app download |
| **Nix** | Package manager | `https://nixos.org/nix/install` | No extension; complex multi-step installer |
| **SDKMAN!** | JVM toolchain manager | `https://get.sdkman.io` | No extension; `get.` subdomain |
| **Docker (Linux)** | Container engine | `https://get.docker.com` | Linux-only; macOS uses Desktop.app — good negative test |
| **croc** | File transfer tool | `https://getcroc.schollz.com` | Bare domain redirect |
| **Zellij** | Terminal multiplexer | `https://zellij.dev/launch` | Unusual path (`/launch` not `/install.sh`) |

### Script URL patterns worth testing

The generator extracts the filename from the URL via `url.split("/").pop().split("?")[0]`.
These URL patterns exercise different edge cases:

| Pattern | Example | `filename` extracted | Tests |
|---------|---------|---------------------|-------|
| Standard `/install.sh` | `starship.rs/install.sh` | `install.sh` | Happy path |
| Raw GitHub path | `raw.githubusercontent.com/.../install.sh` | `install.sh` | Long path, basename extraction |
| No extension | `https://sh.rustup.rs` | `rustup.rs` ← misleading | Filename/baseName logic — "rs" isn't a script extension |
| No extension, bare domain | `https://mise.run` | `mise.run` | Even more ambiguous |
| `get.` subdomain pattern | `https://get.volta.sh` | `volta.sh` | BaseName → "volta" ✓ |
| Version in path | `.../nvm/v0.40.3/install.sh` | `install.sh` | Version not in filename — livecheck challenge |
| Query string | `?version=latest` on some URLs | Stripped by `.split("?")[0]` | Query param handling |
| Python script (not bash) | `install.python-poetry.org` | `install.python-poetry.org` | Not a `.sh` file — edge case for the generator |

### Which are also in Homebrew?

Many of these tools also have Homebrew formulae/casks. That's fine for testing — the
`script-install` generator should produce a valid formula regardless. But it's worth noting
which install scripts produce results that **overlap** with existing formulae (for the "choose
to ignore homebrew" path):

In HB: bun, deno, starship, mise, poetry, nvm, atuin, pixi, pnpm, flyctl, ollama, tailscale,
nix, croc, zellij, sdkman.
Not in HB: devbox, uv, volta, cua-driver, railway.

---

## Direct-download cask-app test cases — `.dmg` / `.zip` / `.pkg` (generator: `cask-app`)

allbrew input: URL to a `.dmg`, `.zip`, or `.pkg` file containing a macOS `.app` bundle.
Generator entry point: `lib/generators/cask-app.ts`

The generator downloads the archive, SHA256-hashes it, detects the `.app` name inside (for
`.zip`, inspects entries via `listZipEntries`), extracts the version from the URL, and produces
a Homebrew cask definition.

### Found on this machine — direct-downloaded apps (not via brew/MAS/package manager)

Cross-referencing `/Applications/` against Homebrew Caskroom and MAS receipts:

| App | In Homebrew? | Download URL | URL pattern | Format |
|-----|-------------|-------------|-------------|--------|
| **Seaquel.app** | ✗ not in HB | `https://github.com/webstonehq/seaquel/releases/download/v2026.4.8/Seaquel_2026.4.8_aarch64.dmg` | GitHub release, versioned | `.dmg` |
| **ApiArk.app** | ✗ not in HB | `https://github.com/berbicanes/apiark/releases/download/v0.4.6/ApiArk_0.4.6_aarch64.dmg` | GitHub release, versioned | `.dmg` |
| **Right Crane.app** | ✗ not in HB | [rightright.me/products](https://www.rightright.me/products/) | Developer website | `.dmg` |
| **Unfatten.app** | ✗ not in HB | [avelio.tech/unfatten](https://www.avelio.tech/unfatten) | Developer website | `.dmg` |
| **Ollama.app** | ✓ `ollama` cask | `https://ollama.com/download/Ollama-darwin.zip` → redirects to `https://github.com/ollama/ollama/releases/latest/download/Ollama-darwin.zip` | Developer site → GitHub `/latest/` redirect | `.zip` |
| **Proxyman.app** | ✓ `proxyman` cask | `https://proxyman.io/release/osx/Proxyman_latest.dmg` → 308 to CDN | Developer CDN, "latest" in filename | `.dmg` |
| **Docker.app** | ✓ `docker-desktop` cask | `https://desktop.docker.com/mac/main/arm64/Docker.dmg` | Developer CDN, arch in path | `.dmg` |
| **zoom.us.app** | ✓ `zoom` cask | `https://zoom.us/client/latest/Zoom.pkg` → 302 to `cdn.zoom.us` | Developer CDN, "latest" path, **PKG format** | `.pkg` |
| **Trae.app** | ✓ `trae` cask | Via trae.ai download page | Developer website | `.dmg` |
| **Paste.app** | ✓ `paste` cask | Via paste.app | Developer website | `.dmg` |
| **EasyFind.app** | ✓ `easyfind` cask | Via devmate.com | Developer website | `.dmg` |
| **Hermes.app** | ✓ `hermes` cask | Via hermesapp.io | Developer website | `.dmg` |
| **Terax.app** | ✓ `terax` cask | Via terax.app | Developer website | `.dmg` |
| **Prefs Editor.app** | ✓ `prefs-editor` cask | Via tenten.co | Developer website | `.dmg` |
| **Setapp.app** | ✓ `setapp` cask | Via setapp.com/download | Developer CDN | `.dmg` |
| **Raycast Beta.app** | ✓ `raycast` cask (stable) | Via raycast.com | Developer website, beta channel | `.dmg` |

**Download page style:** Seaquel and ApiArk have GitHub releases pages (directory of multiple
versions with per-platform assets). Ollama, Proxyman, Docker, and Zoom have single-button
download pages that redirect to the latest version. The rest use developer websites with a
single download link.

### Not-in-Homebrew apps with direct download (web research)

| App | Description | Download source | Format | Notes |
|-----|------------|----------------|--------|-------|
| **TokenBar** | AI token usage monitor (menu bar) | [tokenbar.site](https://www.tokenbar.site/get-started) | `.dmg` | Indie; $5/mo or $15 lifetime |
| **Monk Mode** | Focus/distraction blocker | [mac.monk-mode.lifestyle](https://mac.monk-mode.lifestyle) | `.dmg` | Indie; $15 lifetime |
| **MetricSync** | App Store analytics sync | [metricsync.download](https://metricsync.download) | `.dmg` | Indie; $5/mo |
| **Magnet** | Window manager | Mac App Store only | MAS only | ✗ No direct download — not a test case |
| **ColorSlurp** | Color picker | Mac App Store only | MAS only | ✗ No direct download — not a test case |
| **Bear** | Notes app | Mac App Store + direct download | `.dmg` possible | Has no Homebrew cask |

### Apps in Homebrew but good for testing the "ignore brew, use direct download" path

These apps are in Homebrew but were direct-downloaded on this machine. Their download URLs
exercise interesting patterns for the `cask-app` generator:

| App | Download URL | Pattern tested |
|-----|-------------|---------------|
| **UTM** | `https://github.com/utmapp/UTM/releases/latest/download/UTM.dmg` | GitHub `/latest/` redirect (no version in filename) |
| **balenaEtcher** | `https://github.com/balena-io/etcher/releases/latest/download/balenaEtcher-darwin-arm64.dmg` | GitHub `/latest/`, arch in filename |
| **LocalSend** | `https://github.com/localsend/localsend/releases/download/v1.17.0/LocalSend-1.17.0.dmg` | GitHub release, version in filename |
| **IINA** | GitHub releases page (directory of `.dmg` files) | GitHub release, standard DMG |
| **Transmission** | GitHub releases page | GitHub release, version+revision in filename |
| **Ollama** | `https://ollama.com/download/Ollama-darwin.zip` | Developer site redirect → GitHub `.zip` |
| **Proxyman** | `https://proxyman.io/release/osx/Proxyman_latest.dmg` | Developer CDN, "latest" keyword |
| **Docker Desktop** | `https://desktop.docker.com/mac/main/arm64/Docker.dmg` | Developer CDN, no version in URL |
| **Zoom** | `https://zoom.us/client/latest/Zoom.pkg` | `.pkg` format (not DMG), CDN redirect |
| **Tailscale** | `https://pkgs.tailscale.com/stable/Tailscale-latest-macos.zip` | `.zip` format, "latest" → 302 to versioned URL |

### Download URL patterns worth testing

The generator extracts version via `url.match(/[/-]v?(\d+\.\d+(?:\.\d+)?)/)`
and filename via `url.split("/").pop().split("?")[0]`.

| Pattern | Example URL | Version extracted | Edge case |
|---------|------------|-------------------|-----------|
| GitHub versioned release | `.../download/v2026.4.8/Seaquel_2026.4.8_aarch64.dmg` | `2026.4.8` | Version in both path and filename |
| GitHub `/latest/` redirect | `.../releases/latest/download/UTM.dmg` | `null` | No version in URL — `extractVersionFromUrl` returns null |
| Developer CDN "latest" | `Proxyman_latest.dmg` | `null` | "latest" is not a semver — correctly skipped |
| Developer CDN with arch | `desktop.docker.com/mac/main/arm64/Docker.dmg` | `null` | No version in URL |
| CDN redirect (302/307/308) | `zoom.us/client/latest/Zoom.pkg` | `null` | Final URL has version but allbrew sees the input URL |
| `.zip` containing `.app` | `Ollama-darwin.zip` | `null` | Tests `detectAppName` → `listZipEntries` path |
| `.pkg` installer | `Zoom.pkg` | `null` | Tests `buildAppOrPkgBlock` PKG branch |
| Version in filename only | `Seaquel_2026.4.8_aarch64.dmg` | `2026.4.8` | Underscore separators (not hyphen) |
| Platform-specific URLs | `arm64` vs `x64` variants | same | User must pick correct arch |


