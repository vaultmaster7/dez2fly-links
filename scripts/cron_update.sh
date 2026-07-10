#!/bin/zsh
# Refresh latest.json on 2flycrew.co — runs from cron every 6h.
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
cd /Users/dez2fly/claude-projects/2flycrew-site || exit 1
git pull -q --rebase origin main
python3 scripts/update_latest.py || exit 1
if [ -n "$(git status --porcelain latest.json)" ]; then
  git add latest.json
  git -c user.name="latest-video-bot" -c user.email="vaultmaster7@users.noreply.github.com" commit -q -m "latest video: auto-update"
  git push -q origin main
  echo "$(date '+%Y-%m-%d %H:%M') pushed new latest.json"
else
  echo "$(date '+%Y-%m-%d %H:%M') no change"
fi
