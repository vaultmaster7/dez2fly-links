#!/usr/bin/env python3
"""Fetch the channel RSS and write latest.json for the link page.

Skips livestream/compilation entries (the 24/7 network stream lives in the
same feed as real uploads) so the card always shows the newest actual drop.
"""
import json, re, sys, urllib.request
import xml.etree.ElementTree as ET

CHANNEL_ID = "UCG8wB0fPb3wU1A4cSoDcslQ"
FEED = f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}"
NS = {
    "a": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
    "media": "http://search.yahoo.com/mrss/",
}
SKIP = re.compile(r"24/7|🔴|\blive\b|hours of", re.I)

req = urllib.request.Request(FEED, headers={"User-Agent": "Mozilla/5.0 (2flycrew.co latest-video bot)"})
xml = urllib.request.urlopen(req, timeout=30).read()
root = ET.fromstring(xml)

for entry in root.findall("a:entry", NS):
    title = entry.findtext("a:title", "", NS)
    vid = entry.findtext("yt:videoId", "", NS)
    if not vid or SKIP.search(title):
        continue
    data = {
        "id": vid,
        "title": title,
        "thumb": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
        "url": f"https://www.youtube.com/watch?v={vid}",
    }
    with open("latest.json", "w") as f:
        json.dump(data, f, ensure_ascii=False)
    print(f"latest.json -> {vid}: {title}")
    sys.exit(0)

print("no eligible entry found", file=sys.stderr)
sys.exit(1)
