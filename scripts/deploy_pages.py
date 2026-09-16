#!/usr/bin/env python3
"""Deploy The Reading Ladder to Cloudflare Pages via the Direct Upload API.

Replicates `wrangler pages deploy` (asset upload + _worker.bundle for
Advanced Mode) using the stored custom.cloudflare credential. Usage:

    deploy_pages.py [--branch NAME] [--dist DIR] [--worker PATH]

Default branch: a preview branch ("auth-test"). Pass --branch main for
production.
"""
import base64
import hashlib
import json
import mimetypes
import os
import sys
import urllib.request
import uuid

import blake3  # pip install --break-system-packages blake3

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request

API = "https://api.cloudflare.com/client/v4"
ACCOUNT = "c2456d993e0c5f12325e5abdf2bac1ac"
PROJECT = "reading-ladder"


def api(method, path, body=None, auth="token"):
    req = urllib.request.Request(API + path, method=method)
    add_surrogate_to_request(req, "custom.cloudflare", allowed_hosts=("api.cloudflare.com",))
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data=data) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} {method} {path}")
        print(e.read().decode()[:1000])
        sys.exit(1)


def jwt_api(method, path, jwt, body=None):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Authorization", f"Bearer {jwt}")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data=data) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} {method} {path} (jwt)")
        print(e.read().decode()[:1000])
        sys.exit(1)


def multipart(fields):
    """fields: list of (name, filename_or_None, content_type_or_None, bytes)."""
    boundary = "----rl" + uuid.uuid4().hex
    body = b""
    for name, filename, ctype, data in fields:
        body += f"--{boundary}\r\n".encode()
        disp = f'Content-Disposition: form-data; name="{name}"'
        if filename:
            disp += f'; filename="{filename}"'
        body += disp.encode() + b"\r\n"
        if ctype:
            body += f"Content-Type: {ctype}\r\n".encode()
        body += b"\r\n" + data + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def main():
    branch = "auth-test"
    dist = "/tmp/rl/dist"
    worker = "/tmp/rl-worker/_worker.js"
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == "--branch":
            branch = args[i + 1]
        elif a == "--dist":
            dist = args[i + 1]
        elif a == "--worker":
            worker = args[i + 1]

    # 1. Hash static assets (wrangler excludes _worker.js from the manifest).
    files = []
    for root, _, names in os.walk(dist):
        for n in names:
            if n == "_worker.js":
                continue
            full = os.path.join(root, n)
            rel = "/" + os.path.relpath(full, dist).replace(os.sep, "/")
            data = open(full, "rb").read()
            # wrangler's hashFile: BLAKE3(base64(contents) + extension), hex, first 32 chars
            ext = os.path.splitext(n)[1][1:]
            h = blake3.blake3((base64.b64encode(data).decode() + ext).encode()).hexdigest()[:32]
            ctype = mimetypes.guess_type(n)[0] or "application/octet-stream"
            if n.endswith(".js"):
                ctype = "application/javascript"
            files.append((rel, h, data, ctype))
    print(f"assets: {len(files)} files")

    # 2. Upload token + missing-hash check + upload + upsert.
    jwt = api("GET", f"/accounts/{ACCOUNT}/pages/projects/{PROJECT}/upload-token")["result"]["jwt"]
    hashes = [h for _, h, _, _ in files]
    missing = set(
        jwt_api("POST", "/pages/assets/check-missing", jwt, {"hashes": hashes})["result"]
    )
    print(f"missing: {len(missing)}")
    payload_files = []
    for rel, h, data, ctype in files:
        if h in missing:
            payload_files.append(
                {"key": h, "value": base64.b64encode(data).decode(),
                 "metadata": {"contentType": ctype}, "base64": True}
            )
    if payload_files:
        jwt_api("POST", "/pages/assets/upload", jwt, payload_files)
        print(f"uploaded {len(payload_files)} files")
    jwt_api("POST", "/pages/assets/upsert-hashes", jwt, {"hashes": hashes})

    manifest = {rel: h for rel, h, _, _ in files}

    # 3. Build the inner _worker.bundle (nested multipart: metadata + module).
    worker_src = open(worker, "rb").read()
    inner, inner_ct = multipart([
        ("metadata", None, "application/json",
         json.dumps({"main_module": "_worker.js",
                     "compatibility_date": "2026-09-16"}).encode()),
        ("_worker.js", "_worker.js", "application/javascript+module", worker_src),
    ])

    # 4. Create the deployment.
    outer, outer_ct = multipart([
        ("manifest", None, "application/json", json.dumps(manifest).encode()),
        ("branch", None, None, branch.encode()),
        ("_worker.bundle", "_worker.bundle", inner_ct, inner),
    ])
    req = urllib.request.Request(
        f"{API}/accounts/{ACCOUNT}/pages/projects/{PROJECT}/deployments",
        method="POST",
    )
    add_surrogate_to_request(req, "custom.cloudflare", allowed_hosts=("api.cloudflare.com",))
    req.add_header("Content-Type", outer_ct)
    try:
        with urllib.request.urlopen(req, data=outer) as r:
            dep = json.load(r)["result"]
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} create deployment")
        print(e.read().decode()[:2000])
        sys.exit(1)
    print("deployment:", dep["id"], dep.get("url"))
    for s in dep.get("stages", []):
        print(" stage:", s.get("name"), s.get("status"))
    print(json.dumps({"id": dep["id"], "url": dep.get("url")}))  # machine-readable tail


if __name__ == "__main__":
    main()
