#!/bin/zsh
# Refresh latest.json + stats.json on 2flycrew.co — runs from cron every 6h.
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
cd /Users/dez2fly/claude-projects/2flycrew-site || exit 1
git rebase --abort >/dev/null 2>&1   # self-heal if a previous run died mid-rebase
git pull -q --rebase origin main || { echo "$(date '+%Y-%m-%d %H:%M') pull FAILED"; exit 1; }
python3 scripts/update_latest.py || echo "$(date '+%Y-%m-%d %H:%M') update_latest FAILED"
python3 scripts/update_stats.py  || echo "$(date '+%Y-%m-%d %H:%M') update_stats FAILED"
if [ -n "$(git status --porcelain latest.json stats.json)" ]; then
  git add latest.json stats.json
  git -c user.name="latest-video-bot" -c user.email="vaultmaster7@users.noreply.github.com" commit -q -m "auto-update: latest video + stats" \
    || { echo "$(date '+%Y-%m-%d %H:%M') commit FAILED"; exit 1; }
  if git push -q origin main; then
    echo "$(date '+%Y-%m-%d %H:%M') pushed updates"
  else
    echo "$(date '+%Y-%m-%d %H:%M') push FAILED"
    exit 1
  fi
else
  echo "$(date '+%Y-%m-%d %H:%M') no change"
fi
