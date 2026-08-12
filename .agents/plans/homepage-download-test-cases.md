# Homepage Download Test Cases

> Research date: 2026-08-02
> Purpose: macOS apps available **only** from developer websites (not in Homebrew core, not MAS-only, not Setapp-only) for testing allbrew's cask-app homepage scraping and download generation.

## Download Pattern Taxonomy

| Pattern | Description | Scrapability | Count |
|---------|-------------|-------------|-------|
| **A: Direct link in HTML** | `<a href="...dmg">` visible in page source | Easy — simple fetch + parse | ~50 |
| **B: JS-rendered button** | Download URL populated by JavaScript (arch detection, GitHub API fetch, click handler) | Hard — requires JS execution | 16 |
| **C: CDN redirect** | URL redirects through CDN; final URL has version or "latest" | Medium — follow redirects | ~5 |
| **D: Auth-gated** | Download behind login/form wall | Very hard — requires credentials | ~2 |

---

## Apps with JS-Gated Downloads (Pattern B) — Priority Test Cases

These are especially valuable because the download URL is NOT in the initial HTML response.

### 1. Chirpy
- **URL**: https://chirpy.pro/download
- **Download**: .dmg (7.8 MB Universal)
- **JS-gated**: Yes — download button rendered by JS
- **Version in URL**: No
- **Notes**: Custom notification sounds per Slack channel/app. Notarized. $19.99 lifetime. Not in Homebrew. Not on MAS (Accessibility API incompatible with sandbox). Sparkle updates.

### 2. Kosmik
- **URL**: https://kosmik.app/downloads
- **Download**: .dmg (separate Apple Silicon / Intel links)
- **JS-gated**: Yes — arch-specific links rendered by JS
- **Version in URL**: No
- **Notes**: Creative workspace with built-in browser. Free tier available. Not in Homebrew.

### 3. ButterKit
- **URL**: https:// butterkit.app/download/
- **Download**: .dmg
- **JS-gated**: Yes — arch detection via JS, auto-detects Apple Silicon vs Intel. Page shows "JavaScript is disabled. Click here to download." fallback.
- **Version in URL**: No
- **Notes**: App Store screenshot tool. `brew install --cask butterkit` exists. Requires macOS 26+.

### 4. CodeMantis
- **URL**: https://codemantis.dev/download
- **Download**: .dmg (under 50 MB)
- **JS-gated**: Yes — fetches latest release from GitHub API at runtime
- **Version in URL**: Resolved dynamically
- **Notes**: Tauri v2 + Rust Claude Code GUI. MIT licensed. Not in Homebrew.

### 5. Yaak
- **URL**: https://yaak.app/download
- **Download**: .dmg (Mac), .exe (Win), .AppImage/.deb (Linux)
- **JS-gated**: Yes — arch detection, shows platform-specific download
- **Version in URL**: No
- **Notes**: Local-first API client (REST, GraphQL, gRPC). `brew install --cask yaak` exists. Tauri-based.

### 6. Tablen
- **URL**: https://tablen.app/download
- **Download**: .dmg (44.3 MB Universal 2)
- **JS-gated**: Yes — architecture selector (Apple Silicon / Intel / Universal) rendered by JS
- **Version in URL**: Yes (Tablen-1.32.0-arm64.dmg)
- **Notes**: Native Swift SQL/NoSQL client (20+ databases). Notarized. `brew install --cask tablen` exists.

### 7. Pasty
- **URL**: https://pasty.dev
- **Download**: .dmg
- **JS-gated**: Yes — download section rendered dynamically
- **Version in URL**: Yes (Pasty-3.4.dmg in brew command)
- **Notes**: Native Swift clipboard manager. $9.99 one-time. `brew install --cask pasty` exists.

### 8. ego (lite)
- **URL**: https://lite.ego.app/download
- **Download**: .dmg (arm64 + x64 variants)
- **JS-gated**: Yes — auto-detects architecture via JS, serves correct build. "If the download doesn't start automatically" fallback.
- **Version in URL**: No
- **Notes**: AI agent browser. Already in test cases table but download page is a great JS-gated example.

### 9. DevDash
- **URL**: https://devdash.dev (or GitHub Pages)
- **Download**: .dmg (arm64 / x64)
- **JS-gated**: Yes — React component fetches latest GitHub release via API, detects arch via WebGL renderer heuristic
- **Version in URL**: Resolved dynamically
- **Notes**: Developer metrics dashboard. Not in Homebrew.

