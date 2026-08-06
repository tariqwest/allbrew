#!/usr/bin/env python3
"""Regenerate urls-shuffled.json + state/agent-queue.json from plan sources.

Sources:
  - /tmp/plan_apps.json (parsed from .agents/plans/allbrew-test-cases.md)
  - /tmp/homepage_apps.json (Pattern B JS-gated)
  - .agents/plans/homepage-download-test-cases.md (Pattern A + B)
  - /tmp/url_status_best.json + index.jsonl + agent-index.jsonl (prior outcomes)

Outputs:
  - tests/monitored-install-batch/urls-shuffled.json
  - tests/monitored-install-batch/state/agent-queue.json
"""
from __future__ import annotations

import json
import random
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCH = Path(__file__).resolve().parent
STATE = BATCH / "state"
CATALOG_PATH = BATCH / "urls-shuffled.json"
QUEUE_PATH = STATE / "agent-queue.json"
REPORT_PATH = Path("/tmp/catalog-regen-report.txt")

EMPTY = {"", "n", "no", "false", "—", "-", ".", "x", "?", "na", "n/a", "none", "null"}
YES = {"y", "yes", "true", "✓", "✔", "✅"}
SUCCESS_LABELS = {
    "success",
    "fixed_success",
    "success-not-fixed",
    "failed-fixed-successfully",
}


def clean(v) -> str:
    return re.sub(r"\s+", " ", str(v or "").strip())


def is_empty(v) -> bool:
    return clean(v).lower() in EMPTY


def is_yes(v) -> bool:
    return clean(v).lower() in YES


def is_real_app(r: dict) -> bool:
    a = clean(r.get("app"))
    if not a or a.startswith((">", "#", "- ", "|")):
        return False
    low = a.lower()
    if low in ("app", "notes", "legend", "---"):
        return False
    if "originally extracted" in low or "document contains" in low:
        return False
    if low.startswith("blank") or a.startswith("- Blank"):
        return False
    if a.startswith("**") and "legend" in low:
        return False
    return True


