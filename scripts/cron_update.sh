#!/bin/zsh
# Refresh latest.json + stats.json on 2flycrew.co — runs from cron every 6h.
# Pushes use a token file (macOS Keychain is locked under cron). Failures ping Telegram.
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
cd /Users/dez2fly/claude-projects/2flycrew-site || exit 1

alert() {
  TG=$(grep '^TELEGRAM_BOT_TOKEN' "$HOME/.claude/channels/telegram/.env" | cut -d= -f2)
  curl -s "https://api.telegram.org/bot${TG}/sendMessage" -d "chat_id=5352941556" \
    --data-urlencode "text=⚠️ 2flycrew.co updater: $1" > /dev/null
}

git rebase --abort >/dev/null 2>&1   # self-heal if a previous run died mid-rebase
git pull -q --rebase --autostash origin main || { echo "$(date '+%Y-%m-%d %H:%M') pull FAILED"; alert "git pull failed"; exit 1; }
python3 scripts/update_latest.py || echo "$(date '+%Y-%m-%d %H:%M') update_latest FAILED"
python3 scripts/update_stats.py  || echo "$(date '+%Y-%m-%d %H:%M') update_stats FAILED"
if [ -n "$(git status --porcelain latest.json stats.json)" ]; then
  git add latest.json stats.json
  git -c user.name="latest-video-bot" -c user.email="vaultmaster7@users.noreply.github.com" commit -q -m "auto-update: latest video + stats" \
    || { echo "$(date '+%Y-%m-%d %H:%M') commit FAILED"; alert "git commit failed"; exit 1; }
  if git push -q origin main; then
    echo "$(date '+%Y-%m-%d %H:%M') pushed updates"
  else
    echo "$(date '+%Y-%m-%d %H:%M') push FAILED"
    alert "git push failed — site data going stale"
    exit 1
  fi
else
  echo "$(date '+%Y-%m-%d %H:%M') no change"
fi