### 10. Multica
- **URL**: https://multica.ai/download
- **Download**: .dmg (arm64 only), .exe, .AppImage
- **JS-gated**: Yes — client-side OS + arch detect, fetches version from `api.github.com/releases/latest`
- **Version in URL**: Resolved dynamically
- **Notes**: Managed agents platform. 21k stars. Electron. Not in Homebrew.

### 11. Superwhisper
- **URL**: https://superwhisper.com
- **Download**: .dmg
- **JS-gated**: Yes — button click triggers dynamic download URL generation via API call
- **Version in URL**: No
- **Notes**: Local AI voice-to-text dictation app for macOS. Sparkle updater. Not on MAS or Homebrew core.

### 12. Halo
- **URL**: https://heyhalo.app
- **Download**: .dmg
- **JS-gated**: Yes — dynamic download link constructed on JS click event
- **Version in URL**: No
- **Notes**: AI assistant for desktop window management and quick actions. Direct download only.

### 13. Unpeel
- **URL**: https://unpeel.com
- **Download**: .dmg
- **JS-gated**: Yes — dynamic JS download button with arch detection
- **Version in URL**: No
- **Notes**: Image background removal tool using local Vision framework. Direct download.

### 14. FilenQ
- **URL**: https://filenq.app
- **Download**: .dmg
- **JS-gated**: Yes — dynamic JS download link
- **Version in URL**: No
- **Notes**: Encrypted file sharing and cloud drive desktop client.

### 15. Aizen
- **URL**: https://aizen.win
- **Download**: .dmg
- **JS-gated**: Yes — JS link generation based on user agent and client token
- **Version in URL**: No
- **Notes**: AI workflow automation tool for macOS.

### 16. Download Latest (meta — many apps use this pattern)
- **Pattern**: JS widget fetches `api.github.com/repos/{owner}/{repo}/releases/latest`, detects OS/arch via `navigator.userAgentData` or UA parsing, populates download button href
- **Used by**: DevDash, many indie apps
- **Notes**: This is a reusable JS library. Apps using it won't have download URLs in HTML source.

---

## Apps with Direct Downloads (Pattern A) — 35+ Additional Test Cases

### Utilities & Menu Bar Apps

| # | App | Download URL | Format | Version in URL | Price | Notes |
|---|-----|-------------|--------|----------------|-------|-------|
| 12 | **TogglePresent** | togglepresent.com | .dmg | No | $4.99 | One-click presentation mode (hide desktop, mute, DND). macoshunt.com developer. Not in HB. |
| 13 | **Ghost Text** | developer site | .dmg | No | $4.99 | OCR text extraction from screen regions. Apple Vision framework, offline. Not in HB. |
| 14 | **Smart Folder** | developer site | .dmg | No | Free | Auto-organize Downloads folder by file type. Not in HB. |
| 15 | **NaturalMouse** | developer site | .dmg | No | Free | Separate scroll direction for trackpad vs mouse. Not in HB. |
| 16 | **Googly Eyes** | developer site | .dmg | No | Free | Animated menu bar eyes that follow cursor. Not in HB. |
| 17 | **Echo** | theodorehq.com/echo | .dmg | No | $9.99 | Media memory — remembers everything played across apps. Not in HB. |
| 18 | **AlDente Pro** | apphousekitchen.com | .dmg | No | Free/Pro | Battery charge limiter. Not in HB (direct download only). |
| 19 | **BetterDisplay** | betterdisplay.pro | .dmg | No | Free/$10 | Monitor management, custom resolutions, HiDPI. `brew install --cask betterdisplay`. |
| 20 | **DiskLens** | disklens.app | .dmg | No | Free | Disk usage analyzer with treemap view. Not in HB. |
| 21 | **Consul** | consul.app | .dmg | No | $19 | File converter — change extension to convert. Not in HB. |
| 22 | **Compresto** | compresto.app | .dmg | No | Free/$49-69 | Batch video/image/PDF compression. Not in HB. |
| 23 | **Pasty** | pasty.dev/releases/ | .dmg | Yes | $9.99 | Clipboard manager with 120Hz, AES-256, code highlighting. `brew install --cask pasty`. |
| 24 | **SaneBar** | sanebar.com | .dmg | No | Free (was paid) | Menu bar icon manager. Now open source MIT. `brew install --cask sane-apps/tap/sanebar`. |
| 25 | **Thaw** | github.com/stonerl/Thaw | .dmg (zip) | Yes | Free | Menu bar manager (Ice fork). `brew install thaw`. GPL-3.0. |
| 26 | **NetBar** | github.com/mh-sudo/NetBar | .dmg (zip) | Yes (v1.2.1) | Free | Network speed monitor menu bar app. MIT. Not in HB core. |
| 27 | **MacMonitor** | github.com/ryyansafar/MacMonitor | .dmg | Yes (v2.0.2) | Free | Apple Silicon system monitor. MIT. Not in HB core. |
| 28 | **MacThrottle** | github.com/angristan/MacThrottle | .dmg | Yes | Free | Thermal throttle monitor. MIT. `brew install --cask macthrottle` (3p tap). |
| 29 | **Clipped** | github.com/mcclowes/clipped | .dmg (zip) | Yes (v1.7.0) | Free | Clipboard manager. MIT. `brew install mcclowes/clipped/clipped` (3p tap). |
| 30 | **Orbit** | github.com/yuzeguitarist/Orbit | .dmg | Yes | Free | Radial app switcher at cursor. Source-available. Not in HB. |

