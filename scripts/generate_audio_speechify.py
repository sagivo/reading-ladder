#!/usr/bin/env python3
"""Generate the missing Speechify narration clips for The Reading Ladder.

Reads the authoritative catalog (scripts/build_audio_catalog.mjs output),
synthesizes every text whose MP3 is not yet staged, and saves it under
public/audio/kristy/{sha256("kristy"|text)[:32]}.mp3 — the exact address
lib/narration.js computes at runtime.

Single voice: Kristy (Speechify voice id "kristy", model simba-3.2).

Idempotent: existing files are skipped, so re-running after an
interruption only does the remaining work. Stops cleanly on quota/rate
errors and reports how many clips are left.

Run AFTER `node scripts/build_audio_catalog.mjs` (it writes
/tmp/audio_catalog.json).

Usage:
  python3 scripts/generate_audio_speechify.py [--catalog /tmp/audio_catalog.json] [--limit 50]
"""

import argparse
import base64
import hashlib
import json
import os
import sys
import time
import urllib.request
import urllib.error

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request

HOSTS = ("api.sws.speechify.com", "api.speechify.ai")
API = "https://api.sws.speechify.com"
VOICE = "kristy"          # app voice token (dir name + hash salt)
VOICE_ID = "kristy"       # Speechify voice id
MODEL = "simba-3.2"
OUT_DIR = os.environ.get(
    "RL_AUDIO_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "audio"),
)


def clip_name(text):
    h = hashlib.sha256(f"{VOICE}|{text}".encode("utf-8")).hexdigest()[:32]
    return h + ".mp3"


def synth(text):
    """Returns (ok, bytes_or_error)."""
    body = json.dumps({
        "input": text,
        "voice_id": VOICE_ID,
        "audio_format": "mp3",
        "model": MODEL,
        "language": "en-US",
    }).encode()
    req = urllib.request.Request(f"{API}/v1/audio/speech", method="POST", data=body)
    add_surrogate_to_request(req, "custom.speechify", allowed_hosts=HOSTS)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    import http.client as _http
    import socket as _socket
    attempts, delay = 6, 2.0
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                payload = json.loads(r.read().decode())
            break
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:300]
            if e.code in (429, 500, 502, 503, 504) and attempt < attempts - 1:
                print(f"[gen] HTTP {e.code}, retry {attempt+1}/{attempts} after {delay}s", flush=True)
                time.sleep(delay); delay *= 2
                continue
            return False, f"HTTP {e.code}: {body}"
        except (urllib.error.URLError, _http.RemoteDisconnected, _http.BadStatusLine,
                _http.IncompleteRead, ConnectionError, TimeoutError, _socket.timeout) as e:
            if attempt < attempts - 1:
                print(f"[gen] transient {type(e).__name__}, retry {attempt+1}/{attempts} after {delay}s", flush=True)
                time.sleep(delay); delay *= 2
                continue
            return False, f"network failed after {attempts} attempts: {e}"
    else:
        return False, "unreachable"
    b64 = payload.get("audio_data") or payload.get("audioData") or ""
    if not b64:
        return False, f"no audio_data in response: {str(payload)[:200]}"
    data = base64.b64decode(b64)
    if len(data) < 100:
        return False, "tiny response"
    return True, data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", default="/tmp/audio_catalog.json")
    ap.add_argument("--limit", type=int, default=0, help="max clips this run (0 = all)")
    ap.add_argument("--sleep", type=float, default=0.3, help="seconds between requests")
    args = ap.parse_args()

    catalog = json.load(open(args.catalog))
    rows = catalog["rows"]
    todo = [r for r in rows if not r.get(VOICE)]
    if args.limit:
        todo = todo[: args.limit]
    print(f"[gen] {len(todo)} clips to generate (voice={VOICE}, model={MODEL})")

    out_dir = os.path.join(OUT_DIR, VOICE)
    os.makedirs(out_dir, exist_ok=True)

    done, failed_items = 0, []
    for i, r in enumerate(todo):
        text = r["text"]
        dest = os.path.join(out_dir, clip_name(text))
        if os.path.exists(dest):
            done += 1
            continue
        ok, res = synth(text)
        if not ok:
            print(f"[gen] FAIL {i}/{len(todo)}: {res}", flush=True)
            failed_items.append(text)
            continue
        with open(dest, "wb") as f:
            f.write(res)
        done += 1
        if done % 50 == 0:
            print(f"[gen] {done}/{len(todo)} ...", flush=True)
        time.sleep(args.sleep)

    remaining = len(todo) - done
    print(f"[gen] done={done} failed={len(failed_items)} remaining~={remaining}")
    return 0 if remaining == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
