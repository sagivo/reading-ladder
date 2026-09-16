// Stage pre-generated ElevenLabs MP3s into dist/audio/ so the app serves
// them same-origin (no R2 bucket needed).
//
// Audio now ships IN THE REPO under public/audio/{sarah,brian}/, so
// `vite build` already copies it into dist/audio/ — this script is a
// fallback that stages freshly generated clips from a local folder
// (~/workspace/reading-ladder-audio or $RL_AUDIO_DIR) before they are
// committed. It skips gracefully when the folder is absent (CI).
//
// New clips: run scripts/generate_audio.py (writes to public/audio/),
// commit, push — Pages rebuilds and ships them automatically.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const VOICES = ['sarah', 'brian'];
const SRC = process.env.RL_AUDIO_DIR || path.join(os.homedir(), 'workspace', 'reading-ladder-audio');
const DIST = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'dist', 'audio');

let staged = 0;
for (const voice of VOICES) {
  const srcDir = path.join(SRC, voice);
  if (!fs.existsSync(srcDir)) {
    console.log(`[stage_audio] no local audio for "${voice}" at ${srcDir} — skipping`);
    continue;
  }
  const dstDir = path.join(DIST, voice);
  fs.mkdirSync(dstDir, { recursive: true });
  for (const f of fs.readdirSync(srcDir)) {
    if (!f.endsWith('.mp3')) continue;
    const src = path.join(srcDir, f);
    const dst = path.join(dstDir, f);
    const { size } = fs.statSync(src);
    let copy = true;
    if (fs.existsSync(dst) && fs.statSync(dst).size === size) copy = false;
    if (copy) {
      fs.copyFileSync(src, dst);
      staged++;
    }
  }
}
console.log(`[stage_audio] staged ${staged} new clip(s) into dist/audio/`);