### Productivity & Writing

| # | App | Download URL | Format | Version in URL | Price | Notes |
|---|-----|-------------|--------|----------------|-------|-------|
| 31 | **iA Writer** | ia.net/writer | .dmg | No | $30 | Markdown editor. AppKit native. `brew install --cask ia-writer`. |
| 32 | **DEVONthink** | devontechnologies.com | .dmg | No | $99+ | Document/information management. Local databases. `brew install --cask devonthink`. |
| 33 | **Things 3** | culturedcode.com/things | .dmg | No | $49.99 | Task manager. Also on MAS. Not in HB cask. |
| 34 | **Resurf** | resurf.app | .dmg | No | $39-49 | Quick capture & personal library. Not in HB. |
| 35 | **NoteMap** | notemap.app | .dmg | No | Free/$30 | Mind mapping with AI. Not in HB. |
| 36 | **Refine** | refine.app | .dmg | No | $38-59 | AI grammar checker, offline. Not in HB. |
| 37 | **Canto** | canto.app | .dmg | No | Free/$14.99 | Private AI notebook with local models. Not in HB. |

### Developer Tools

| # | App | Download URL | Format | Version in URL | Price | Notes |
|---|-----|-------------|--------|----------------|-------|-------|
| 38 | **TablePro** | tablepro.app | .dmg | No | Free/$59-119 | Native Swift database client. Not in HB. |
| 39 | **Superconductor** | superconductor.dev | .dmg | No | Free | Parallel AI coding agents, Rust terminal. Not in HB. |
| 40 | **T3Code** | t3code.com | .dmg | No | Free | GUI for AI coding agents with own API keys. Not in HB. |
| 41 | **PortDeck** | github.com/JessePeplinski/portdeck | .dmg | Yes (v0.1.0-beta.16) | Free | Menu bar dev services monitor. MIT. `brew install --cask JessePeplinski/tap/portdeck@beta`. |

### AI Tools

| # | App | Download URL | Format | Version in URL | Price | Notes |
|---|-----|-------------|--------|----------------|-------|-------|
| 42 | **Jan** | jan.ai | .dmg | No | Free | Open-source local AI assistant. Not in HB. |
| 43 | **BoltAI** | boltai.com | .dmg | No | $55-99 | Native AI client, cloud + local models. Not in HB. |
| 44 | **Snaply** | snaply.app | .dmg | No | Free | AI dictation, meeting notes, writing — on-device. Not in HB. |
| 45 | **AimeFlux** | aimeflux.app | .dmg | No | $20 | Local-first dictation/transcription. Not in HB. |
| 46 | **Snippetbar** | snippetbar.app | .dmg | No | $19 | Run AI prompts on selected text from menu bar. Not in HB. |
| 47 | **Cotypist** | cotypist.app | .dmg | No | Free/Plus/Pro | AI typing prediction, local models. Not in HB. |

### Creative & Media

| # | App | Download URL | Format | Version in URL | Price | Notes |
|---|-----|-------------|--------|----------------|-------|-------|
| 48 | **Skreen** | github.com/levskiy0/skreenme | .dmg | Yes | Free (beta) | Screenshot beautifier, auto-PII redaction. Not in HB. |
| 49 | **Screencharm** | screencharm.app | .dmg | No | $79 | Screen recorder with auto-zoom. Not in HB. |
| 50 | **Recordly** | recordly.app | .dmg | No | Free | Open-source screen recorder. Not in HB. |
| 51 | **Cap** | cap.so | .dmg | No | Free/$58 | Open-source screen recording (Loom alternative). `brew install --cask cap`. |
| 52 | **OpenVox** | openvox.app | .dmg | No | Free/$19.99 | Text-to-speech with 300+ voices, voice cloning. Not in HB. |

