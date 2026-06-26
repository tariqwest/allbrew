# Allbrew test cases — combined master table

> Extracted from [allbrew-test-cases-deep-research-2026-06.md](./allbrew-test-cases-deep-research-2026-06.md).
> That document contains the full research narrative, per-ecosystem tables, and
> generator-coverage analysis. This file is the single consolidated table of every app.

Every app broken out across the section tables in the deep-research document, unified
into one row per app with presence/identifier columns. Blank cell = not applicable or
not found. `in_*` columns include the identifier or URL where known.

**Data provenance & normalization (June 2026 pass):**
- **`in_github` repos are API-verified.** Every GitHub repo was checked for existence; registry-derived
  rows (pip/npm/cargo) use the canonical repository URL reported by the PyPI / npm / crates.io APIs.
  This corrected ~34 wrong or fabricated repos (e.g. `flower` → `mher/flower`, not the federated-learning
  `flwr`; `oatmeal` → `dustinblackman/oatmeal`; `browsr` → `juftin/browsr`; `krokiet` ships from the
  `qarmin/czkawka` monorepo). Repos that resolve only via redirect are listed at their canonical name.
- **Every row has exactly 23 columns** (a prior version had column-shift in ~69 rows; realigned here).
- **Controlled vocabularies:** `has_prebuilt_bin_dist` ∈ { blank, `yes`, `yes (N)` (N = binary assets on
  latest release), `tags only` (tagged releases, no prebuilt binaries detected), `none` (no releases) };
  `has_script_install` ∈ { blank, install-script URL }; `is_*` / `has_source_dist` ∈ { blank, `yes` };
  `is_cask_dist` = the `.dmg`/`.zip`/`.pkg` artifact name; `in_homebrew` = `<token> (formula|cask)`.
- **Closed-source / off-GitHub apps** carry a blank `in_github` with the reason in `notes`
  (e.g. Docker Desktop = closed-source; electrum = signed builds hosted off-GitHub; eric-ide = hosted on
  eric-ide.python-projects.org).

