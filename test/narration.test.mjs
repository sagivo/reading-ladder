// Narration player tests: hash addressing, MP3-first playback, replay,
// voice switching. Audio + crypto.subtle are mocked (node has webcrypto).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// ---- browser mocks ----
const playedUrls = [];
globalThis.Audio = class {
  constructor(url) {
    this.url = url;
    this.preload = null;
    playedUrls.push(url);
  }
  play() {
    // Simulate successful MP3 playback.
    queueMicrotask(() => this.onended && this.onended());
    return Promise.resolve();
  }
  pause() {}
};
// narration.js uses globalThis.crypto.subtle (node provides webcrypto).
assert.ok(globalThis.crypto && globalThis.crypto.subtle, 'need webcrypto');

const N = await import('../src/lib/narration.js');

function pyHash(voice, text) {
  return createHash('sha256').update(`${voice}|${text}`, 'utf8').digest('hex').slice(0, 32);
}

// Tests run without real MP3s: register the test strings in the manifest so
// playClip() takes the MP3 path, the way production does for covered clips.
{
  const entries = [];
  for (const voice of ['kristy'])
    for (const text of ['Hi.', "Let's try again.", 'Which one starts with mmm? Tap it.', 'One.', 'Two.'])
      entries.push(`${voice}/${pyHash(voice, text)}`);
  N.__setAudioManifestForTest(entries);
}

test('audioUrl matches the Python content-hash scheme (same-origin static assets)', async () => {
  for (const [voice, text] of [['kristy', 'Hi.'], ['kristy', "Let's try again."], ['kristy', 'Which one starts with mmm? Tap it.']]) {
    const url = await N.audioUrl(voice, text);
    const expected = `/audio/${voice}/${pyHash(voice, text)}.mp3`;
    assert.equal(url, expected, `hash mismatch for ${voice}|${text}`);
  }
});

test('narrate() plays the MP3 for the current voice', async () => {
  playedUrls.length = 0;
  N.setVoice('kristy');
  await N.narrate('Hi.');
  assert.equal(playedUrls.length, 1);
  assert.ok(playedUrls[0].includes('/audio/kristy/'), `wrong voice in URL: ${playedUrls[0]}`);
  assert.ok(playedUrls[0].endsWith('.mp3'));
});

test('replayLast() re-plays from the beginning', async () => {
  playedUrls.length = 0;
  N.setVoice('kristy');
  await N.narrate('Hi.');
  const first = playedUrls[0];
  await N.replayLast();
  assert.equal(playedUrls.length, 2);
  assert.equal(playedUrls[1], first, 'replay must re-request the same clip (fresh Audio = from start)');
});

test('single voice: setVoice ignores unknown voices', async () => {
  playedUrls.length = 0;
  N.setVoice('kristy');
  await N.narrate('Hi.');
  N.setVoice('sarah'); // legacy voice no longer exists — must be ignored
  await N.narrate('Hi.');
  assert.ok(playedUrls[0].includes('/audio/kristy/'));
  assert.ok(playedUrls[1].includes('/audio/kristy/'), 'unknown voice must not change addressing');
  assert.equal(playedUrls[0], playedUrls[1]);
});

test('narrateQueue plays parts in order', async () => {
  playedUrls.length = 0;
  await N.narrateQueue(["Let's try again.", 'Which one starts with mmm? Tap it.']);
  assert.equal(playedUrls.length, 2);
});

test('stop() cancels without throwing', async () => {
  N.stop();
  assert.ok(true);
});

test('manifest miss skips the MP3 attempt (no dead-air fetch for unclipped strings)', async () => {
  playedUrls.length = 0;
  await N.narrate('This string has no clip 12345.');
  assert.equal(playedUrls.length, 0, 'must not attempt an MP3 fetch for a hash outside the manifest');
});

test('mute switch: narrate() is a no-op while muted (MP3 path)', async () => {
  playedUrls.length = 0;
  N.setSoundEnabled(true);
  assert.equal(N.isSoundEnabled(), true);
  N.setSoundEnabled(false);
  assert.equal(N.isSoundEnabled(), false);
  await N.narrate('Hi.');
  await N.narrateQueue(['One.', 'Two.']);
  assert.equal(playedUrls.length, 0, 'no MP3 may play while muted');
  N.setSoundEnabled(true); // restore for other tests
});

test('mute switch: narrate() plays again after unmuting', async () => {
  playedUrls.length = 0;
  N.setSoundEnabled(false);
  N.setSoundEnabled(true);
  await N.narrate('Hi.');
  assert.equal(playedUrls.length, 1, 'unmuting must restore playback');
});