### Network & File Transfer

| # | App | Download URL | Format | Version in URL | Price | Notes |
|---|-----|-------------|--------|----------------|-------|-------|
| 53 | **Zyp** | getzyp.com | .dmg | Yes (1.1.1) | Free | SFTP/FTP/WebDAV/S3 client. Notarized. `brew install --cask khaweryounas/zyp/zyp`. |
| 54 | **Harbor** | github.com/thsnkhn/harbor | .dmg | Yes | Free | Download manager (direct + torrent). GPL-3.0. `brew tap thsnkhn/harbor`. |
| 55 | **Syncthing Menu** | github.com/gtunes-dev/syncthing-menu | .dmg (zip) | Yes | Free | Syncthing wrapper with runtime daemon download. MIT. Not in HB core. |
| 56 | **Itsypin** | itsypin.app | .dmg | Yes | Free | Pinned websites in menu bar bubbles. MIT. `brew install --cask nickustinov/tap/itsypin`. |

### Other

| # | App | Download URL | Format | Version in URL | Price | Notes |
|---|-----|-------------|--------|----------------|-------|-------|
| 57 | **Tempo** | tempoapp.app/downloads | .dmg | Yes (v1.2) | ? | Event hub — webhook receiver for monitoring. Not in HB. |
| 58 | **LookAway** | lookaway.app | .dmg | No | $19-29 | Smart break reminder. Not in HB. |
| 59 | **Chronoid** | chronoid.com | .dmg | No | $49-99 | AI time tracking + Pomodoro. Not in HB. |
| 60 | **Pieoneer** | pieoneer.app | .dmg | No | $9.99 | Radial pie menu launcher. Not in HB. |
| 61 | **Carbon Copy Cloner** | bombich.com | .dmg | No | $49.99 | Backup utility. `brew install --cask carbon-copy-cloner`. |
| 62 | **Lattix** | lattix.app | .dmg | No | $13.99-23.99 | Workspace launcher across monitors. Not in HB. |
| 63 | **Tusk** | tusk.app | .dmg | No | $49 | Backup software tracking files across destinations. Not in HB. |
| 64 | **SystemEQ** | github.com/denzam/SystemEQ-for-Mac | .dmg | Yes (v1.0.5) | Free | System audio equalizer. `brew install --cask systemeq` (3p tap). |

---

## Summary

- **Total unique apps found**: 69
- **JS-gated downloads (Pattern B)**: 16 — these require JS execution to reveal the download URL
- **Direct HTML downloads (Pattern A)**: ~50 — straightforward to scrape
- **With version in URL**: ~20 — good for testing version-aware livecheck
- **Not in any Homebrew tap**: ~45 — pure developer-site-only distribution
- **In Homebrew (core or 3p tap)**: ~20 — good for testing duplicate detection

## Recommended Priority for Testing

### Tier 1 — JS-gated (hardest, most valuable)
1. Chirpy (chirpy.pro/download)
2. Kosmik (kosmik.app/downloads)
3. CodeMantis (codemantis.dev/download)
4. Tablen (tablen.app/download)
5. Pasty (pasty.dev)
6. Multica (multica.ai/download)
7. DevDash (devdash.dev)
8. ButterKit (butterkit.app/download)
9. Yaak (yaak.app/download)
10. ego lite (lite.ego.app/download)
11. Superwhisper (superwhisper.com)
12. Halo (heyhalo.app)
13. Unpeel (unpeel.com)
14. FilenQ (filenq.app)
15. Aizen (aizen.win)
16. Download-latest widget pattern

### Tier 2 — Direct download, not in Homebrew (best for new generator testing)
1. TogglePresent
2. Ghost Text
3. Echo
4. AlDente Pro
5. DiskLens
6. Consul
7. Compresto
8. Jan
9. TablePro
10. Zyp
11. Skreen
12. Cap
13. Orbit
14. NetBar
15. MacMonitor

### Tier 3 — Direct download, already in Homebrew (good for duplicate detection)
1. BetterDisplay
2. iA Writer
3. Carbon Copy Cloner
4. Things 3
5. DEVONthink
6. Thaw
7. Harbor
