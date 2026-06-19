# Package-manager test cases for allbrew

## Research brief

### Goal

Build a **compelling test-case catalog** for allbrew’s **package-manager formula generation path** (`pip-package`, `npm-package`, `cargo-package`, `go-package`, and future generators). Each case should **stress real edge cases** when generating, installing, and running an app end-to-end on **macOS**.

### Original request

> To really test this app and flex its edge cases we need to develop a list of compelling test case URLs/apps to install. For the language ecosystem/package manager app formula generation path, identify a set of **standalone, globally-installed apps** (rather than packages that are only imported for use programmatically within other projects), **macOS-compatible** apps that **do not have a Homebrew formula or cask already**. This set should include (1) desktop apps with a traditional desktop GUI, (2) locally-hosted server apps with a web UI served via the browser, and (3) TUI apps that live in the terminal. These apps should be distributed via (1) pip/pipx/uv, (2) rubygem, (3) npm/bun/deno, (4) cargo, (5) go modules, and (6) Swift Package Manager / (7) NuGet/dotnet tool. For each UI type × language ecosystem, provide **at least 5 examples**, preferably popular and highly-used apps — about **25 test cases minimum**; find more if readily available. Use the [Google/Gemini starting matrix](./Package%20manager%20app%20examples%20from%20google.md) as a starting point but **don’t take its results as given**; do your own search and evaluation.

Clarified criteria:

| UI type | Definition |
|---------|------------|
| **TUI** | Interactive terminal app (full-screen or rich shell UI) |
| **Web** | Locally hosted server; primary UX in the **browser** |
| **Desktop GUI** | Native or cross-platform **windowed** desktop app |

| Ecosystem | Global install | allbrew generator (June 2026) |
|-----------|----------------|-------------------------------|
| Python | `pip` / `pipx` / `uv tool install` | `pip-package` ✓ |
| Ruby | `gem install` | not yet |
| Node.js | `npm i -g` / `bun` / `deno` | `npm-package` ✓ |
| Rust | `cargo install` | `cargo-package` ✓ |
| Go | `go install …@latest` | `go-package` ✓ |
| Swift | `mint install` / `swift run` | not yet |
| .NET | `dotnet tool install -g` (NuGet) | not yet |

### Additional direction (from research process)

1. **Verify everything; exclude Homebrew** — `brew info <name>` for formulae **and** casks. Reject picks already in Homebrew (`glances`, `lazygit`, `caprine`, `stability-matrix`, etc.).

2. **Apps only** — exclude UI frameworks (`textual`, `fyne`, `wails`, `bubbletea`), packagers (`electron-forge`, `electron-builder`), libraries (`sidekiq`, `blessed-contrib`), and demos (`textual-demo`). Borderline exception: CLI wrappers like `nativefier` / `appbun` for npm GUI generator tests.

