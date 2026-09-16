// Audio-coverage drift guard: every plain string literal handed to the
// narration API in src/ must have a pre-generated Kristy clip listed in the
// committed manifest (src/lib/audioManifest.js).
//
// This is the regression test for the bug where a reworded speak() string
// (e.g. the readiness blend direction) silently lost its MP3: the catalog
// builder's hand-maintained list had the OLD wording, the clip hash never
// matched, and the utterance fell back to Web Speech — which randomly cuts
// off on Android, so children heard nothing.
//
// If this test fails after you reword/add a speak() string: run
//   node scripts/build_audio_catalog.mjs
//   node scripts/generate_audio_speechify.py   (or the project's gen script)
//   node scripts/build_audio_manifest.mjs
// and commit the new clips + manifest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..', 'src');

const { extractSpokenLiterals } = await import('../scripts/speech_strings.mjs');
const { AUDIO_MANIFEST } = await import('../src/lib/audioManifest.js');

const hash = (text) =>
  createHash('sha256').update(`kristy|${text}`, 'utf8').digest('hex').slice(0, 32);

const { literals, interpolated } = extractSpokenLiterals(srcDir);

test('every spoken string literal has a pre-generated clip in the manifest', () => {
  const missing = [];
  for (const [text, files] of literals) {
    if (!AUDIO_MANIFEST.has(`kristy/${hash(text)}`)) {
      missing.push(`"${text.slice(0, 70)}" (${[...files].join(', ')})`);
    }
  }
  assert.equal(
    missing.length, 0,
    `spoken strings with no pre-generated clip:\n  - ${missing.join('\n  - ')}\n` +
      'Regenerate: build_audio_catalog.mjs -> generate_audio_speechify.py -> build_audio_manifest.mjs'
  );
});

test('no dynamic child-name speak() (names fall back to Web Speech)', () => {
  // Spoken names can never have pre-generated clips (unbounded values), so
  // they always take the Web Speech path. Greetings/names must use fixed
  // generic strings instead.
  const bad = interpolated.filter((s) => /\.name\}?/.test(s.preview) || s.preview.includes('${p.name'));
  assert.equal(
    bad.length, 0,
    `dynamic name in spoken template:\n  - ${bad.map((s) => `${s.file}:${s.line}`).join('\n  - ')}`
  );
});
