#!/usr/bin/env python3
import json, time, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter

ROOT = Path(__file__).resolve().parents[2] if Path(__file__).name == "parent-cycle.py" else Path("/Users/tariqwest/Developer/allbrew")
if not (ROOT / "tests/monitored-install-batch").exists():
    ROOT = Path("/Users/tariqwest/Developer/allbrew")
QPATH = ROOT / "tests/monitored-install-batch/state/agent-queue.json"
RUNS = ROOT / "tests/monitored-install-runs"
WALL_MIN = float(sys.argv[1]) if len(sys.argv) > 1 else 15.0
CONCURRENCY = int(sys.argv[2]) if len(sys.argv) > 2 else 6

def latest_run(slug):
    runs = sorted(RUNS.glob(f"*__{slug}"), key=lambda p: p.stat().st_mtime, reverse=True)
    return runs[0] if runs else None

def wall_min(launched_at, now):
    if not launched_at: return 999.0
    t = datetime.fromisoformat(launched_at.replace("Z", "+00:00")).timestamp()
    return (now - t) / 60.0

def classify(item, now):
    slug = item.get("slug") or ""
    agent = item.get("agentName")
    wall = wall_min(item.get("launchedAt"), now)
    rd = latest_run(slug)
    out = {"agentName": agent, "slug": slug, "wallMin": round(wall, 1),
           "runDir": str(rd.relative_to(ROOT)) if rd else None,
           "action": None, "markStatus": None, "reason": None, "killPatterns": []}
    if not rd:
        if wall >= WALL_MIN:
            out.update(action="mark", markStatus="failed_system", reason="no_run_dir_past_wall")
        else:
            out.update(action="wait", reason="no_run_dir_yet")
        return out
    outcome_p = rd / "outcome.json"
    meta_p = rd / "vm-meta.json"
    fixed_st = rd / "vm-install-fixed.log.status.json"
    first_st = rd / "vm-install.log.status.json"
    has_fix = (rd / "fix-package").exists()
    if outcome_p.exists():
        try: o = json.loads(outcome_p.read_text())
        except Exception: o = {}
        st = (o.get("status") or "").lower()
        if st in ("success", "succeeded", "success-not-fixed"): mark = "succeeded"
        elif st in ("fixed_success", "fixed-success", "failed-fix-applied"): mark = "fixed_success"
        elif st == "skipped": mark = "skipped"
        elif st == "blocked": mark = "blocked"
        elif st in ("failed_system", "failed-agent-runtime", "failed-timeout"): mark = "failed_system"
        else: mark = "failed"
        out.update(action="mark", markStatus=mark, reason=f"outcome:{st}",
                   failureClass=o.get("failureClass"),
                   verifyOk=(o.get("verification") or {}).get("ok"), hasFix=has_fix)
        return out
    if fixed_st.exists():
        try:
            s = json.loads(fixed_st.read_text())
            if s.get("verifyOk") is True and s.get("exitCode") == 0:
                out.update(action="mark", markStatus="fixed_success", reason="fixed_status_green", hasFix=has_fix)
                return out
        except Exception: pass
    if first_st.exists():
        try:
            s = json.loads(first_st.read_text())
            if s.get("verifyOk") is True and s.get("exitCode") == 0 and not has_fix and wall >= WALL_MIN:
                out.update(action="mark", markStatus="succeeded", reason="first_verify_green_past_wall")
                return out
        except Exception: pass
    ps = subprocess.getoutput("ps aux | grep vm-install-one | grep -v grep")
    live = slug in ps or (item.get("url") or "")[:40] in ps
    phase = None
    if meta_p.exists():
        try: phase = json.loads(meta_p.read_text()).get("phase")
        except Exception: pass
    if wall >= WALL_MIN:
        if live:
            mark = "skipped" if phase in ("installing", "verifying", "syncing-src") else "failed"
            out.update(action="kill_and_mark", markStatus=mark,
                       reason="wall_still_active" if mark=="skipped" else "wall_stalled_or_retry",
                       killPatterns=[f"vm-install-one.mjs --url {item.get('url','')}", f"vm-install-one.mjs --name {slug}"],
                       hasFix=has_fix, phase=phase)
            if mark == "skipped": out["skipReason"] = "wall_clock_cap"
        else:
            mark, reason = "failed", "no_outcome_past_wall"
            if first_st.exists():
                try:
                    s = json.loads(first_st.read_text())
                    if s.get("verifyOk"): mark, reason = "succeeded", "verify_ok_no_outcome"
                except Exception: pass
            out.update(action="mark", markStatus=mark, reason=reason, hasFix=has_fix, phase=phase)
        return out
    out.update(action="wait", reason="in_progress", phase=phase, live=live, hasFix=has_fix)
    return out

def main():
    q = json.loads(QPATH.read_text())
    now = time.time()
    running = [i for i in q["items"] if i.get("status") == "running"]
    pending = [i for i in q["items"] if i.get("status") in ("pending", "queued", "retry", "launching")]
    classifications = [classify(i, now) for i in running]
    marks = [c for c in classifications if c["action"] in ("mark", "kill_and_mark")]
    waits = [c for c in classifications if c["action"] == "wait"]
    free_after = max(0, CONCURRENCY - (len(running) - len(marks)))
    print(json.dumps({
        "counts": dict(Counter(i.get("status") for i in q["items"])),
        "running": len(running), "pending": len(pending),
        "classifications": classifications, "toMark": marks, "waiting": waits,
        "freeSlotsAfterMarks": free_after,
        "nextPending": [{"agentName": i.get("agentName"), "idx": i.get("idx"), "slug": i.get("slug"),
                         "url": i.get("url"), "name": i.get("name")}
                        for i in pending if "formulae.brew.sh/formula/" not in (i.get("url") or "")][:max(free_after, 6)],
    }, indent=2))
if __name__ == "__main__":
    main()
