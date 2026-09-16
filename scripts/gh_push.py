#!/usr/bin/env python3
"""Commit the Speechify migration via the GitHub REST git-database API.

Handles: modified files, new files (binary MP3s as base64 blobs), and
deletions (tree entries with sha=null). Opens a PR and squash-merges it.
The VM has no git-push credential, so this is the only way to push.
"""
import base64
import http.client
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
import urllib.error

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request

REPO = "sagivo/reading-ladder"
BLOB_CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".gh_blob_cache.json")
BLOB_SLEEP = 0.15  # ease off the API during bulk uploads


def load_cache():
    try:
        return json.load(open(BLOB_CACHE))
    except (OSError, ValueError):
        return {}


def save_cache(cache):
    json.dump(cache, open(BLOB_CACHE, "w"))


TRANSIENT = (urllib.error.URLError, http.client.RemoteDisconnected,
             http.client.BadStatusLine, TimeoutError, socket.timeout)


def api(method, path, data=None, retries=8):
    body = json.dumps(data).encode() if data is not None else None
    for attempt in range(retries):
        req = urllib.request.Request(
            f"https://api.github.com{path}", method=method, data=body,
            headers={"Content-Type": "application/json", "Accept": "application/vnd.github+json"})
        add_surrogate_to_request(req, "custom.github", allowed_hosts=("api.github.com",))
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:200]
            wait = min(3 * 2 ** attempt, 120)
            print(f"HTTP {e.code} {method} {path} (try {attempt+1}/{retries}), wait {wait}s: {detail}", flush=True)
        except TRANSIENT as e:
            wait = min(3 * 2 ** attempt, 120)
            print(f"TRANSIENT {type(e).__name__} {method} {path} (try {attempt+1}/{retries}), wait {wait}s", flush=True)
        if attempt < retries - 1:
            time.sleep(wait)
            continue
        raise


def main():
    branch = sys.argv[1] if len(sys.argv) > 1 else "audio/speechify-voice"
    title = sys.argv[2] if len(sys.argv) > 2 else "Speechify single-voice narration"
    # Staged changes in the local clone (git add -A first).
    status = subprocess.check_output(["git", "status", "--porcelain", "-uall"], text=True).splitlines()
    changed, deleted = [], []
    for line in status:
        code, path = line[:2], line[3:]
        if code.strip() == "D" or code == " D":
            deleted.append(path)
        elif path:
            # handle renames: "R  old -> new"
            if " -> " in path:
                old, path = path.split(" -> ")
                deleted.append(old)
            changed.append(path)
    print(f"changed={len(changed)} deleted={len(deleted)}", flush=True)
    blob_cache = load_cache()
    print(f"blob cache: {len(blob_cache)} entries", flush=True)

    def blob_for(path):
        st = os.stat(path)
        key = f"{path}|{st.st_size}|{int(st.st_mtime)}"
        if key in blob_cache:
            return blob_cache[key]
        with open(path, "rb") as fh:
            content = fh.read()
        try:
            sha = api("POST", f"/repos/{REPO}/git/blobs",
                      {"content": content.decode("utf-8"), "encoding": "utf-8"})["sha"]
        except UnicodeDecodeError:
            sha = api("POST", f"/repos/{REPO}/git/blobs",
                      {"content": base64.b64encode(content).decode(), "encoding": "base64"})["sha"]
        blob_cache[key] = sha
        if len(blob_cache) % 100 == 0:
            save_cache(blob_cache)
        time.sleep(BLOB_SLEEP)
        return sha

    base = api("GET", f"/repos/{REPO}/git/ref/heads/main")["object"]["sha"]
    base_tree = api("GET", f"/repos/{REPO}/git/commits/{base}")["tree"]["sha"]
    tree = []
    for i, path in enumerate(changed):
        sha = blob_for(path)
        tree.append({"path": path, "mode": "100644", "type": "blob", "sha": sha})
        if (i + 1) % 200 == 0:
            print(f"  blobs {i+1}/{len(changed)}", flush=True)
    for path in deleted:
        tree.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
    save_cache(blob_cache)
    msg = ("Speechify single-voice narration (Kristy)\n\n"
           "- One pre-generated voice (Kristy, Speechify simba-3.2) for the whole app;\n"
           "  removed the Sarah/Brian picker (ParentDash shows the voice info).\n"
           "- scripts/generate_audio_speechify.py: full catalog generated with Kristy;\n"
           "  hash scheme unchanged (sha256(voice|text)[:32]).\n"
           "- Removed orphaned ElevenLabs clips (public/audio/{sarah,brian}).\n"
           "- build_audio_catalog/manifest/stage_audio now single-voice.\n"
           "- narration.js: manifest-gated MP3 lookup (round 5) kept; safety-net\n"
           "  404 caching; preload skips non-manifest hashes.\n"
           "- Tests 109/109.")
    # GitHub 502s on huge single trees: split into stacked commits of <=600 entries.
    CHUNK = 600
    parent, parent_tree = base, base_tree
    n_parts = (len(tree) + CHUNK - 1) // CHUNK
    for ci in range(0, len(tree), CHUNK):
        part = ci // CHUNK + 1
        chunk = tree[ci:ci + CHUNK]
        print(f"creating tree part {part}/{n_parts} ({len(chunk)} entries) ...", flush=True)
        new_tree = api("POST", f"/repos/{REPO}/git/trees",
                       {"base_tree": parent_tree, "tree": chunk})["sha"]
        commit_msg = msg if part == n_parts else f"{title} (part {part}/{n_parts})"
        commit = api("POST", f"/repos/{REPO}/git/commits",
                     {"message": commit_msg, "tree": new_tree, "parents": [parent]})["sha"]
        print(f"  commit {part}:", commit[:8], flush=True)
        parent, parent_tree = commit, new_tree
    print("commit:", commit[:8], flush=True)
    try:
        api("POST", f"/repos/{REPO}/git/refs", {"ref": f"refs/heads/{branch}", "sha": commit})
        print("branch created:", branch, flush=True)
    except urllib.error.HTTPError:
        print("branch exists, reusing", flush=True)
    pr = api("POST", f"/repos/{REPO}/pulls",
             {"title": title, "head": branch, "base": "main", "body": msg})
    print("PR:", pr["html_url"], pr["number"], flush=True)
    m = api("PUT", f"/repos/{REPO}/pulls/{pr['number']}/merge", {"merge_method": "squash"})
    print("merged:", m.get("merged"), (m.get("sha") or "")[:8], flush=True)


if __name__ == "__main__":
    main()