| app | lang/runtime | framework | in_dev_website | in_github | in_homebrew | in_mas | in_npm | in_pip | in_cargo | in_go_mod | in_ruby_gem | in_swiftpm | in_mint | in_dotnet | is_tui_app | is_gui_app | is_webui_app | is_cask_dist | has_source_dist | has_prebuilt_bin_dist | has_script_install | notes |
|-----|------|-----------|---------------|-----------|-------------|--------|--------|--------|----------|-----------|------------|------------|---------|-----------|-----------|-----------|-------------|--------------|-----------------|----------------------|--------------------|-------|
| browsr | Python | Textual |  | github.com/juftin/browsr |  |  |  | pypi.org/project/browsr |  |  |  |  |  |  | yes |  |  |  | yes |  |  |  |
| elia | Python | Textual |  | github.com/darrenburns/elia |  |  |  | pypi.org/project/elia-chat |  |  |  |  |  |  | yes |  |  |  | yes |  |  | cmd `elia`; bin `elia`; pkg is elia-chat |
| toolong | Python | Textual |  | github.com/Textualize/toolong |  |  |  | pypi.org/project/toolong |  |  |  |  |  |  | yes |  |  |  | yes |  |  | cmd `tl` |
| baca | Python | Textual |  | github.com/wustho/baca |  |  |  | pypi.org/project/baca |  |  |  |  |  |  | yes |  |  |  | yes |  |  | EPUB reader |
| kupo | Python | Textual |  | github.com/darrenburns/kupo |  |  |  | pypi.org/project/kupo |  |  |  |  |  |  | yes |  |  |  | yes |  |  |  |
| gitsimulator | Python | Textual |  | github.com/egekaya1/GitSimulator |  |  |  | pypi.org/project/gitsimulator |  |  |  |  |  |  | yes |  |  |  | yes |  |  |  |
| s-tui | Python | urwid |  | github.com/amanusk/s-tui |  |  |  | pypi.org/project/s-tui |  |  |  |  |  |  | yes |  |  |  | yes |  |  | CPU monitor |
| castero | Python | Textual |  | github.com/xgi/castero |  |  |  | pypi.org/project/castero |  |  |  |  |  |  | yes |  |  |  | yes |  |  | podcast client |
| pudb | Python | urwid |  | github.com/inducer/pudb |  |  |  | pypi.org/project/pudb |  |  |  |  |  |  | yes |  |  |  | yes |  |  | visual debugger |
| frogmouth | Python | Textual |  | github.com/Textualize/frogmouth |  |  |  | pypi.org/project/frogmouth |  |  |  |  |  |  | yes |  |  |  | yes |  |  | Markdown browser |
| euporie | Python | Textual |  | github.com/joouha/euporie |  |  |  | pypi.org/project/euporie |  |  |  |  |  |  | yes |  |  |  | yes |  |  | cmd `euporie-notebook` |
| pokete | Python | urwid |  | github.com/lxgr-linux/pokete |  |  |  | pypi.org/project/pokete |  |  |  |  |  |  | yes |  |  |  | yes |  |  | terminal RPG |
| marimo | Python |  |  | github.com/marimo-team/marimo |  |  |  | pypi.org/project/marimo |  |  |  |  |  |  |  |  | yes |  | yes |  |  | `marimo edit` |
| mlflow | Python |  |  | github.com/mlflow/mlflow |  |  |  | pypi.org/project/mlflow |  |  |  |  |  |  |  |  | yes |  | yes |  |  | `mlflow ui` |
| aim | Python |  |  | github.com/aimhubio/aim |  |  |  | pypi.org/project/aim |  |  |  |  |  |  |  |  | yes |  | yes |  |  | `aim up` |
| label-studio | Python | Django |  | github.com/HumanSignal/label-studio |  |  |  | pypi.org/project/label-studio |  |  |  |  |  |  |  |  | yes |  | yes |  |  | heavy deps |
| chainlit | Python |  |  | github.com/Chainlit/chainlit |  |  |  | pypi.org/project/chainlit |  |  |  |  |  |  |  |  | yes |  | yes |  |  | `chainlit hello` |
| visdom | Python |  |  | github.com/fossasia/visdom |  |  |  | pypi.org/project/visdom |  |  |  |  |  |  |  |  | yes |  | yes |  |  |  |
| streamlit | Python |  |  | github.com/streamlit/streamlit |  |  |  | pypi.org/project/streamlit |  |  |  |  |  |  |  |  | yes |  | yes |  |  | `streamlit hello` |
| flower | Python |  |  | github.com/mher/flower |  |  |  | pypi.org/project/flower |  |  |  |  |  |  |  |  | yes |  | yes |  |  | `celery flower`; Celery dashboard (mher/flower, NOT flwr federated-learning); needs a broker -> service-block test |
| gradio | Python |  |  | github.com/gradio-app/gradio |  |  |  | pypi.org/project/gradio |  |  |  |  |  |  |  |  | yes |  | yes |  |  | needs script |
| napari | Python | Qt |  | github.com/napari/napari |  |  |  | pypi.org/project/napari |  |  |  |  |  |  |  | yes |  |  | yes |  |  | n-D image viewer; Qt + heavy sci stack -> resource/SHA stress |
| orange3 | Python | Qt |  | github.com/biolab/orange3 |  |  |  | pypi.org/project/Orange3 |  |  |  |  |  |  |  | yes |  |  | yes |  |  | cmd `orange-canvas`; bin `orange-canvas` != package name |
| bleachbit | Python | GTK |  | github.com/bleachbit/bleachbit |  |  |  | pypi.org/project/BleachBit |  |  |  |  |  |  |  | yes |  |  | yes |  |  | disk cleaner |
| gridplayer | Python | Qt |  | github.com/vzhd1701/gridplayer |  |  |  | pypi.org/project/GridPlayer |  |  |  |  |  |  |  | yes |  |  | yes |  |  | needs `mpv`; needs `mpv` runtime dep |
| cq-editor | Python | Qt |  | github.com/CadQuery/CQ-editor |  |  |  | pypi.org/project/CQ-editor |  |  |  |  |  |  |  | yes |  |  | yes |  |  | CadQuery 3D; Qt + OpenGL |
| friture | Python | Qt |  | github.com/tlecomte/friture |  |  |  | pypi.org/project/friture |  |  |  |  |  |  |  | yes |  |  | yes |  |  | audio analyzer |
| eric-ide | Python | Qt |  |  |  |  |  | pypi.org/project/eric-ide |  |  |  |  |  |  |  | yes |  |  | yes |  |  | cmd `eric7`; bin `eric7` != package; project hosted off-GitHub (eric-ide.python-projects.org) |
| beeref | Python | Qt |  | github.com/rbreu/beeref |  |  |  | pypi.org/project/beeref |  |  |  |  |  |  |  | yes |  |  | yes |  |  | GitHub-sourced; often GitHub-sourced, not PyPI -> tests non-registry flow |
| pypdfeditor-gui | Python | Qt |  | github.com/Augus1999/pyPDFeditor-GUI |  |  |  | pypi.org/project/PyPDFEditor-GUI |  |  |  |  |  |  |  | yes |  |  | yes |  |  | cmd `pdfeditor` |
| FMPy | Python | PySide |  | github.com/CATIA-Systems/FMPy |  |  |  | pypi.org/project/FMPy |  |  |  |  |  |  |  | yes |  |  | yes |  |  | cmd `fmpy gui`; bin `fmpy gui`; found via dep-graph |
| tabulous | Python | Qt |  | github.com/hanjinliu/tabulous |  |  |  | pypi.org/project/tabulous |  |  |  |  |  |  |  | yes |  |  | yes |  |  | spreadsheet viewer |
| pyNastran | Python | Qt |  | github.com/SteveDoyle2/pyNastran |  |  |  | pypi.org/project/pyNastran |  |  |  |  |  |  |  | yes |  |  | yes |  |  | cmd `pyNastranGUI`; bin `pyNastranGUI`; extras install |
| pyqt-openai | Python | PyQt6 |  | github.com/yjg30737/pyqt-openai |  |  |  | pypi.org/project/pyqt-openai |  |  |  |  |  |  |  | yes |  |  | yes |  |  | VividNode |
| caliscope | Python | PySide6 |  | github.com/mprib/caliscope |  |  |  | pypi.org/project/caliscope |  |  |  |  |  |  |  | yes |  |  | yes |  |  | motion-capture |
| pry | Ruby |  |  | github.com/pry/pry |  |  |  |  |  |  | rubygems.org/gems/pry |  |  |  | yes |  |  |  | yes |  |  | interactive Ruby REPL/console; clean bin test |
| taskjuggler | Ruby |  |  | github.com/taskjuggler/TaskJuggler |  |  |  |  |  |  | rubygems.org/gems/taskjuggler |  |  |  | yes |  |  |  | yes |  |  | project scheduler; cmd `tj3` |
| license_finder | Ruby |  |  | github.com/pivotal/LicenseFinder |  |  |  |  |  |  | rubygems.org/gems/license_finder |  |  |  | yes |  |  |  | yes |  |  | dependency license audit CLI; borderline TUI |
| smashing | Ruby | Sinatra |  | github.com/Smashing/smashing |  |  |  |  |  |  | rubygems.org/gems/smashing |  |  |  |  |  | yes |  | yes |  |  | maintained Dashing fork; `smashing start` |
| geminabox | Ruby | Sinatra |  | github.com/geminabox/geminabox |  |  |  |  |  |  | rubygems.org/gems/geminabox |  |  |  |  |  | yes |  | yes |  |  | private gem server with web UI |
| rubio-radio | Ruby | LibUI |  | github.com/kojix2/rubio-radio |  |  |  |  |  |  | rubygems.org/gems/rubio-radio |  |  |  |  | yes |  |  | yes |  |  | LibUI radio player; sole dep glimmer-dsl-libui |
| adamantite | Ruby | LibUI |  | github.com/jakebruemmer/adamantite |  |  |  |  |  |  | rubygems.org/gems/adamantite |  |  |  |  | yes |  |  | yes |  |  | local password-manager desktop GUI |
| htsgrid | Ruby | LibUI |  | github.com/kojix2/htsgrid |  |  |  |  |  |  | rubygems.org/gems/htsgrid |  |  |  |  | yes |  |  | yes |  |  | genomics table viewer GUI |
| taskbook | Node |  |  | github.com/klaussinani/taskbook |  |  | npmjs.com/package/taskbook |  |  |  |  |  |  |  | yes |  |  |  | yes |  |  | cmd `tb`; bin `tb` != package name |
| vtop | Node |  |  | github.com/MrRio/vtop |  |  | npmjs.com/package/vtop |  |  |  |  |  |  |  | yes |  |  |  | yes |  |  | activity monitor |
| npm-check | Node |  |  | github.com/dylang/npm-check |  |  | npmjs.com/package/npm-check |  |  |  |  |  |  |  | yes |  |  |  | yes |  |  | `npm-check -u`; != npm-check-updates (which is in HB) |
| npkill | Node |  |  | github.com/zaldih/npkill |  |  | npmjs.com/package/npkill |  |  |  |  |  |  |  | yes |  |  |  | yes |  |  | node_modules cleaner |
| deputui | Node |  |  | github.com/twiddler/deputui |  |  | npmjs.com/package/deputui |  |  |  |  |  |  |  | yes |  |  |  | yes |  |  | dep updater |
| forage-cli | Node |  |  | github.com/starmorph/forage-cli |  |  | npmjs.com/package/forage-cli |  |  |  |  |  |  |  | yes |  |  |  | yes |  |  | cmd `forage` |
| dirac | Node | Ink | dirac.run | github.com/dirac-run/dirac |  |  | npmjs.com/package/dirac-cli |  |  |  |  |  |  |  | yes |  |  |  | yes |  |  | cmd `dirac`; bin `dirac` != package name `dirac-cli`; Apache-2.0 |
| cline | Node | OpenTUI | cline.bot | github.com/cline/cline | cline (formula, deprecated) |  | npmjs.com/package/cline |  |  |  |  |  |  |  | yes |  |  |  | yes | yes |  | AI coding agent TUI; deprecated in HB (non-FOSS dep + prebuilt bins); 64k stars; Apache-2.0; platform bins via optionalDeps |
| maildev | Node |  |  | github.com/maildev/maildev |  |  | npmjs.com/package/maildev |  |  |  |  |  |  |  |  |  | yes |  | yes |  |  | SMTP catcher + web inbox |
| verdaccio | Node |  |  | github.com/verdaccio/verdaccio |  |  | npmjs.com/package/verdaccio |  |  |  |  |  |  |  |  |  | yes |  | yes |  |  | private npm registry + web UI |
| json-server | Node |  |  | github.com/typicode/json-server |  |  | npmjs.com/package/json-server |  |  |  |  |  |  |  |  |  | yes |  | yes |  |  | JSON->REST + browser UI; `json-server db.json` |
| wetty | Node |  |  | github.com/butlerx/wetty |  |  | npmjs.com/package/wetty |  |  |  |  |  |  |  |  |  | yes |  | yes |  |  | browser terminal over HTTP |
| browser-sync | Node |  |  | github.com/BrowserSync/browser-sync |  |  | npmjs.com/package/browser-sync |  |  |  |  |  |  |  |  |  | yes |  | yes |  |  | dev server + live-reload UI; `browser-sync start` |
| pm2 | Node |  |  | github.com/Unitech/pm2 |  |  | npmjs.com/package/pm2 |  |  |  |  |  |  |  |  |  | yes |  | yes |  |  | process manager + monitoring UI; `pm2 monit` |
| markserv | Node |  |  | github.com/markserv/markserv |  |  | npmjs.com/package/markserv |  |  |  |  |  |  |  |  |  | yes |  | yes |  |  | serve markdown/dirs as live web |
| docsify-cli | Node |  |  | github.com/docsifyjs/docsify-cli |  |  | npmjs.com/package/docsify-cli |  |  |  |  |  |  |  |  |  | yes |  | yes |  |  | docs site server; bin `docsify` |
| tiddlywiki | Node |  |  | github.com/TiddlyWiki/TiddlyWiki5 |  |  | npmjs.com/package/tiddlywiki |  |  |  |  |  |  |  |  |  | yes |  | yes |  |  | self-hosted wiki; distinct from `tiddly` cask (NW.js desktop) |
| clinic | Node |  |  | github.com/clinicjs/node-clinic |  |  | npmjs.com/package/clinic |  |  |  |  |  |  |  |  |  | yes |  | yes |  |  | perf flamegraphs in browser; `clinic doctor` |
| nativefier | Node | Electron |  | github.com/nativefier/nativefier |  |  | npmjs.com/package/nativefier |  |  |  |  |  |  |  |  | yes |  |  | yes |  |  | wrap any URL into an Electron .app |
| appbun | Node | Electrobun |  | github.com/bigmacfive/appbun |  |  | npmjs.com/package/appbun |  |  |  |  |  |  |  |  | yes |  |  | yes |  |  | webpage->app wrapper |
| @hehehai/buke | Node | Electrobun |  | github.com/hehehai/buke |  |  | npmjs.com/package/@hehehai/buke |  |  |  |  |  |  |  |  | yes |  |  | yes |  |  | Electrobun CLI; bin `buke` |
| oatmeal | Rust | ratatui |  | github.com/dustinblackman/oatmeal |  |  |  |  | crates.io/crates/oatmeal |  |  |  |  |  | yes |  |  |  | yes |  |  | LLM chat TUI |
| managarr | Rust | ratatui |  | github.com/Dark-Alex-17/managarr |  |  |  |  | crates.io/crates/managarr |  |  |  |  |  | yes |  |  |  | yes |  |  | Servarr manager |
| manga-tui | Rust | ratatui |  | github.com/josueBarretogit/manga-tui |  |  |  |  | crates.io/crates/manga-tui |  |  |  |  |  | yes |  |  |  | yes |  |  | manga reader |
| twitch-tui | Rust | ratatui |  | github.com/Xithrius/twitch-tui |  |  |  |  | crates.io/crates/twitch-tui |  |  |  |  |  | yes |  |  |  | yes |  |  | Twitch chat |
| tickrs | Rust | ratatui |  | github.com/tarkah/tickrs |  |  |  |  | crates.io/crates/tickrs |  |  |  |  |  | yes |  |  |  | yes |  |  | stock ticker |
| nostui | Rust | ratatui |  | github.com/akiomik/nostui |  |  |  |  | crates.io/crates/nostui |  |  |  |  |  | yes |  |  |  | yes |  |  | Nostr client |
| gobang | Rust | ratatui |  | github.com/TaKO8Ki/gobang |  |  |  |  | github.com/TaKO8Ki/gobang |  |  |  |  |  | yes |  |  |  | yes |  |  | DB manager; often `--git` install |
| ddv | Rust | ratatui |  | github.com/lusingander/ddv |  |  |  |  | github.com/lusingander/ddv |  |  |  |  |  | yes |  |  |  | yes |  |  | DynamoDB viewer |
| rrtop | Rust | ratatui |  | github.com/wojciech-zurek/rrtop |  |  |  |  | github.com/wojciech-zurek/rrtop |  |  |  |  |  | yes |  |  |  | yes |  |  | Redis monitor |
| tgt | Rust | ratatui |  | github.com/FedericoBruzzone/tgt |  |  |  |  | github.com/FedericoBruzzone/tgt |  |  |  |  |  | yes |  |  |  | yes |  |  | needs TDLib; needs TDLib native dep (hard build edge) |
| oculante | Rust | egui |  | github.com/woelper/oculante |  |  |  |  | crates.io/crates/oculante |  |  |  |  |  |  | yes |  |  | yes | yes |  | fast image viewer (egui/wgpu); GPU window |
| emulsion | Rust | egui |  | github.com/ArturKovacs/emulsion |  |  |  |  | crates.io/crates/emulsion |  |  |  |  |  |  | yes |  |  | yes | yes |  | lightweight image viewer |
| krokiet | Rust | slint |  | github.com/qarmin/czkawka |  |  |  |  | crates.io/crates/krokiet |  |  |  |  |  |  | yes |  |  | yes | yes |  | Czkawka GUI dupe-finder; ships from qarmin/czkawka monorepo; czkawka CLI is in HB, krokiet GUI is not |
| rerun | Rust | wgpu |  | github.com/rerun-io/rerun |  |  |  |  | crates.io/crates/rerun-cli |  |  |  |  |  |  | yes |  |  | yes | yes |  | data/3D visualizer; crate rerun-cli in rerun-io/rerun monorepo; heavy GPU build |
| kiorg | Rust | egui |  | github.com/houqp/kiorg |  |  |  |  | github.com/houqp/kiorg |  |  |  |  |  |  | yes |  |  | yes | yes |  | egui file manager; GitHub-sourced (not on crates.io) |
| agy-acp | Rust |  |  | github.com/hicder/agy-acp |  |  |  |  | github.com/hicder/agy-acp |  |  |  |  |  |  |  |  |  | yes |  |  | ACP stdio adapter for Google Antigravity CLI (agy); GitHub Cargo (no crates.io publish, no releases); for Zed etc. |
| process-compose | Go |  |  | github.com/F1bonacc1/process-compose |  |  |  |  |  | github.com/F1bonacc1/process-compose |  |  |  |  | yes |  |  |  | yes |  |  | process orchestrator |
| wander | Go |  |  | github.com/robinovitch61/wander |  |  |  |  |  | github.com/robinovitch61/wander |  |  |  |  | yes |  |  |  | yes |  |  | Nomad TUI |
| updo | Go |  |  | github.com/Owloops/updo |  |  |  |  |  | github.com/Owloops/updo |  |  |  |  | yes |  |  |  | yes |  |  | uptime monitor |
| planor | Go |  |  | github.com/mrusme/planor |  |  |  |  |  | github.com/mrusme/planor |  |  |  |  | yes |  |  |  | yes |  |  | multi-cloud TUI |
| tdash | Go |  |  | github.com/jessfraz/tdash |  |  |  |  |  | github.com/jessfraz/tdash |  |  |  |  | yes |  |  |  | yes |  |  | CI dashboard |
| damon | Go |  |  | github.com/hashicorp/damon |  |  |  |  |  | github.com/hashicorp/damon |  |  |  |  | yes |  |  |  | yes |  |  | Nomad dashboard |
| dashbrew | Go |  |  | github.com/rasjonell/dashbrew |  |  |  |  |  | github.com/rasjonell/dashbrew |  |  |  |  | yes |  |  |  | yes |  |  | terminal dashboards |
| claws | Go |  |  |  |  |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes |  |  | AWS TUI |
| wakapi | Go |  |  | github.com/muety/wakapi |  |  |  |  |  | github.com/muety/wakapi |  |  |  |  |  |  | yes |  | yes |  |  | WakaTime backend |
| gotty | Go |  |  | github.com/sorenisanerd/gotty |  |  |  |  |  | github.com/sorenisanerd/gotty |  |  |  |  |  |  | yes |  | yes |  |  | `gotty bash` |
| goatcounter | Go |  |  | github.com/arp242/goatcounter |  |  |  |  |  | zgo.at/goatcounter/v2 |  |  |  |  |  |  | yes |  | yes |  |  | CGO/SQLite; module is zgo.at/goatcounter/v2; CGO/SQLite build |
| gokapi | Go |  |  | github.com/Forceu/Gokapi |  |  |  |  |  | github.com/Forceu/Gokapi |  |  |  |  |  |  | yes |  | yes |  |  | go:embed; go:embed assets |
| godns | Go |  |  | github.com/TimothyYe/godns |  |  |  |  |  | github.com/TimothyYe/godns |  |  |  |  |  |  | yes |  | yes | yes (21) |  | DDNS client with built-in web panel; cmd path `cmd/godns`; service-block candidate; latest release also ships `godns-web` zip |
| picoshare | Go |  |  | github.com/mtlynch/picoshare |  |  |  |  |  | github.com/mtlynch/picoshare |  |  |  |  |  |  | yes |  | yes |  |  | go:embed + SQLite; go:embed + SQLite |
| supersonic | Go | Fyne |  | github.com/dweymouth/supersonic |  |  |  |  |  | github.com/dweymouth/supersonic |  |  |  |  |  | yes |  |  | yes |  |  | music client; Fyne -> `fyne install`, not bare `go install` |
| rymdport | Go | Fyne |  | github.com/Jacalz/rymdport |  |  |  |  |  | github.com/Jacalz/rymdport |  |  |  |  |  | yes |  |  | yes |  |  | wormhole GUI; Fyne -> `fyne install`, not bare `go install` |
| paw | Go | Fyne |  | github.com/lucor/paw |  |  |  |  |  | github.com/lucor/paw |  |  |  |  |  | yes |  |  | yes |  |  | password manager; Fyne -> `fyne install`, not bare `go install` |
| goshot | Go | Fyne |  | github.com/janpfeifer/goshot |  |  |  |  |  | github.com/janpfeifer/goshot |  |  |  |  |  | yes |  |  | yes |  |  | screenshot tool; Fyne -> `fyne install`, not bare `go install` |
| EasyLPAC | Go | Fyne |  | github.com/creamlike1024/EasyLPAC |  |  |  |  |  | github.com/creamlike1024/EasyLPAC |  |  |  |  |  | yes |  |  | yes |  |  | eSIM GUI; Fyne -> `fyne install`, not bare `go install` |
| horcrux-ui | Go | Fyne |  | github.com/jesseduffield/horcrux-ui |  |  |  |  |  | github.com/jesseduffield/horcrux-ui |  |  |  |  |  | yes |  |  | yes |  |  | file-splitting GUI; Fyne -> `fyne install`; by lazygit's author |
| macMLX (CLI) | Swift | SwiftTUI |  | github.com/magicnight/Mac-MLX |  |  |  |  |  |  |  | yes |  |  | yes |  |  |  | yes |  |  | cmd `macmlx` |
| doedit | Swift | TUIkit |  | github.com/danterobles/doedit |  |  |  |  |  |  |  | yes |  |  | yes |  |  |  | yes |  |  | text editor |
| utiluti | Swift |  |  | github.com/scriptingosx/utiluti |  |  |  |  |  |  |  | yes |  |  | yes |  |  |  | yes | yes |  | query/set default URL-scheme & UTI handlers; scriptingosx author |
| macMLX (app) | Swift | SwiftUI |  | github.com/magicnight/Mac-MLX |  |  |  |  |  |  |  |  |  |  |  | yes |  | macMLX.dmg |  | yes |  | native SwiftUI local-LLM app; binary/cask path (future generator), not SPM |
| Rugby | Swift |  |  | github.com/swiftyfinch/Rugby |  |  |  |  |  |  |  | yes | mint install swiftyfinch/Rugby |  |  |  |  |  | yes |  |  | Xcode build-cache tool |
| swiftpolyglot | Swift |  |  | github.com/appdecostudio/SwiftPolyglot |  |  |  |  |  |  |  | yes | mint install appdecostudio/SwiftPolyglot |  |  |  |  |  | yes |  |  | localization-coverage checker |
| Rnwood.Smtp4dev | .NET |  |  | github.com/rnwood/smtp4dev |  |  |  |  |  |  |  |  |  | nuget.org/packages/Rnwood.Smtp4dev |  |  | yes |  | yes |  |  | cmd `smtp4dev` |
| dotnet-serve | .NET |  |  | github.com/natemcmaster/dotnet-serve |  |  |  |  |  |  |  |  |  | nuget.org/packages/dotnet-serve |  |  | yes |  | yes |  |  | static HTTP server |
| dotnet-monitor | .NET |  |  | github.com/dotnet/dotnet-monitor |  |  |  |  |  |  |  |  |  | nuget.org/packages/dotnet-monitor |  |  | yes |  | yes |  |  | diagnostics REST/web endpoint; `dotnet-monitor collect` |
| CSharpRepl | .NET |  |  | github.com/waf/CSharpRepl |  |  |  |  |  |  |  |  |  | nuget.org/packages/CSharpRepl | yes |  |  |  | yes |  |  | C# REPL |
| dotnet-counters | .NET |  |  | github.com/dotnet/diagnostics |  |  |  |  |  |  |  |  |  | nuget.org/packages/dotnet-counters | yes |  |  |  | yes |  |  | `dotnet-counters monitor` |
| ilspycmd | .NET |  |  | github.com/icsharpcode/ILSpy |  |  |  |  |  |  |  |  |  | nuget.org/packages/ilspycmd |  |  |  |  | yes |  |  | .NET decompiler |
| DepotDownloader | .NET |  |  | github.com/SteamRE/DepotDownloader |  |  |  |  |  |  |  |  |  | nuget.org/packages/DepotDownloader |  |  |  |  | yes |  |  | Steam depot downloader; web claims a HB formula; not present as of June 2026 — verify |
| Liana | Rust | iced |  | github.com/wizardsardine/liana |  |  |  |  |  |  |  |  |  |  |  | yes |  |  | yes | yes |  | Bitcoin wallet w/ timelocks; Tier B binary/cask path |
| ER-Save-Editor | Rust | egui |  | github.com/ClayAmore/ER-Save-Editor |  |  |  |  |  |  |  |  |  |  |  | yes |  |  | yes | yes |  | Elden Ring save editor; Tier B binary/cask path |
| tes3edit | Rust | egui |  | github.com/rfuzzo/tes3edit |  |  |  |  |  |  |  |  |  |  |  | yes |  |  | yes | yes |  | Morrowind plugin editor; Tier B binary/cask path |
| SydneyQt | Go | Wails |  | github.com/juzeon/SydneyQt |  |  |  |  |  |  |  |  |  |  |  | yes |  |  | yes | yes |  | Bing/Copilot desktop client; Tier B binary/cask path |
| LottieViewConvert | .NET | Avalonia |  | github.com/SwaggyMacro/LottieViewConvert |  |  |  |  |  |  |  |  |  |  |  | yes |  |  | yes | yes |  | TGS/Lottie converter; Tier B binary/cask path |
| Popcorn Time | Node | Electron/NW.js |  | github.com/popcorn-official/popcorn-desktop |  |  |  |  |  |  |  |  |  |  |  | yes |  |  | yes | yes |  | media streamer; NW.js (not Tauri); Tier B binary/cask path |
| dev-manager-desktop | Node | Tauri |  | github.com/webosbrew/dev-manager-desktop |  |  |  |  |  |  |  |  |  |  |  | yes |  |  | yes | yes |  | webOS homebrew manager; Tier B binary/cask path |
| gogs | Go |  |  | github.com/gogs/gogs | gogs (cask) |  |  |  |  |  | github.com/gogs/gogs |  |  |  |  |  |  |  | yes | yes (14) |  |  |
| rio | Rust |  |  | github.com/raphamorim/rio | rio (cask) |  |  |  |  |  |  |  |  |  | yes |  |  | rio.dmg | yes | yes (13) |  |  |
| pyzo | Python | Qt |  | github.com/pyzo/pyzo | pyzo (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | pyzo.dmg | yes | yes (8) |  |  |
| extraterm | TypeScript |  |  | github.com/sedwards2009/extraterm | extraterm (cask) |  | npmjs.com/package/extraterm |  |  |  |  |  |  |  | yes |  |  | extraterm.dmg | yes | yes (6) |  |  |
| shiori | Go |  |  | github.com/go-shiori/shiori | shiori (cask) |  |  |  |  |  | github.com/go-shiori/shiori |  |  |  |  |  |  |  | yes | yes (6) |  |  |
| veusz | Python | Qt |  | github.com/veusz/veusz | veusz (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | veusz.dmg | yes | yes (6) |  |  |
| frescobaldi | Python | Qt |  | github.com/frescobaldi/frescobaldi | frescobaldi (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | frescobaldi.dmg | yes | yes (4) |  |  |
| persepolis-download-manager | Python | GTK |  | github.com/persepolisdm/persepolis | persepolis-download-manager (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg | yes | yes (4) |  |  |
| manuskript | Python | Qt |  | github.com/olivierkes/manuskript | manuskript (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | manuskript.dmg | yes | yes (3) |  |  |
| wombat | Go | Wails |  | github.com/rogchap/wombat | wombat (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | wombat.dmg | yes | yes (3) |  |  |
| vorta | Python | Qt |  | github.com/borgbase/vorta | vorta (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | vorta.dmg | yes | yes (2) |  |  |
| electrum | Python | Qt | electrum.org | github.com/spesmilo/electrum | electrum (cask) |  |  |  |  |  |  |  |  |  |  | yes |  |  | yes | none |  | 0 GH releases; off-GitHub signed builds; source-build is the only non-brew path |
| pake | Rust | Tauri |  | github.com/tw93/Pake | pake (formula) |  |  |  |  |  |  |  |  |  |  | yes |  | pake.dmg | yes | yes (30) |  |  |
| pop | Go |  |  | github.com/charmbracelet/pop | pop (formula) |  |  |  |  |  | github.com/charmbracelet/pop |  |  |  | yes |  |  |  | yes | yes (26) |  |  |
| wishlist | Go |  |  | github.com/charmbracelet/wishlist | wishlist (formula) |  |  |  |  |  | github.com/charmbracelet/wishlist |  |  |  |  |  | yes |  | yes | yes (25) |  |  |
| portal | Go |  |  | github.com/SpatiumPortae/portal | portal (formula) |  |  |  |  |  | github.com/SpatiumPortae/portal |  |  |  | yes |  |  |  | yes | yes (15) |  |  |
| sniffnet | Rust | iced |  | github.com/GyulyVGC/sniffnet | sniffnet (formula) |  |  |  |  |  |  |  |  |  |  | yes |  |  | yes | yes (15) |  |  |
| jwt-ui | Rust | ratatui |  | github.com/jwt-rs/jwt-ui | jwt-ui (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (12) |  |  |
| kdash | Rust | ratatui |  | github.com/kdash-rs/kdash | kdash (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (12) |  |  |
| television | Rust | ratatui |  | github.com/alexpasmantier/television | television (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (11) |  |  |
| rainfrog | Rust | ratatui |  | github.com/achristmascarl/rainfrog | rainfrog (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (10) |  |  |
| csvlens | Rust | ratatui |  | github.com/YS-L/csvlens | csvlens (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (8) |  |  |
| doxx | Rust | ratatui |  | github.com/bgreenwell/doxx | doxx (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (8) |  |  |
| go2tv | Go |  |  | github.com/alexballas/go2tv | go2tv (formula) |  |  |  |  |  | github.com/alexballas/go2tv |  |  |  | yes |  |  |  | yes | yes (8) |  |  |
| termscp | Rust | ratatui |  | github.com/veeso/termscp | termscp (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (8) |  |  |
| dnote | Go |  |  | github.com/dnote/dnote | dnote (formula) |  |  |  |  |  | github.com/dnote/dnote |  |  |  |  |  | yes |  | yes | yes (7) |  |  |
| md-tui | Rust | ratatui |  | github.com/henriklovhaug/md-tui | md-tui (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (7) |  |  |
| tabiew | Rust | ratatui |  | github.com/shshemi/tabiew | tabiew (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (7) |  |  |
| pug | Go |  |  | github.com/leg100/pug | pug (formula) |  |  |  |  |  | github.com/leg100/pug |  |  |  | yes |  |  |  | yes | yes (6) |  |  |
| serpl | Rust | ratatui |  | github.com/yassinebridi/serpl | serpl (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (6) |  |  |
| stu | Rust | ratatui |  | github.com/lusingander/stu | stu (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (6) |  |  |
| yozefu | Rust | ratatui |  | github.com/MAIF/yozefu | yozefu (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (6) |  |  |
| gitu | Rust | ratatui |  | github.com/altsem/gitu | gitu (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (5) |  |  |
| nicotine-plus | Python | GTK |  | github.com/nicotine-plus/nicotine-plus | nicotine-plus (formula) |  |  |  |  |  |  |  |  |  |  | yes |  |  | yes | yes (5) |  |  |
| scooter | Rust | ratatui |  | github.com/thomasschafer/scooter | scooter (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (5) |  |  |
| slides | Go |  |  | github.com/maaslalani/slides | slides (formula) |  |  |  |  |  | github.com/maaslalani/slides |  |  |  | yes |  |  |  | yes | yes (5) |  |  |
| xplr | Rust | ratatui |  | github.com/sayanarijit/xplr | xplr (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (5) |  |  |
| lazyjournal | Go |  |  | github.com/Lifailon/lazyjournal | lazyjournal (formula) |  |  |  |  |  | github.com/Lifailon/lazyjournal |  |  |  | yes |  |  |  | yes | yes (4) |  |  |
| mockolo | Swift |  |  | github.com/uber/mockolo | mockolo (formula) |  |  |  |  |  |  | yes | mint install uber/mockolo |  |  |  |  |  | yes | yes (4) |  |  |
| otree | Rust | ratatui |  | github.com/fioncat/otree | otree (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (4) |  |  |
| spotify_player | Rust | ratatui |  | github.com/aome510/spotify-player | spotify_player (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (4) |  | underscore token; fuzzy-match gotcha |
| sshs | Rust | ratatui |  | github.com/quantumsheep/sshs | sshs (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (4) |  |  |
| licenseplist | Swift |  |  | github.com/mono0926/LicensePlist | licenseplist (formula) |  |  |  |  |  |  | yes | mint install mono0926/LicensePlist |  |  |  |  |  | yes | yes (3) |  |  |
| comictagger | Python | Qt |  | github.com/comictagger/comictagger | comictagger (formula) |  |  |  |  |  |  |  |  |  |  | yes |  |  | yes | yes (2) |  |  |
| gotify | Go |  |  | github.com/gotify/cli | gotify (formula) |  |  |  |  |  | github.com/gotify/cli |  |  |  |  |  |  |  | yes | yes (2) |  |  |
| swift-outdated | Swift |  |  | github.com/kiliankoe/swift-outdated | swift-outdated (formula) |  |  |  |  |  |  | yes | mint install kiliankoe/swift-outdated |  |  |  |  |  | yes | yes (2) |  |  |
| tenere | Rust | ratatui |  | github.com/pythops/tenere | tenere (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (2) |  |  |
| diskonaut | Rust | ratatui |  | github.com/imsnif/diskonaut | diskonaut (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (1) |  |  |
| dooit | Python | Textual |  | github.com/kraanzu/dooit | dooit (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (1) |  |  |
| gpg-tui | Rust | ratatui |  | github.com/orhun/gpg-tui | gpg-tui (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (1) |  |  |
| iblinter | Swift |  |  | github.com/IBDecodable/IBLinter | iblinter (formula) |  |  |  |  |  |  | yes | mint install IBDecodable/IBLinter |  |  |  |  |  | yes | yes (1) |  |  |
| kubetui | Rust | ratatui |  | github.com/sarub0b0/kubetui | kubetui (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | yes (1) |  |  |
| asccli | Swift |  |  | github.com/tddworks/asc-cli | asccli (formula) |  |  |  |  |  |  | yes | mint install tddworks/asc-cli |  | yes |  | yes |  | yes | tags only |  | App Store Connect CLI/asc tui/web-server; hyphen->token gotcha (asc-cli => asccli) |
| bartycrouch | Swift |  |  | github.com/FlineDev/BartyCrouch | bartycrouch (formula) |  |  |  |  |  |  | yes | mint install FlineDev/BartyCrouch |  |  |  |  |  | yes | tags only |  |  |
| czkawka | Rust |  |  | github.com/qarmin/czkawka | czkawka (formula) |  |  |  | crates.io/crates/czkawka_cli |  |  |  |  |  |  |  |  |  | yes | tags only |  | CLI dupe-finder; krokiet is its GUI (not in HB) |
| gtop | JavaScript |  |  | github.com/aksakalli/gtop | gtop (formula) |  | npmjs.com/package/gtop |  |  |  |  |  |  |  | yes |  |  |  | yes | tags only |  |  |
| jiratui | Python |  |  | github.com/whyisdifficult/jiratui | jiratui (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | tags only |  |  |
| joshuto | Rust | ratatui |  | github.com/kamiyaa/joshuto | joshuto (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | tags only |  |  |
| lazyjj | Rust | ratatui |  | github.com/Cretezy/lazyjj | lazyjj (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | tags only |  |  |
| mailcatcher | Ruby | Sinatra |  | github.com/sj26/mailcatcher | mailcatcher (formula) |  |  |  |  |  | rubygems.org/gems/mailcatcher |  |  |  |  |  | yes |  | yes | tags only |  | SMTP catcher + web inbox |
| mapscii | JavaScript |  |  | github.com/rastapasta/mapscii | mapscii (formula) |  | npmjs.com/package/mapscii |  |  |  |  |  |  |  | yes |  |  |  | yes | tags only |  |  |
| memray | Python |  |  | github.com/bloomberg/memray | memray (formula) |  |  |  |  |  |  |  |  |  |  |  |  |  | yes | tags only |  |  |
| recoverpy | Python |  |  | github.com/PabloLec/recoverpy | recoverpy (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | tags only |  |  |
| reveal-md | JavaScript |  |  | github.com/webpro/reveal-md | reveal-md (formula) |  | npmjs.com/package/reveal-md |  |  |  |  |  |  |  |  |  | yes |  | yes | tags only |  | reveal.js markdown presentation server |
| swiftplantuml | Swift |  |  | github.com/MarcoEidinger/SwiftPlantUML | swiftplantuml (formula) |  |  |  |  |  |  | yes | mint install MarcoEidinger/SwiftPlantUML |  |  |  |  |  | yes | tags only |  |  |
| tuisky | Rust | ratatui |  | github.com/sugyan/tuisky | tuisky (formula) |  |  |  |  |  |  |  |  |  | yes |  |  |  | yes | tags only |  |  |
| Seaquel | Rust |  | seaquel.app | github.com/webstonehq/seaquel |  |  |  |  |  |  |  |  |  |  |  | yes |  | Seaquel.dmg | yes | yes |  | not in HB; download via GitHub releases (versioned DMG) |
| ApiArk | Rust |  | apiark.dev | github.com/berbicanes/apiark |  |  |  |  |  |  |  |  |  |  |  | yes |  | ApiArk.dmg | yes | yes |  | not in HB; download via GitHub releases (versioned DMG) |
| Right Crane |  |  | rightright.me/products |  |  |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | not in HB; developer-site download |
| Unfatten |  |  | avelio.tech/unfatten |  |  |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | not in HB; developer-site download |
| Ollama | Go |  | ollama.com/download | github.com/ollama/ollama | ollama (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | Ollama-darwin.zip |  | yes | https://ollama.com/install.sh | site→GitHub redirect |
| Proxyman |  |  | proxyman.io |  | proxyman (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | Proxyman_latest.dmg |  | yes |  | developer CDN; latest in filename |
| Docker Desktop | Go |  | docker.com |  | docker-desktop (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | Docker.dmg |  | yes | https://get.docker.com | arch in path; closed-source; no public source repo (docker/desktop is feedback-only) |
| zoom |  |  | zoom.us |  | zoom (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | Zoom.pkg |  | yes |  | PKG format; CDN redirect |
| Trae |  |  | trae.ai |  | trae (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | developer-site download |
| Otty |  |  | otty.sh |  |  |  |  |  |  |  |  |  |  |  |  | yes |  | Otty.dmg |  |  |  | native terminal app; developer-site DMG; ARM + Intel builds; by appmakes.io |
| Paste |  |  | paste.app |  | paste (cask) | yes |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | also on MAS |
| Easyfind |  |  | devmate.com |  | easyfind (cask) | yes |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | also on MAS |
| Hermes |  |  | hermesapp.io |  | hermes (cask) | yes |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | also on MAS |
| Terax |  |  | terax.app |  | terax (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | developer-site download |
| Prefs Editor |  |  | tenten.co |  | prefs-editor (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | developer-site download |
| Setapp |  |  | setapp.com/download |  | setapp (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | app-store-alternative CDN |
| Raycast Beta |  |  | raycast.com |  | raycast (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | beta channel |
| Magnet |  |  |  |  |  | yes |  |  |  |  |  |  |  |  |  | yes |  |  |  |  |  | MAS only; no direct download -> not a cask-app test case |
| ColorSlurp |  |  |  |  |  | yes |  |  |  |  |  |  |  |  |  | yes |  |  |  |  |  | MAS only; no direct download -> not a cask-app test case |
| Bear |  |  | bear.app |  |  | yes |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | MAS + direct download; no HB cask |
| Perplexity |  |  | perplexity.ai/personal-computer |  |  |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | not in HB; new "Personal Computer" mac app; direct download only (not in MAS); login-gated DMG URL; macOS 14+; bundleId ai.perplexity.mac |
| Postman |  |  | postman.com/downloads | | postman (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | .zip |  | yes |  | in HB; CDN dl.pstmn.io; version in URL path; arch suffix (osx_arm64 vs osx64); bundleId com.postmanlabs.mac; macOS >= 11 |
| Discord |  |  | discord.com |  | discord (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | Discord.dmg | yes | yes |  | in HB; CDN dl.discordapp.net; version in URL path; livecheck header_match on redirect; OS-version split (Catalina vs Big Sur+); Electron; auto_updates; bundleId com.hnc.Discord |
| OnyX |  |  | titanium-software.fr/en/onyx.html |  | onyx (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | OnyX.dmg |  |  |  | in HB; developer-site DMG; sha256 :no_check; per-OS-version URLs (/download/26/ vs /download/15/ etc); no version in filename; depends_on macos == list; freeware; no GitHub; bundleId com.titanium.OnyX |
| TokenBar |  |  | tokenbar.site/get-started |  |  |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | indie; $5/mo or $15 lifetime |
| Monk Mode |  |  | mac.monk-mode.lifestyle |  |  |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | indie; $15 lifetime |
| MetricSync |  |  | metricsync.download |  |  |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  |  |  | indie; $5/mo |
| UTM |  |  |  | github.com/utmapp/UTM | utm (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | UTM.dmg |  | yes |  | /latest/ redirect; download via GitHub |
| balenaEtcher |  |  |  | github.com/balena-io/etcher | balenaetcher (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | balenaEtcher-darwin-arm64.dmg |  | yes |  | /latest/, arch in filename; download via GitHub |
| LocalSend | Flutter |  |  | github.com/localsend/localsend | localsend (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | LocalSend-1.17.0.dmg |  | yes |  | version in filename; download via GitHub |
| IINA |  |  |  | github.com/iina/iina | iina (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | IINA.dmg |  | yes |  | release page; download via GitHub |
| Transmission |  |  |  | github.com/transmission/transmission | transmission (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | Transmission.dmg |  | yes |  | version+revision; download via GitHub |
| Tailscale | Go |  | tailscale.com | github.com/tailscale/tailscale | tailscale (cask) | yes |  |  |  |  |  |  |  |  |  | yes |  | Tailscale-latest-macos.zip |  | yes | https://tailscale.com/install.sh | .zip, "latest"→302; also on MAS |
| MerMark Editor | TypeScript | Tauri |  | github.com/Vesperino/MerMarkEditor |  |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg | yes | yes |  | Markdown/Mermaid editor; Tauri 2.0 + Vue 3; unsigned |
| Archify | Swift | SwiftUI |  | github.com/Oct4Pie/archify |  |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg | yes | yes |  | Strips non-native arch from Universal binaries; notarized |
| Macos App Thinner | Shell |  |  | github.com/mvmalyi/macos-app-thinner |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | yes |  | CLI tool; strips x86_64 from Universal binaries via lipo; git clone + chmod + run |
| Homebrew | Ruby |  |  | github.com/Homebrew/brew |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh | canonical curl-pipe-bash installer |
| Rustup | Rust |  |  | github.com/rust-lang/rustup | rustup (formula) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://sh.rustup.rs | no .sh extension |
| Bun | Zig/JS |  |  | github.com/oven-sh/bun | bun (formula) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://bun.sh/install | no .sh extension |
| Deno | Rust |  |  | github.com/denoland/deno | deno (formula) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://deno.land/install.sh | standard .sh |
| uv | Rust |  |  | github.com/astral-sh/uv |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://astral.sh/uv/install.sh | not in HB; installs standalone binary to ~/.local/bin |
| Volta | Rust |  |  | github.com/volta-cli/volta |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://get.volta.sh | not in HB; no .sh extension |
| Starship | Rust |  |  | github.com/starship/starship | starship (formula) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://starship.rs/install.sh | detects platform+arch |
| Devbox | Go |  |  | github.com/jetify-com/devbox |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://get.jetify.com/devbox | not in HB; launcher script (auto-downloads real binary) |
| Mise | Rust |  |  | github.com/jdx/mise | mise (formula) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://mise.run | bare domain |
| Poetry | Python |  |  | github.com/python-poetry/poetry | poetry (formula) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://install.python-poetry.org | Python script |
| Oh My Zsh | Shell |  |  | github.com/ohmyzsh/ohmyzsh |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh | modifies shell config |
| nvm | Shell |  |  | github.com/nvm-sh/nvm | nvm (cask) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | version in URL path |
| Atuin | Rust |  |  | github.com/atuinsh/atuin | atuin (formula) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://setup.atuin.sh | setup. subdomain |
| Pixi | Rust |  |  | github.com/prefix-dev/pixi | pixi (formula) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://pixi.sh/install.sh | standard .sh |
| pnpm | Node |  |  | github.com/pnpm/pnpm | pnpm (formula) |  | npmjs.com/package/pnpm |  |  |  |  |  |  |  |  |  |  |  |  |  | https://get.pnpm.io/install.sh | get. subdomain |
| Fly.io CLI | Go |  |  | github.com/superfly/flyctl | flyctl (formula) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://fly.io/install.sh | installs to ~/.fly/bin |
| Railway CLI | Node |  |  | github.com/railwayapp/cli |  |  | npmjs.com/package/@railway/cli |  |  |  |  |  |  |  |  |  |  |  |  |  | https://raw.githubusercontent.com/railwayapp/cli/master/install.sh | not in HB |
| CuaDriver |  |  |  | github.com/trycua/cua |  |  |  |  |  |  |  |  |  |  |  | yes |  |  |  |  | https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh | drops .app + symlink |
| Nix | C++ |  |  | github.com/NixOS/nix | nix (formula) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://nixos.org/nix/install | no extension |
| SDKMAN! | Java |  |  | github.com/sdkman/sdkman-cli |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://get.sdkman.io | no extension; get. subdomain |
| croc | Go |  |  | github.com/schollz/croc | croc (formula) |  |  |  |  |  | github.com/schollz/croc |  |  |  |  |  |  |  | yes | yes | https://getcroc.schollz.com | bare domain redirect |
| Zellij | Rust |  |  | github.com/zellij-org/zellij | zellij (formula) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://zellij.dev/launch | unusual path /launch |
| Pool |  |  | downloads.poolside.ai/pool/install.sh | github.com/poolsideai/pool |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | https://downloads.poolside.ai/pool/install.sh | AI coding assistant; downloads. subdomain |
| ddclient | Perl |  |  | github.com/ddclient/ddclient | ddclient (formula) |  |  |  |  |  |  |  |  |  |  |  |  |  | yes | tags only |  | dynamic DNS client; autotools build (./configure, make); service-block candidate (daemon mode); v4.0.0; uses curl |
| agent-deck | Go |  |  | github.com/asheshgoplani/agent-deck |  |  |  |  |  | github.com/asheshgoplani/agent-deck |  |  |  |  | yes |  | yes |  | yes | yes | https://raw.githubusercontent.com/asheshgoplani/agent-deck/main/install.sh | AI agent session manager TUI; `go install` path; install.sh downloads prebuilt binaries; web UI mode (`agent-deck web`); not in HB core (author tap only); 344 releases |
| Poe |  |  | poe.com/pages/get-poe |  | poe (cask) | yes |  |  |  |  |  |  |  |  |  | yes |  | Poe.dmg |  | yes |  | AI chat client by Quora; CDN DMG (desktop-app.poecdn.net); no version in URL; also on MAS; closed-source |
| PopClip |  |  | popclip.app |  | popclip (cask) | yes |  |  |  |  |  |  |  |  |  | yes |  | PopClip-2025.9.2.zip |  | yes |  | text action tool; developer site .zip (pilotmoon.com/downloads); version in filename; also on MAS (outdated); also on Setapp; closed-source |
| Mission Control Plus |  |  | fadel.io/missioncontrolplus | github.com/ronyfadel/MissionControlPlusReleases | mission-control-plus (cask) |  |  |  |  |  |  |  |  |  |  | yes |  | .dmg |  | yes |  | window manager for Mission Control; GitHub releases-only repo (no source); v1.24; closed-source; requires Accessibility permission |
| Hermes Desktop | Swift | SwiftUI |  | github.com/dodo-reach/hermes-desktop |  |  |  |  |  |  |  |  |  |  |  | yes |  | HermesDesktop.app.zip | yes |  |  | native macOS companion for Hermes Agent; GitHub release .zip; ad-hoc signed (not notarized); MIT; v1.2.0; build script `./scripts/build-macos-app.sh`; 1.9k stars |
| Veronum | TypeScript | Electron | thetoolswebsite.com | github.com/DylanWain/veronum-desktop |  |  |  |  |  |  |  |  |  |  |  | yes |  | Veronum.dmg |  |  |  | multi-LLM workspace desktop app; GitHub /latest/ redirect DMG (no version in URL); signed + notarized; v0.1.2; not in HB |
| authsec-bridge | Python |  |  | github.com/authsec-ai/authsec-bridge |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | session bridge for Claude Code/Codex/Gemini CLI; `pip install -e .` from git clone; no PyPI package; no releases; MIT; edge case for source-build (Python not autotools) |
| MōIcons | TypeScript | React / MōBrowser |  | github.com/mo-browser-apps/icons |  |  |  |  |  |  |  |  |  |  |  | yes |  | MoIcons-1.0.3-arm64.dmg | yes | yes |  | AI macOS app icon generator; arm64-only DMG; signed + notarized; MIT; v1.0.3; 703 stars; not in HB |
| ShellGPT | Python |  |  | github.com/TheR1D/shell_gpt |  |  | pypi.org/project/shell-gpt |  |  |  |  |  |  |  |  |  |  |  |  |  | CLI productivity tool for AI LLMs; `pip install shell-gpt`; bin `sgpt`; 31 releases; v1.5.1; 12.1k stars; MIT; not in HB |
| Cline | TypeScript |  | cline.bot | github.com/cline/cline | cline (formula) |  |  | npmjs.com/package/cline |  |  |  |  |  |  |  |  |  |  |  |  |  | autonomous coding agent CLI; npm i -g cline; Homebrew formula deprecated (2027-05-18); monorepo (apps/cli); 293 releases; v3.0.29; 63.9k stars; Apache-2.0 |

---

## How to drive a test (all generators)

```bash
# pip / uv / pipx
allbrew https://pypi.org/project/marimo/ --manual      # → pip-package
brew install marimo && marimo edit

# pip-package (GitHub repo with PyPI package; bin name differs from package)
allbrew https://github.com/TheR1D/shell_gpt --manual   # → pip-package
brew install shell-gpt && sgpt --version

# npm
allbrew https://www.npmjs.com/package/taskbook --manual # → npm-package
brew install taskbook && tb

# npm-package (deprecated in HB; prefer npm package)
allbrew https://github.com/cline/cline --manual          # → npm-package
brew install cline && cline --version

# cargo (crates.io or GitHub)
allbrew https://crates.io/crates/managarr --manual      # → cargo-package
brew install managarr && managarr

# go (GitHub repo; embedded-frontend web app = best stress)
allbrew https://github.com/muety/wakapi --manual        # → go-package
brew install wakapi && wakapi
allbrew https://github.com/TimothyYe/godns --manual     # → go-package / binary-release
brew install godns && godns -h

# script-install (curl | bash)
allbrew https://starship.rs/install.sh --manual         # → script-install
brew install starship && starship --version

# cask-app (direct .dmg / .zip / .pkg download)
allbrew https://github.com/webstonehq/seaquel/releases/download/v2026.4.8/Seaquel_2026.4.8_aarch64.dmg --manual  # → cask-app
brew install --cask seaquel && open -a Seaquel

# fallback path (in-HB app, pull from release binaries instead of brew)
allbrew https://github.com/YS-L/csvlens --manual        # → binary-release / source-build

# source-build (autotools; in-HB Perl app)
allbrew https://github.com/ddclient/ddclient --manual   # → source-build
brew install ddclient && ddclient --version

# source-build (Python pip install from GitHub; no PyPI; no releases)
allbrew https://github.com/authsec-ai/authsec-bridge --manual  # → source-build
brew install authsec-bridge && sb --help

# cask-app-release (arm64-only DMG; signed + notarized)
allbrew https://github.com/mo-browser-apps/icons --manual  # → cask-app-release
brew install --cask moicons && open -a MoIcons

# go-package (not-in-HB Go TUI with web UI)
allbrew https://github.com/asheshgoplani/agent-deck --manual  # → go-package
brew install agent-deck && agent-deck --version

# future generators (manual today)
allbrew https://www.nuget.org/packages/Rnwood.Smtp4dev/ # dotnet-tool (planned)
```

Record per pick: generator chosen, bin name vs package name drift, livecheck source, service
block (flower/wakapi/smtp4dev), and any native-build failures (tgt/TDLib, goatcounter/CGO,
Fyne/`fyne install`).

---

## How to drive a test (cask-app & script-install)

```bash
# Not-in-HB app (GitHub release DMG)
allbrew https://github.com/webstonehq/seaquel/releases/download/v2026.4.8/Seaquel_2026.4.8_aarch64.dmg --manual
brew install --cask seaquel && open -a Seaquel

# Not-in-HB app (GitHub release DMG, different naming)
allbrew https://github.com/berbicanes/apiark/releases/download/v0.4.6/ApiArk_0.4.6_aarch64.dmg --manual
brew install --cask apiark && open -a ApiArk

# Developer site redirect → GitHub .zip
allbrew https://ollama.com/download/Ollama-darwin.zip --manual
brew install --cask ollama && ollama --version

# Developer CDN "latest" DMG
allbrew https://proxyman.io/release/osx/Proxyman_latest.dmg --manual
brew install --cask proxyman && open -a Proxyman

# Developer CDN DMG (no version in URL; closed-source; also on MAS)
allbrew https://desktop-app.poecdn.net/downloads/Poe.dmg --manual
brew install --cask poe && open -a Poe

# Developer site .zip (version in filename; closed-source; also on MAS)
allbrew https://pilotmoon.com/downloads/PopClip-2025.9.2.zip --manual
brew install --cask popclip && open -a PopClip

# GitHub release cask (releases-only repo; closed-source)
allbrew https://github.com/ronyfadel/MissionControlPlusReleases --manual
brew install --cask mission-control-plus && open -a "Mission Control Plus"

# GitHub release cask (.zip with .app; open-source Swift; unsigned)
allbrew https://github.com/dodo-reach/hermes-desktop --manual
brew install --cask hermes-desktop && open -a HermesDesktop

# PKG installer (not DMG)
allbrew https://zoom.us/client/latest/Zoom.pkg --manual
brew install --cask zoom && open -a zoom.us

# GitHub /latest/ redirect (no version in URL)
allbrew https://github.com/utmapp/UTM/releases/latest/download/UTM.dmg --manual
brew install --cask utm && open -a UTM

# GitHub /latest/ redirect DMG (Electron app; signed + notarized)
allbrew https://github.com/DylanWain/veronum-desktop/releases/latest/download/Veronum.dmg --manual
brew install --cask veronum && open -a Veronum

# Script-install test
allbrew https://starship.rs/install.sh --manual
brew install starship && starship --version

# Script-install — no .sh extension
allbrew https://get.volta.sh --manual
brew install volta && volta --version

# Script-install — launcher script (not one-shot)
allbrew https://get.jetify.com/devbox --manual
brew install devbox && devbox version
```

Record per pick: generator chosen, detected app name, version extraction result, SHA256
verification, redirect handling, and whether the formula/cask installs and runs correctly.
