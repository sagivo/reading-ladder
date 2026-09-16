#!/usr/bin/env python3
"""Generate the missing ElevenLabs narration clips for The Reading Ladder.

Reads the authoritative catalog (scripts/build_audio_catalog.mjs output),
synthesizes every (voice, text) pair whose MP3 is not yet staged, and saves
it under ~/workspace/reading-ladder-audio/{voice}/{sha256(voice|text)[:32]}.mp3
— the exact address lib/narration.js computes at runtime.

Idempotent: existing files are skipped, so re-running after a quota refill
(or an interruption) only does the remaining work.

Run AFTER `node scripts/build_audio_catalog.mjs` (it writes /tmp/audio_catalog.json),
and AFTER ElevenLabs credits are available — the script stops cleanly on
quota_exceeded and tells you how many clips are left.

Usage:
  python3 scripts/generate_audio.py [--catalog /tmp/audio_catalog.json] [--limit 50] [--voice sarah]
"""

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request
import urllib.error

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request

API = "https://api.elevenlabs.io"
# Premade voice IDs (verified against the connected key: both return
# quota_exceeded rather than voice_not_found).
VOICE_IDS = {
    "sarah": "EXAVITQu4vr4xnSDxMaL",
    "brian": "nPczCjzI2devNBz1zQrb",
}
MODEL = "eleven_turbo_v2_5"
# Clips are committed to the repo (public/audio/) so Cloudflare Pages ships
# them with every build. Override with RL_AUDIO_DIR for local staging.
OUT_DIR = os.environ.get(
    "RL_AUDIO_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "audio"),
)


def clip_name(voice, text):
    h = hashlib.sha256(f"{voice}|{text}".encode("utf-8")).hexdigest()[:32]
    return h + ".mp3"


def synth(voice_id, text):
    """Returns (ok, bytes_or_error)."""
    body = json.dumps({
        "text": text,
        "model_id": MODEL,
        "voice_settings": {"stability": 0.6, "similarity_boost": 0.75},
    }).encode()
    req = urllib.request.Request(f"{API}/v1/text-to-speech/{voice_id}", method="POST", data=body)
    add_surrogate_to_request(req, "custom.elevenlabs", allowed_hosts=("api.elevenlabs.io",))
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "audio/mpeg")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            data = r.read()
            if len(data) < 100:
                return False, "tiny response"
            return True, data
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode()[:300]}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", default="/tmp/audio_catalog.json")
    ap.add_argument("--limit", type=int, default=0, help="max clips this run (0 = all)")
    ap.add_argument("--voice", choices=["sarah", "brian"], default=None)
    ap.add_argument("--sleep", type=float, default=0.4, help="seconds between requests")
    args = ap.parse_args()

    with open(args.catalog, encoding="utf-8") as f:
        rows = json.load(f)["rows"]

    voices = [args.voice] if args.voice else ["sarah", "brian"]
    todo = []
    for r in rows:
        for v in voices:
            if not r[v]:
                dest = os.path.join(OUT_DIR, v, clip_name(v, r["text"]))
                if not os.path.exists(dest):
                    todo.append((v, r["text"], dest))
    print(f"{len(todo)} clips to generate")
    if args.limit:
        todo = todo[: args.limit]

    done = skipped = 0
    for v, text, dest in todo:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        ok, payload = synth(VOICE_IDS[v], text)
        if not ok:
            print(f"\nFAILED [{v}] {text[:60]!r}: {payload}")
            if "quota_exceeded" in payload:
                print(f"STOPPING — quota exhausted. {len(todo) - done - skipped} clips remain.")
                break
            skipped += 1
            continue
        with open(dest, "wb") as f:
            f.write(payload)
        done += 1
        if done % 25 == 0:
            print(f"  …{done} written")
        time.sleep(args.sleep)
    print(f"done: {done} written, {skipped} failed/skipped")


if __name__ == "__main__":
    main()