def slugify(name: str, url: str) -> str:
    s = (name or url or "pkg").lower()
    s = re.sub(r"https?://", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")[:50]
    return s or "pkg"


def ensure_https(host_or_url: str | None) -> str | None:
    v = clean(host_or_url)
    if not v:
        return None
    m = re.search(r"\((https?://[^)]+)\)", v)
    if m:
        v = m.group(1)
    m = re.search(r"(https?://[^\s\)\]]+)", v)
    if m:
        v = m.group(1)
    v = v.strip(".,;)" + "'" + '"')
    if v.startswith("http://") or v.startswith("https://"):
        return v
    if re.match(r"^[a-zA-Z0-9][a-zA-Z0-9._/-]*\.[a-zA-Z]{2,}(/.*)?$", v):
        return "https://" + v.lstrip("/")
    return None


def normalize_url(u: str | None) -> str | None:
    if not u:
        return None
    return u.strip().rstrip(").,;'" + '"')


def parse_github(v: str) -> str | None:
    v = clean(v)
    if is_empty(v) or is_yes(v):
        return None
    u = ensure_https(v)
    if u and "github.com" in u:
        return u.rstrip("/")
    m = re.match(r"^([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)(?:\.git)?/?$", v)
    if m:
        return f"https://github.com/{m.group(1)}/{m.group(2)}"
    return None


def parse_homebrew(v: str) -> str | None:
    v = clean(v)
    if is_empty(v) or is_yes(v):
        return None
    # name (cask) / name (formula) / name (formula, deprecated)
    m = re.match(
        r"^([A-Za-z0-9@._+-]+)\s*\(\s*(cask|formula)\b[^)]*\)\s*$",
        v,
        re.I,
    )
    if m:
        name, kind = m.group(1), m.group(2).lower()
        return f"https://formulae.brew.sh/{'cask' if kind == 'cask' else 'formula'}/{name}"
    m = re.match(r"^(cask|formula)\s*:\s*([A-Za-z0-9@._+-]+)$", v, re.I)
    if m:
        kind, name = m.group(1).lower(), m.group(2)
        return f"https://formulae.brew.sh/{'cask' if kind == 'cask' else 'formula'}/{name}"
    m = re.match(r"^(cask|formula)\s+([A-Za-z0-9@._+-]+)$", v, re.I)
    if m:
        kind, name = m.group(1).lower(), m.group(2)
        return f"https://formulae.brew.sh/{'cask' if kind == 'cask' else 'formula'}/{name}"
    if re.match(r"^[A-Za-z0-9@._+-]+$", v):
        return f"https://formulae.brew.sh/formula/{v}"
    for p in re.split(r"\s*/\s*|\s*,\s*", v):
        if p == v:
            continue
        u = parse_homebrew(p)
        if u:
            return u
    return None


def parse_npm(v: str) -> str | None:
    v = clean(v)
    if is_empty(v) or is_yes(v):
        return None
    u = ensure_https(v)
    if u and "npmjs.com" in u:
        return u
    m = re.match(r"^(@?[\w.-]+(?:/[\w.-]+)?)$", v)
    if m:
        return f"https://www.npmjs.com/package/{m.group(1)}"
    return u


def parse_pip(v: str) -> str | None:
    v = clean(v)
    if is_empty(v) or is_yes(v):
        return None
    u = ensure_https(v)
    if u and ("pypi.org" in u or "pypi.python.org" in u):
        return u
    m = re.search(r"pypi\.org/project/([^/\s]+)", v)
    if m:
        return f"https://pypi.org/project/{m.group(1)}/"
    if re.match(r"^[A-Za-z0-9_.-]+$", v):
        return f"https://pypi.org/project/{v}/"
    return u


def parse_cargo(v: str) -> str | None:
    v = clean(v)
    if is_empty(v) or is_yes(v):
        return None
    u = ensure_https(v)
    if u and "crates.io" in u:
        return u
    if re.match(r"^[A-Za-z0-9_-]+$", v):
        return f"https://crates.io/crates/{v}"
    return u


def parse_go(v: str) -> str | None:
    v = clean(v)
    if is_empty(v) or is_yes(v):
        return None
    u = ensure_https(v)
    if u:
        return u
    if re.match(r"^[a-zA-Z0-9._-]+(\.[a-zA-Z]{2,})(/[\w.@+-]+)+$", v):
        return f"https://pkg.go.dev/{v}"
    if re.match(r"^[\w.@+-]+(/[\w.@+-]+)+$", v):
        return f"https://pkg.go.dev/{v}"
    return None


def parse_gem(v: str) -> str | None:
    v = clean(v)
    if is_empty(v) or is_yes(v):
        return None
    u = ensure_https(v)
    if u and "rubygems.org" in u:
        return u
    if re.match(r"^[A-Za-z0-9_-]+$", v):
        return f"https://rubygems.org/gems/{v}"
    return u


def parse_swiftpm(v: str) -> str | None:
    v = clean(v)
    if is_empty(v) or is_yes(v):
        return None
    return parse_github(v) or ensure_https(v)


def parse_mint(v: str) -> str | None:
    v = clean(v)
    if is_empty(v) or is_yes(v):
        return None
    # mint install owner/repo
    m = re.search(r"mint\s+install\s+([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)", v, re.I)
    if m:
        return f"https://github.com/{m.group(1)}"
    m = re.match(r"^([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$", v)
    if m:
        return f"https://github.com/{m.group(1)}"
    return parse_github(v) or ensure_https(v)


def parse_dotnet(v: str) -> str | None:
    v = clean(v)
    if is_empty(v) or is_yes(v):
        return None
    u = ensure_https(v)
    if u and "nuget.org" in u:
        return u
    if re.match(r"^[A-Za-z0-9_.-]+$", v):
        return f"https://www.nuget.org/packages/{v}"
    return u


def parse_setapp(v: str, app_name: str) -> str | None:
    v = clean(v)
    if is_empty(v):
        return None
    u = ensure_https(v)
    if u:
        return u
    if is_yes(v):
        slug = re.sub(r"[^a-z0-9]+", "-", app_name.lower()).strip("-")
        return f"https://setapp.com/apps/{slug}"
    if re.match(r"^[A-Za-z0-9_-]+$", v):
        return f"https://setapp.com/apps/{v.lower()}"
    return None


def parse_mas(v: str, app_name: str) -> str | None:
    v = clean(v)
    if is_empty(v):
        return None
    u = ensure_https(v)
    if u:
        return u
    m = re.search(r"(\d{8,})", v)
    if m:
        return f"https://apps.apple.com/app/id{m.group(1)}"
    return None


def parse_script(v: str) -> str | None:
    v = clean(v)
    if is_empty(v) or is_yes(v):
        return None
    # curl ... | bash / install.sh URLs embedded in notes
    u = ensure_https(v)
    if u:
        return u
    m = re.search(r"(https?://\S+)", v)
    if m:
        return m.group(1).rstrip(chr(34) + "')].,;")
    return None
CHANNEL_PARSERS = [
    ("in_dev_website", lambda v, app: ensure_https(v)),
    ("in_github", lambda v, app: parse_github(v)),
    ("in_homebrew", lambda v, app: parse_homebrew(v)),
    ("in_setapp", lambda v, app: parse_setapp(v, app)),
    ("in_mas", lambda v, app: parse_mas(v, app)),
    ("in_npm", lambda v, app: parse_npm(v)),
    ("in_pip", lambda v, app: parse_pip(v)),
    ("in_cargo", lambda v, app: parse_cargo(v)),
    ("in_go_mod", lambda v, app: parse_go(v)),
    ("in_ruby_gem", lambda v, app: parse_gem(v)),
    ("in_swiftpm", lambda v, app: parse_swiftpm(v)),
    ("in_mint", lambda v, app: parse_mint(v)),
    ("in_dotnet", lambda v, app: parse_dotnet(v)),
    ("has_script_install", lambda v, app: parse_script(v)),
]


def norm_key(u: str) -> str:
    return (u or "").strip().rstrip("/").lower()


def backup(path: Path) -> None:
    if path.exists():
        bak = path.with_name(path.name + ".bak-pre-catalog-regen")
        bak.write_bytes(path.read_bytes())
        print(f"backup {bak} bytes={bak.stat().st_size}")


def load_json(path: Path):
    return json.loads(path.read_text())


def main() -> None:
    plan = load_json(Path("/tmp/plan_apps.json"))
    homepage_js = load_json(Path("/tmp/homepage_apps.json"))
    status_best = load_json(Path("/tmp/url_status_best.json"))
    hp_md = (ROOT / ".agents/plans/homepage-download-test-cases.md").read_text()

    entries: list[dict] = []
    skipped_channels: Counter = Counter()
    parsed_channels: Counter = Counter()
    real_apps = [r for r in plan if is_real_app(r)]
    print(f"real_apps={len(real_apps)}")

    for r in real_apps:
        app = clean(r["app"])
        app_name = re.sub(r"\s*\(.*?\)\s*$", "", app).strip() or app
        for col, parser in CHANNEL_PARSERS:
            raw = clean(r.get(col))
            if is_empty(raw):
                continue
            url = normalize_url(parser(raw, app_name))
            if not url:
                skipped_channels[col] += 1
                continue
            entries.append(
                {
                    "name": app_name,
                    "url": url,
                    "source": col,
                    "app": app_name,
                }
            )
            parsed_channels[col] += 1

    print(f"plan_channel_entries={len(entries)}")
    print(f"parsed={dict(parsed_channels)}")
    print(f"skipped={dict(skipped_channels)}")

    for h in homepage_js:
        name = clean(h.get("name"))
        url = normalize_url(ensure_https(h.get("url")))
        if not name or not url:
            continue
        entries.append(
            {
                "name": name,
                "url": url,
                "source": "homepage-download-test-cases-js-gated",
                "app": name,
            }
        )

    pattern_a_count = 0
    idx = hp_md.find("## Apps with Direct Downloads")
    if idx >= 0:
        section = hp_md[idx:]
        parts = re.split(r"\n(?=## )", section)
        a = parts[0]
        lines = a.splitlines()
        for i, l in enumerate(lines):
            if l.startswith("|") and "App" in l and ("Download" in l or "URL" in l):
                cols = [c.strip() for c in l.strip().strip("|").split("|")]
                app_i = next(
                    (j for j, c in enumerate(cols) if c.lower() in ("app", "name")),
                    1 if len(cols) > 1 else 0,
                )
                url_i = next(
                    (j for j, c in enumerate(cols) if "url" in c.lower() or "download" in c.lower()),
                    None,
                )
                if url_i is None:
                    continue
                for j in range(i + 1, len(lines)):
                    if not lines[j].startswith("|"):
                        break
                    if re.match(r"^\|\s*-+", lines[j]):
                        continue
                    cells = [c.strip() for c in lines[j].strip().strip("|").split("|")]
                    while len(cells) < len(cols):
                        cells.append("")
                    app = re.sub(r"\*\*", "", cells[app_i]).strip()
                    raw_url = cells[url_i].strip()
                    if not app or app.lower() == "app":
                        continue
                    url = ensure_https(raw_url)
                    if not url:
                        skipped_channels["homepage-pattern-a-no-url"] += 1
                        continue
                    entries.append(
                        {
                            "name": app,
                            "url": normalize_url(url),
                            "source": "homepage-download-test-cases",
                            "app": app,
                        }
                    )
                    pattern_a_count += 1
                break
    print(f"pattern_a_entries={pattern_a_count}")

    hf_path = Path("/tmp/homepage_full.md")
    extra = 0
    if hf_path.exists():
        hf = hf_path.read_text()
        existing = {
            (e["name"].lower(), e["url"])
            for e in entries
            if e["source"] == "homepage-download-test-cases"
        }
        for m in re.finditer(
            r"(?m)^\|\s*(\d+)\s*\|\s*\*?\*?([^|]+?)\*?\*?\s*\|\s*([^|]+)\|",
            hf,
        ):
            app = clean(m.group(2))
            raw = clean(m.group(3))
            url = ensure_https(raw)
            if not url:
                continue
            key = (app.lower(), url)
            if key in existing:
                continue
            entries.append(
                {
                    "name": app,
                    "url": normalize_url(url),
                    "source": "homepage-download-test-cases",
                    "app": app,
                }
            )
            existing.add(key)
            extra += 1
    print(f"homepage_full_extras={extra}")

    seen: set[tuple[str, str]] = set()
    deduped: list[dict] = []
    for e in entries:
        k = (e["url"], e["source"])
        if k in seen:
            continue
        seen.add(k)
        deduped.append(e)
    print(f"after_dedupe={len(deduped)} from={len(entries)}")

    rng = random.Random(42)
    order = list(range(len(deduped)))
    rng.shuffle(order)
    catalog = [
        {
            "name": deduped[i]["name"],
            "url": deduped[i]["url"],
            "source": deduped[i]["source"],
        }
        for i in order
    ]
    print(f"catalog_size={len(catalog)}")
    print(f"sources={Counter(e['source'] for e in catalog).most_common()}")

    success_urls: set[str] = set()
    label_by_url: dict[str, str] = {}
    for k, v in status_best.items():
        lab = v.get("label") if isinstance(v, dict) else v
        nk = norm_key(k)
        label_by_url[nk] = str(lab)
        if lab in SUCCESS_LABELS:
            success_urls.add(nk)

    for path in [BATCH / "index.jsonl", STATE / "agent-index.jsonl"]:
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except Exception:
                continue
            st = r.get("status")
            if st in ("success", "fixed_success"):
                u = r.get("url") or (r.get("item") or {}).get("url")
                if u:
                    success_urls.add(norm_key(u))
    print(f"success_urls={len(success_urls)}")

    items = []
    status_counts: Counter = Counter()
    for idx_i, e in enumerate(catalog):
        slug = slugify(e["name"], e["url"])
        agent_name = f"url-{idx_i:04d}-{slug[:24]}"
        nk = norm_key(e["url"])
        lab = label_by_url.get(nk)
        if nk in success_urls:
            if lab in ("fixed_success", "failed-fixed-successfully"):
                status = "failed-fixed-successfully"
            else:
                status = "success-not-fixed"
        else:
            status = "queued"
        status_counts[status] += 1
        items.append(
            {
                "idx": idx_i,
                "name": e["name"],
                "url": e["url"],
                "source": e["source"],
                "slug": slug,
                "agentName": agent_name,
                "status": status,
            }
        )

    queue = {
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total": len(items),
        "items": items,
    }
    print(f"queue_statuses={dict(status_counts)}")
    print(f"queued_for_run={status_counts['queued']}")

    backup(CATALOG_PATH)
    backup(QUEUE_PATH)
    CATALOG_PATH.write_text(json.dumps(catalog, indent=2) + "\n")
    QUEUE_PATH.write_text(json.dumps(queue, indent=2) + "\n")
    print(f"wrote {CATALOG_PATH} n={len(catalog)}")
    print(f"wrote {QUEUE_PATH} n={len(items)}")

    report = [
        f"real_apps={len(real_apps)}",
        f"catalog={len(catalog)}",
        f"queued={status_counts['queued']}",
        f"success-not-fixed={status_counts.get('success-not-fixed', 0)}",
        f"failed-fixed-successfully={status_counts.get('failed-fixed-successfully', 0)}",
        "sources=" + json.dumps(Counter(e["source"] for e in catalog).most_common()),
        "skipped=" + json.dumps(dict(skipped_channels)),
        "sample_catalog=" + json.dumps(catalog[:10], indent=2),
        "sample_queued="
        + json.dumps([i for i in items if i["status"] == "queued"][:10], indent=2),
    ]
    REPORT_PATH.write_text("\n".join(report) + "\n")
    print(f"report {REPORT_PATH}")
    print("\n".join(report[:7]))


if __name__ == "__main__":
    main()
