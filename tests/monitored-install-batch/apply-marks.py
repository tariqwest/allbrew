#!/usr/bin/env python3
import json, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path("/Users/tariqwest/Developer/allbrew")
QPATH = ROOT / "tests/monitored-install-batch/state/agent-queue.json"

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--run-cycle":
        out = subprocess.check_output(
            ["python3", str(ROOT / "tests/monitored-install-batch/parent-cycle.py"), "15", "6"],
            cwd=str(ROOT), text=True)
        cycle = json.loads(out)
    else:
        cycle = json.load(sys.stdin)

    applied = []
    for m in cycle.get("toMark", []):
        name = m["agentName"]
        status = m["markStatus"]
        if m.get("action") == "kill_and_mark":
            for pat in m.get("killPatterns") or []:
                subprocess.run(f'pkill -f "{pat}" 2>/dev/null || true', shell=True)
        r = subprocess.run(
            ["bun", "tests/monitored-install-batch/run-agent-batch.mjs", "--mark-done", name, status],
            cwd=str(ROOT), capture_output=True, text=True)
        # reload after each mark to annotate
        q = json.loads(QPATH.read_text())
        for item in q["items"]:
            if item.get("agentName") != name:
                continue
            if m.get("runDir"): item["runDir"] = m["runDir"]
            if m.get("failureClass"): item["failureClass"] = m["failureClass"]
            if m.get("skipReason"): item["skipReason"] = m["skipReason"]
            if status in ("succeeded", "fixed_success"): item["result"] = status
            item["finishedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        QPATH.write_text(json.dumps(q, indent=2) + "\n")
        applied.append({"agentName": name, "markStatus": status, "cli": r.stdout.strip()[:200], "ok": r.returncode == 0})

    q2 = json.loads(QPATH.read_text())
    running = [i for i in q2["items"] if i.get("status") == "running"]
    pending = [i for i in q2["items"] if i.get("status") in ("pending", "queued", "retry")]
    free = max(0, 6 - len(running))
    next_agents = [{"agentName": i.get("agentName"), "idx": i.get("idx"), "slug": i.get("slug"),
                    "url": i.get("url"), "name": i.get("name")}
                   for i in pending if "formulae.brew.sh/formula/" not in (i.get("url") or "")][:free]
    print(json.dumps({
        "applied": applied,
        "running": len(running),
        "pending": len(pending),
        "succeeded": sum(1 for i in q2["items"] if i.get("status") == "succeeded"),
        "failed": sum(1 for i in q2["items"] if i.get("status") == "failed"),
        "skipped": sum(1 for i in q2["items"] if i.get("status") == "skipped"),
        "blocked": sum(1 for i in q2["items"] if i.get("status") == "blocked"),
        "freeSlots": free,
        "runningNames": [i.get("agentName") for i in running],
        "nextAgents": next_agents,
    }, indent=2))

if __name__ == "__main__":
    main()