3. **GUI-library-first discovery** — for desktop GUIs, find libraries via GitHub topics, then apps using them (see [GUI-library-first discovery](#gui-library-first-discovery) below).

4. **TUI discovery** — seed from [awesome-tuis](https://github.com/rothgar/awesome-tuis), then filter for standalone + not in Homebrew + correct install path.

5. **Install-path rule** — consumer desktop GUIs rarely ship as `npm -g` or `dotnet tool install -g`. Split **package-manager formulas** (registry `bin`, `cargo install`, `go install`) from **binary-release / cask** candidates (DMG, GitHub releases).

6. **Typical allbrew inputs** — PyPI, npm, crates.io/GitHub, `go install` module path, NuGet package URL (see [Suggested allbrew inputs](#suggested-allbrew-inputs) below).

7. **Test workflow** — `allbrew <url> --manual` → `brew install` → run and exercise the UI type (see [Practical test workflow](#practical-test-workflow) below).

8. **Google/Gemini pitfalls** — frameworks listed as apps, HB duplicates, Windows-only GUIs (WPF), wrong PyPI names, npm apps that ship as casks not global CLIs (see [What the Google/Gemini list got wrong](#what-the-googlegemini-list-got-wrong) below).

---

## Curated catalog

Curated targets for **standalone, globally installable, macOS-compatible apps** that are **not in Homebrew** (checked with `brew info <name>` — covers core formulae and casks). Frameworks, libraries, and “wraps another interactive tool” entries from [awesome-tuis](https://github.com/rothgar/awesome-tuis) are excluded unless they are the app itself.

**Sources:** independent evaluation, [awesome-tuis](https://github.com/rothgar/awesome-tuis), [github.com/topics/pyqt](https://github.com/topics/pyqt), GitHub topics (`electron`, `electrobun`, `nodegui`, `neutralinojs`, `nwjs`, `egui`, `fyne`, `avalonia`, `maui`, `uno-platform`), npm and NuGet registry search, [avaloniaui.net/showcase](https://avaloniaui.net/showcase), [Package manager app examples from google.md](./Package%20manager%20app%20examples%20from%20google.md) (discredited where wrong), and cross-check against Homebrew (June 2026).

---

## GUI-library-first discovery

Use this when awesome-tuis / PyPI search misses desktop GUIs:

```
GitHub topic/search (lang + gui OR topic:<library>)
  → top GUI libraries / runtimes
  → apps using each library (exclude *-starter, *-template, awesome-*)
  → filter: standalone app, macOS, global install path
  → brew info <name>  (formulae + casks)
```

| Ecosystem | Library entry points | App discovery queries |
|-----------|---------------------|------------------------|
| **Python** | `topic:pyqt`, `topic:pyside` | PyPI search + topic repos with `console_scripts` |
| **npm / bun** | `topic:electron`, `topic:electrobun`, `topic:nodegui`, `topic:neutralinojs`, `topic:nwjs` | npm `bin` audit; `{framework} in:readme` on GitHub |
| **Rust** | `topic:egui`, `topic:iced`, `topic:slint`, `topic:dioxus` | `{crate} in:readme cargo install` |
| **Go** | `topic:fyne`, `topic:wails` | [apps.fyne.io](https://apps.fyne.io/all.html), `fyne.io/apps` installer |
| **.NET** | `topic:avalonia`, `topic:maui`, `topic:uno-platform` | NuGet `DotnetTool` audit; [avaloniaui.net/showcase](https://avaloniaui.net/showcase) |

**Install-path rule:** Consumer desktop apps rarely ship as `npm -g` / `dotnet tool install -g` / `cargo install` products. Split candidates into **package-manager formulas** (real `bin` on the registry) vs **binary-release / cask** paths (DMG, `neu build`, GitHub releases).

---

## Allbrew generator coverage

| Generator | Status |
|-----------|--------|
| `pip-package` | Supported |
| `npm-package` | Supported |
| `cargo-package` | Supported |
| `go-package` | Supported |
| `nuget-package` / `dotnet-tool` | Not yet — listed for manual/future testing |
| Ruby gem | Not yet — listed for manual/future testing |
| Swift SPM / Mint | Not yet — listed for manual/future testing |

### Suggested allbrew inputs

| Ecosystem | Typical URL / identifier |
|-----------|-------------------------|
| pip / uv / pipx | `https://pypi.org/project/<name>/` |
| npm / bun | `https://www.npmjs.com/package/<name>` |
| cargo | `https://github.com/<org>/<repo>` or `https://crates.io/crates/<crate>` |
| go | `https://github.com/<org>/<repo>` (`go install …@latest`) |
| NuGet / dotnet tool | `https://www.nuget.org/packages/<PackageId>` (`dotnet tool install -g <PackageId>`) |

After formula generation, install with `uv tool install <pkg>`, `pipx install <pkg>`, `npm i -g <pkg>`, `cargo install <crate>`, `go install <module>@latest`, or `dotnet tool install -g <PackageId>` (requires `dotnet` SDK).

---

## Legend

| Symbol | Meaning |
|--------|---------|
| **TU** | Listed in [awesome-tuis](https://github.com/rothgar/awesome-tuis) |
| **PQ** | Listed under [github.com/topics/pyqt](https://github.com/topics/pyqt) |
| **HB** | In Homebrew — excluded from picks |
| **⚠️** | Verify PyPI crate name / console script before testing |

---

## Python (pip / pipx / uv)

### TUI (terminal apps)

| # | Package | Why it's a good test | TU | HB |
|---|---------|----------------------|:--:|:--:|
| 1 | **s-tui** | CPU stress/monitor; classic dashboard TUI | ✓ | No |
| 2 | **castero** | Podcast client; real media + sqlite deps | ✓ | No |
| 3 | **pokete** | Full terminal game; non-trivial runtime | ✓ | No |
| 4 | **frogmouth** | Markdown browser (Textual) | ✓ | No |
| 5 | **pudb** | Visual debugger TUI | ✓ | No |
| 6 | **euporie** | Jupyter notebooks in the terminal | ✓ | No |
| 7 | **trogon** | Auto-builds TUIs for CLI argparse apps | — | No |
| 8 | **termtools-tui** | Meta-browser for installed CLI tools | — | No |
| 9 | **sot** | System observability TUI | ✓ | No |
| 10 | **hackernews_tui** | Popular HN reader (Rust crate; often grouped with Python lists) | ✓ | No |

**Skip (already in Homebrew):** `posting`, `glances`, `ranger`, `harlequin`, `dolphie`, `datasette`, `pgcli` / `mycli` / `litecli`, `mitmproxy` (cask).

### Web UI (local server → browser)

| # | Package | Command / UI | TU | HB |
|---|---------|--------------|:--:|:--:|
| 1 | **marimo** | `marimo edit` — reactive notebook | — | No |
| 2 | **flower** | `celery flower` — Celery task dashboard | — | No |
| 3 | **visdom** | `python -m visdom.server` — live plots | — | No |
| 4 | **gradio** | `gradio` — ML demo UI | — | No |
| 5 | **streamlit** | `streamlit hello` / `streamlit run` | — | No |
| 6 | **nicegui** | `python -m nicegui` — Vue-backed local UI | — | No |
| 7 | **textual-web** | Serves Textual TUIs in the browser | ✓ | No |
| 8 | **localstack-cli** | Local AWS emulator + web console | — | No |

### Desktop GUI (PyQt / PySide — from PyQt topic + PyPI)

| # | Package | App type | PQ / notes | HB |
|---|---------|----------|------------|:--:|
| 1 | **napari** | Multi-dimensional scientific image viewer | PQ-adjacent ecosystem | No |
| 2 | **orange3** | Visual data-mining workbench (`orange-canvas`) | PQ examples ecosystem | No |
| 3 | **bleachbit** | Privacy / disk cleaner GUI | — | No |
| 4 | **gridplayer** | Side-by-side video player | PQ ★1.9k | No |
| 5 | **pypdfeditor-gui** | PDF merge/edit GUI (`pdfeditor`) | PyQt6 | No |
| 6 | **hackedit** | Hackable PyQt5 IDE | PyQt5 | No |
| 7 | **cq-editor** | CadQuery 3D viewer/editor | PQ ★1.1k | No |
| 8 | **TuChart** | Chinese stock charting desktop app | PQ ★800 | No |
| 9 | **rednotebook** | Desktop diary/journal | ⚠️ PyPI may be `RedNotebook` or source-only | No |
| 10 | **beeref** | Reference-image moodboard | PQ ★768; ⚠️ often install from GitHub, not PyPI | No |

**PyQt topic repos that are strong apps but weak pip targets:** `BallonsTranslator`, `Ghost-Downloader-3`, `algobot`, `stargate` (DAW) — use **GitHub URL** + `build-from-source` path unless a PyPI console script is confirmed.

**Skip (HB):** `gaphor`, `spyder`, `mu-editor`, `qutebrowser`, `calibre`, `pymol`, `anki`.

---

## Node.js (npm / bun / deno)

### TUI

| # | Package | Notes | TU | HB |
|---|---------|-------|:--:|:--:|
| 1 | **forage-cli** | npm registry explorer TUI | — | No |
| 2 | **@termly-dev/cli** | Terminal agent hub / TUI mode | — | No |
| 3 | **deputui** | Review/install npm dependency updates | ✓ | No |
| 4 | **@involvex/youtube-music-cli** | Music TUI (needs `mpv` / `yt-dlp`) | — | No |
| 5 | **slap** | Terminal text editor | ✓ | ⚠️ check `slap` formula |

### Web UI

| # | Package | Notes | HB |
|---|---------|-------|:--:|
| 1 | **maildev** | SMTP catcher + web inbox | No |
| 2 | **verdaccio** | Private npm registry + web UI | No |
| 3 | **json-server** | JSON → REST + simple browser UI | No |
| 4 | **browser-sync** | Dev server with live reload UI | No |
| 5 | **pm2** | Process manager + `pm2 monit` web | No |
| 6 | **wetty** | Browser-based terminal over HTTP | No |

**Skip:** `localtunnel`, `http-server`, `serve`, `whistle` (Homebrew).

### Desktop GUI (Electron, Electrobun, NodeGUI, NeutralinoJS, NW.js)

JS/TS desktop GUIs overwhelmingly ship as **DMG/cask releases**, not `npm -g` consumer packages. The `npm-package` generator fits **CLI wrappers** that produce GUI output; real apps need a future **binary-release / cask** generator.

#### Framework map

| Framework | Runtime / library | Global npm CLI? | Typical ship path |
|-----------|-------------------|:---------------:|-------------------|
| **Electron** | `electron` (devDep per project) | `nativefier`, `electron-builder` | DMG / cask |
| **Electrobun** | `electrobun` (Bun + system webview) | `appbun`, `@hehehai/buke` | `bun run build` → `.app` |
| **NodeGUI** | `@nodegui/nodegui` (Qt6) | `@nodegui/packer` (build tool) | packer → binary |
| **NeutralinoJS** | `neutralinojs` + `@neutralinojs/neu` | `neu` (scaffold/build CLI) | `neu build` → binary |
| **NW.js** | `nwjs/nw.js` runtime | `nw-builder` (packager) | NW runtime + app folder |

#### Tier A — `npm-package` generator (real `bin`, not in Homebrew)

| # | Package | Framework | Notes | HB |
|---|---------|-----------|-------|:--:|
| 1 | **nativefier** | Electron | Wrap any URL → `.app`; archived but stable CLI test | No |
| 2 | **appbun** | Electrobun | Pake-like: webpage → Electrobun desktop app (`bin: appbun`) | No |
| 3 | **@hehehai/buke** | Electrobun | Pake-like Electrobun CLI (`bin: buke`) | No |

**Weak npm targets (build tools, not apps):** `electron-builder`, `electron-packager`, `@neutralinojs/neu`, `@nodegui/packer`, `jam-pack-nodegui`.

#### Tier B — real desktop apps, wrong install model (binary / cask path)

| App | Framework | Stars | Install | HB |
|-----|-----------|------:|---------|:--:|
| [webtorrent/webtorrent-desktop](https://github.com/webtorrent/webtorrent-desktop) | Electron | ~10k | DMG releases | No |
| [liriliri/aya](https://github.com/liriliri/aya) | Electron | ~5k | DMG (Android ADB tool) | No |
| [blackboardsh/audio-tts](https://github.com/blackboardsh/audio-tts) | Electrobun | ~150 | `bun run build` | No |
| [Grasscutters/GrassClipper](https://github.com/Grasscutters/GrassClipper) | NeutralinoJS | ~500 | `neu build` | No |
| [AppleBlox/appleblox](https://github.com/AppleBlox/appleblox) | NeutralinoJS | ~170 | DMG releases | No |
| [ruslang02/discord-qt](https://github.com/ruslang02/discord-qt) | NodeGUI | ~210 | build from source | No |
| [SchizoDuckie/DuckieTV](https://github.com/SchizoDuckie/DuckieTV) | NW.js | ~1.2k | packaged NW app | No |

#### Tier C — skip (already in Homebrew casks)

| Cask | App | Framework |
|------|-----|-----------|
| `mark-text` | MarkText | Electron |
| `ytmdesktop-youtube-music` | YouTube Music Desktop | Electron |
| `caprine` | Caprine (Messenger) | Electron |
| `streamlink-twitch-gui` | Streamlink Twitch GUI | NW.js |
| `tiddly` | TiddlyWiki Desktop | NW.js |

Also skip famous `topic:electron` hits: VS Code, Joplin, Motrix, AFFiNE, draw.io, Insomnia, Trilium, etc.

#### GitHub queries used

| Query | What it surfaces |
|-------|------------------|
| `topic:electron stars:>500` | Editors, notes apps, download managers |
| `topic:electron-app stars:>1000` | Packaged consumer Electron apps |
| `topic:electrobun` | Framework + tiny demos (`audio-tts`, `appbun` source) |
| `topic:nodegui` | Mostly bindings; apps: `discord-qt`, `TenCha` |
| `topic:neutralinojs` | `GrassClipper`, `AppleBlox`, eval/docs repos |
| `topic:nwjs` | `streamlink-twitch-gui`, `TiddlyDesktop`, `DuckieTV` |
| npm search `electrobun`, `nodegui` | CLIs and scaffolds, not end-user apps |

**Takeaway:** For npm allbrew tests, prefer **TUIs and local web servers** above. Desktop GUI coverage = **`nativefier` + `appbun` (+ optional `buke`)** on the npm path; keep Tier B for future cask/binary generators.

---

## C# / .NET (`dotnet tool install -g` / NuGet)

Requires **`dotnet` SDK** (Homebrew `dotnet` formula). Global tools install to `~/.dotnet/tools` and need that directory on `PATH`.

.NET **consumer GUIs** almost never ship as `dotnet tool install`; NuGet global tools are mostly **CLIs and local web servers**. Real windowed apps ship as **GitHub release `.dmg` / `.app`**.

### TUI

| Library | Stars | Role | NuGet global tool? |
|---------|------:|------|:------------------:|
| [gui-cs/Terminal.Gui](https://github.com/gui-cs/Terminal.Gui) | ~11k | Full TUI toolkit | No — source build |
| [spectreconsole/spectre.console](https://github.com/spectreconsole/spectre.console) | ~11k | Rich console / prompts (not full TUI) | Library only |
| [RazorConsole/RazorConsole](https://github.com/RazorConsole/RazorConsole) | ~1.7k | Agentic TUI framework (Spectre + Razor) | No |

Almost no popular .NET TUIs ship as **`dotnet tool install`**. For TUI coverage, prefer **Rust/npm** columns. Terminal.Gui apps are typically built from GitHub source.

### Web UI (local server → browser)

| # | PackageId | Command | Notes | HB |
|---|-----------|---------|-------|:--:|
| 1 | **Rnwood.Smtp4dev** | `smtp4dev` | Fake SMTP + web inbox; **recommended macOS install path** | No |
| 2 | **dotnet-serve** | `dotnet-serve` | Static file HTTP server (minimal UI) | No |

**Skip:** Docker-only paths for smtp4dev unless testing container formulas.

### Desktop GUI (Avalonia, MAUI, Uno Platform, WPF)

#### Framework map

| Framework | Runtime / library | macOS desktop? | Global dotnet CLI? | Typical ship path |
|-----------|-------------------|:--------------:|:------------------:|-------------------|
| **Avalonia** | `AvaloniaUI/Avalonia` | **Yes** (primary cross-platform .NET GUI) | templates only | `.dmg` / releases |
| **.NET MAUI** | `dotnet/maui` | **Yes** (Mac Catalyst; experimental AppKit in `dotnet/maui-labs`) | workload / templates | `.app` / store |
| **Uno Platform** | `unoplatform/uno` | **Yes** | SDK / templates | releases |
| **WPF / WinForms** | `topic:wpf` | **No** (Windows-only) | — | skip macOS matrix |
| **Blazor Hybrid** | `BlazorWebView`, embedio | **Yes** | — | published binary |
| **Avalonia.Controls.Maui** | MAUI + drawn Avalonia controls | **Yes** (Linux/WASM/macOS AppKit) | NuGet per project | per-app build |

#### Tier A — future `dotnet-tool` / `nuget-package` generator (real `bin`, not in Homebrew)

| # | PackageId | Command | UI type | Notes | HB |
|---|-----------|---------|---------|-------|:--:|
| 1 | **Rnwood.Smtp4dev** | `smtp4dev` | Web | SMTP catcher + browser UI (see Web UI above) | No |
| 2 | **ilspycmd** | `ilspycmd` | CLI | .NET decompiler; clean `DotnetTool` test | No |
| 3 | **DepotDownloader** | `DepotDownloader` | CLI | Steam depot downloader | No |
| 4 | **dotnet-serve** | `dotnet-serve` | Web (minimal) | Simple static HTTP server | No |

**Weak dotnet targets (dev tools, not apps):** `dotnet-format`, `docfx`, `nswag.consolecore`, `dotnet-reportgenerator-globaltool`.

#### Tier B — real desktop apps, wrong install model (binary / cask path)

| App | Framework | Stars | Install | HB |
|-----|-----------|------:|---------|:--:|
| [d2phap/ImageGlass](https://github.com/d2phap/ImageGlass) | Avalonia | ~13k | DMG/releases | No |
| [stakira/OpenUtau](https://github.com/stakira/OpenUtau) | Avalonia | ~4k | `.dmg` (arm64/x64) | No |
| [Ruben2776/PicView](https://github.com/Ruben2776/PicView) | Avalonia | ~3k | releases | No |
| [BeyondDimension/SteamTools](https://github.com/BeyondDimension/SteamTools) | Avalonia | ~26k | releases (Watt Toolkit) | No |
| [Sylinko/Everywhere](https://github.com/Sylinko/Everywhere) | Avalonia | ~6k | releases | No |
| [icsharpcode/AvaloniaILSpy](https://github.com/icsharpcode/AvaloniaILSpy) | Avalonia | ~1.8k | GUI decompiler binary | No |
| [ShareX/XerahS](https://github.com/ShareX/XerahS) | Avalonia | ~230+ | early dev; macOS builds | No |
| [Eppie-io/Eppie-App](https://github.com/Eppie-io/Eppie-App) | Uno Platform | ~390 | releases | No |

**MAUI note:** `topic:maui` is dominated by toolkits and workshops ([CommunityToolkit/Maui](https://github.com/CommunityToolkit/Maui), `dotnet-maui-workshop`). Few standalone consumer desktop apps; [microsoft/dotnet-podcasts](https://github.com/microsoft/dotnet-podcasts) is a reference app only.

**WPF skip:** `ScreenToGif`, `Playnite`, `EarTrumpet` — Windows-only despite high stars on `topic:wpf`.

#### Tier C — skip (already in Homebrew)

| Cask / formula | App | Framework |
|----------------|-----|-----------|
| `stability-matrix` | Stability Matrix | Avalonia |
| `sourcegit` | SourceGit | Avalonia |
| `git-credential-manager` | Git Credential Manager | — |
| `dotnet` | .NET SDK | dependency, not an app |

#### GitHub queries used

| Query | What it surfaces |
|-------|------------------|
| `topic:avalonia stars:>500` | ImageGlass, StabilityMatrix, SteamTools, Everywhere, downkyicore |
| `topic:maui stars:>500` | Mostly toolkits; few consumer apps |
| `topic:uno-platform` | Eppie-App, Mapsui (library) |
| `topic:wpf stars:>500` | Windows-only apps (exclude from macOS) |
| `language:C# avalonia stars:>1000 NOT AvaloniaUI/` | Consumer Avalonia apps |
| NuGet `DotnetTool` audit | `ilspycmd`, `Rnwood.Smtp4dev`, `DepotDownloader` |
| [avaloniaui.net/showcase](https://avaloniaui.net/showcase) | Curated production Avalonia apps |

**Takeaway:** **Avalonia** is the PyQt/Electron equivalent for .NET desktop. Best NuGet generator tests = **`Rnwood.Smtp4dev`** (web) + **`ilspycmd`** / **`DepotDownloader`** (CLI). GUI depth = Tier B Avalonia binaries.

---

## Rust (cargo install)

### TUI — heavy overlap with awesome-tuis

| # | Crate / repo | Category in awesome-tuis | HB |
|---|--------------|--------------------------|:--:|
| 1 | **gitat** | Development (git) | No |
| 2 | **lzgit** | Development (git) | No |
| 3 | **vig** | Development (git) | No |
| 4 | **diff-tui** (`difftui`) | Development (diff) | No |
| 5 | **hackernews_tui** | Web | No |
| 6 | **cargo-seek** | Development (crate browser) | No |
| 7 | **otel-tui** | Dashboards (OpenTelemetry) | No |
| 8 | **gobang** | Dashboards (DB admin) | No |
| 9 | **dbee** | Development (DB browser) | No |
| 10 | **ddv** | Development (DynamoDB) | No |
| 11 | **froggit** | Development (git) | No |
| 12 | **gitv** | Development (GitHub issues) | No |
| 13 | **sqlit** | Development (SQL, lazygit-style) | No |
| 14 | **logradar** | Development (log filtering) | No |
| 15 | **amtui** | Development (Alertmanager) | No |
| 16 | **gh-dash** | Dashboards (GitHub PRs) | No |
| 17 | **fubar** | Dashboards (GTFOBins) | No |
| 18 | **act3** | Development (GitHub Actions) | No |

**Skip (HB):** `lazygit`, `gitui`, `btop`, `yazi`, `atuin`, `k9s`, `lazydocker`, `ctop`, `fzf`, `trippy`, `gping`, `bottom`, `bandwhich`, `procs`, `macmon`, `slumber`, `rainfrog`, `ATAC`, `serie`, `resterm`, `dblab`, `jqp`, `soft-serve`, `superfile`, `chdig`, `gonzo`.

### Web UI

| # | Project | Notes | HB |
|---|---------|-------|:--:|
| 1 | **snips.sh** | SSH pastebin + web UI | ⚠️ |
| 2 | **meilisearch** | Search + dashboard | **Yes** |
| 3 | **filebrowser** | File manager over HTTP | **Yes** |

For Rust-web gaps, prefer Go options (`keel`, `homestead`).

### Desktop GUI (egui, iced, Slint, Dioxus — library-first)

| Library | Example apps (not HB) | Install |
|---------|----------------------|---------|
| **egui** | Ferrite, dockeye, kiorg, zu1k/translator | `cargo install` / GitHub |
| **iced** | Sniffnet | `cargo install sniffnet` |
| **Slint** | cargo-ui, image-sieve | GitHub releases |
| **Dioxus** | — | mostly framework / web |

Very few Rust consumer GUIs are both `cargo install` and not in Homebrew:

| # | Project | Library | Notes | HB |
|---|---------|---------|-------|:--:|
| 1 | **sniffnet** | iced | Network monitor GUI | No |
| 2 | **rio** | — | GPU terminal (GUI window) | ⚠️ check |
| 3 | **neovide** | — | Neovim GUI | **Yes** |
| 4 | **alacritty** | — | GPU terminal | **Yes** |

Treat Rust **GUI** formula tests as lower priority unless using **Sniffnet** or a confirmed `cargo install` egui app; Rust coverage is strongest for **TUIs** from awesome-tuis.

---

## Go (`go install`)

### TUI

| # | Module | awesome-tuis section | HB |
|---|--------|------------------------|:--:|
| 1 | `github.com/F1bonacc1/process-compose` | Dashboards | No |
| 2 | `github.com/robinovitch61/wander` | Dashboards (Nomad) | No |
| 3 | `github.com/hashicorp/damon` | Dashboards (Nomad) | No |
| 4 | `github.com/franckverrot/trek` | Dashboards (Nomad) | No |
| 5 | `github.com/rasjonell/dashbrew` | Dashboards (custom dashboards) | No |
| 6 | `github.com/MAIF/yozefu` | Dashboards (Kafka) | No |
| 7 | `github.com/mrusme/planor` | Dashboards (cloud) | No |
| 8 | `github.com/Sachamama/sacha` | Dashboards (AWS) | No |
| 9 | `github.com/clawscli/claws` | Dashboards (AWS) | No |
| 10 | `github.com/Owloops/updo` | Dashboards (uptime) | No |
| 11 | `github.com/jessfraz/tdash` | Dashboards (CI/analytics) | No |

**Skip (HB):** `oxker`, `lazysql`, `ggc`, `surge`, `k9s`, `lazydocker`, `ctop`, `fzf`.

### Web UI

| # | Module | Notes | HB |
|---|--------|-------|:--:|
| 1 | `github.com/getkaze/keel` | Docker dashboard, single binary | No |
| 2 | `github.com/haydenk/homestead` | Homelab start page + health checks | No |
| 3 | `github.com/Happyfunnysad/Dashgo` | Docker dashboard (arm64-friendly) | No |
| 4 | `github.com/wbw1537/synapse` | Homelab push-dashboard | No |
| 5 | `github.com/tdebuilt/Nidus-Dashboard` | Container/Proxmox/HA dashboard | No |

**Skip:** `pocketbase`, `gogs`, `hugo`, `caddy`, `gitea`, `miniflux`, `adguard` (Homebrew).

### Desktop GUI (Fyne, Wails — library-first)

| Library | Example apps (not HB) | Install |
|---------|----------------------|---------|
| **Fyne** | rymdport, supersonic, janice | [apps.fyne.io](https://apps.fyne.io/all.html), `fyne.io/apps` |
| **Wails** | keel-adjacent dashboards, many dev tools | `go install` / releases |
| **Gio / gotk3** | few standalone consumer apps | source build |

Go rarely ships consumer desktop GUIs via `go install`. Best GUI stress tests are **Fyne apps from apps.fyne.io** (binary install) or **Python/PyQt** on the package-manager path.

---

## Ruby (gem install)

Thin ecosystem for standalone apps. Most gems are libraries or Rails plugins.

### TUI

| # | Gem | Notes | HB |
|---|-----|-------|:--:|
| 1 | **license_finder** | Dependency license audit CLI | ⚠️ |
| 2 | **taskjuggler** | Project scheduling CLI/TUI | ⚠️ |
| 3 | **rougify** | Syntax-highlight pager (borderline) | — |

### Web UI

| # | Gem | Notes | HB |
|---|-----|-------|:--:|
| 1 | **mailcatcher-ng** | SMTP + web UI (maintained fork) | ⚠️ vs `mailcatcher` cask |
| 2 | **resque** | Queue + Sinatra web UI (needs Redis) | ⚠️ |
| 3 | **gollum** | Git-powered wiki server | **Yes** |

### Desktop GUI

No solid set of 5 popular gem-distributed desktop GUIs without Homebrew. Ruby is the weakest column for this matrix.

---

## Swift (SPM / Mint)

No first-class `swift install`; use **Mint** (`mint install org/repo`) or build from `Package.swift`.

### TUI

| # | Tool | Install | HB |
|---|------|---------|:--:|
| 1 | **yonaskolb/mint** | Meta — installs other Swift CLIs | **Yes** |
| 2 | **vapor/toolbox** (`vapor`) | Vapor project CLI | ⚠️ |
| 3 | **JohnSundell/Marathon** | Swift script runner | archived |
| 4 | **mxcl/swift-sh** | `swift sh` scripts | tap/brew |
| 5 | **peripheryapp/periphery** | Unused-code scanner | **Yes** |

### Web UI / Desktop GUI

Swift SPM tools are almost all **dev CLIs** or **app frameworks**, not pip-like consumer apps. Treat Swift as **future allbrew generator** work.

---

## Recommended minimum test suite (~30 high-value cases)

Prioritize **coverage over count** — these hit distinct generator edge cases.

### Tier A — package-manager formulas (allbrew native)

| UI | Python | npm | .NET | Rust | Go |
|----|--------|-----|------|------|-----|
| **TUI** | `s-tui`, `castero`, `pudb`, `frogmouth`, `termtools-tui` | `forage-cli`, `deputui`, `@termly-dev/cli` | — (use Rust/npm) | `gitat`, `lzgit`, `cargo-seek`, `gh-dash`, `otel-tui` | `process-compose`, `wander`, `dashbrew`, `yozefu`, `updo` |
| **Web** | `marimo`, `gradio`, `streamlit`, `flower`, `textual-web` | `maildev`, `verdaccio`, `json-server`, `wetty`, `pm2` | `Rnwood.Smtp4dev` | — (use Go) | `keel`, `homestead`, `Dashgo`, `synapse`, `Nidus-Dashboard` |
| **GUI** | `napari`, `orange3`, `gridplayer`, `pypdfeditor-gui`, `cq-editor` | `nativefier`, `appbun` | `ilspycmd` (+ Avalonia binaries) | `sniffnet` | — (Fyne binaries) |

### Tier B — awesome-tuis extras

- **Games:** `pokete` (Python), `chess-tui` (Rust)
- **Dev:** `sqlit`, `dbee`, `ddv`, `froggit`, `logradar` (Rust)
- **Docker:** `d4s`, `ducker`, `docker-dash` (verify HB + `go install` path)
- **Editors:** `markln` (Textual — ⚠️ PyPI name)

### Tier C — PyQt topic (desktop GUI depth)

Add after Tier A GUI passes:

1. `bleachbit` — system integration / GTK+Qt mix
2. `hackedit` — PyQt5 IDE, plugin entry points
3. `TuChart` — niche but real PyQt5 desktop app
4. `beeref` — GitHub-sourced PyQt6 (tests non-PyPI URL flow)
5. `rednotebook` — diary app (confirm PyPI/install path first)

### Tier C — JS/TS desktop (binary / cask path, future generator)

Reserve for when allbrew supports GitHub-release or cask formulas:

1. `webtorrent-desktop` — Electron, popular, not in HB
2. `aya` — Electron ADB desktop tool
3. `GrassClipper` / `AppleBlox` — NeutralinoJS, macOS-native
4. `discord-qt` — NodeGUI, Qt-native Discord client
5. `DuckieTV` — NW.js TV tracker

### Tier C — .NET desktop (binary / cask path, future generator)

Reserve for when allbrew supports GitHub-release or cask formulas:

1. `ImageGlass` — Avalonia image viewer, popular, not in HB
2. `OpenUtau` — Avalonia singing synthesis, `.dmg` releases
3. `SteamTools` (Watt Toolkit) — Avalonia Steam toolbox
4. `PicView` / `Everywhere` — smaller Avalonia desktop apps
5. `AvaloniaILSpy` — GUI decompiler (pairs with `ilspycmd` CLI)

---

## What the Google/Gemini list got wrong

| Suggested | Problem |
|-----------|---------|
| `glances`, `ranger`, `lazygit`, `btop`, `yazi`, `k9s`, `fzf`, `meilisearch`, `pocketbase`, `hugo`, `alacritty`, `neovide` | Already in Homebrew |
| `textual-demo`, `electron-forge`, `wails`, `fyne`, `bubbletea` | Libraries / build tools, not apps |
| `marktext`, `ytmdesktop`, `caprine`, `streamlink-twitch-gui` | In Homebrew as casks — not npm-global anyway |
| Most `topic:electron` apps (VS Code, Joplin, Motrix) | Cask/DMG distribution, not `npm -g` |
| `@neutralinojs/neu`, `electron-builder` | Framework / packager CLIs, not end-user apps |
| `sidekiq`, `resque` (standalone) | Libraries; web UI needs a running app stack |
| `httpie` as “web UI” | CLI first; desktop app is separate |
| `lector` on PyPI | Name collision — PyPI `lector` ≠ ebook reader |
| Swift “web frameworks” (Hummingbird, Kitura) | Frameworks, not installable apps |
| `Playnite`, `ScreenToGif`, `EarTrumpet` | WPF — Windows-only, not macOS test targets |
| `stability-matrix`, `sourcegit` | Avalonia apps already in Homebrew casks |
| Most Avalonia / MAUI consumer apps | `.dmg` / releases, not `dotnet tool install -g` |

---

## Practical test workflow

```bash
# 1. Generate (example)
allbrew https://pypi.org/project/marimo/ --name marimo --manual  # pick pip-package

# 2. Install from your tap
brew install marimo

# 3. Exercise UI type
marimo edit                    # Web
s-tui                          # TUI
orange-canvas                  # GUI (orange3)
nativefier 'example.com'       # npm GUI wrapper (Electron)
appbun https://example.com     # npm GUI wrapper (Electrobun)
smtp4dev                       # .NET web UI (NuGet global tool)
ilspycmd assembly.dll -o out/  # .NET CLI global tool
```

For awesome-tuis Rust entries, prefer **GitHub release URL** when `cargo install` is slow — but for **generator** testing, the GitHub/crates.io URL is the right input.

---

## Selection criteria (reference)

1. **Standalone app** — has a console entry point or obvious `bin` to run; not a library imported by other projects.
2. **Globally installable** — distributed via the ecosystem’s package manager (`pip`/`pipx`/`uv`, `npm -g`, `dotnet tool install -g`, `cargo install`, `go install`, `gem install`, Mint).
3. **macOS-compatible** — documented or implied support for macOS (darwin/arm64).
4. **Not in Homebrew** — `brew info <name>` returns no formula/cask (as of research date).
5. **UI type** — TUI (interactive terminal), Web (local HTTP server + browser), or Desktop GUI (native/Qt window).
