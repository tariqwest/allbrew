#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LOG="${HOME}/Library/Logs/allbrew-update.log"
exec >> "$LOG" 2>&1
echo "--- allbrew update-managed: $(date) ---"
brew update
brew livecheck --installed --newer-only --json --quiet | allbrew update-formulas
brew update
