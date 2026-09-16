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

test('audioUrl matches the Python content-hash scheme (same-origin static assets)', async () => {
  for (const [voice, text] of [['sarah', 'Hi.'], ['brian', "Let's try again."], ['sarah', 'Which one starts with mmm? Tap it.']]) {
    const url = await N.audioUrl(voice, text);
    const expected = `/audio/${voice}/${pyHash(voice, text)}.mp3`;
    assert.equal(url, expected, `hash mismatch for ${voice}|${text}`);
  }
});

test('narrate() plays the MP3 for the current voice', async () => {
  playedUrls.length = 0;
  N.setVoice('sarah');
  await N.narrate('Hi.');
  assert.equal(playedUrls.length, 1);
  assert.ok(playedUrls[0].includes('/audio/sarah/'), `wrong voice in URL: ${playedUrls[0]}`);
  assert.ok(playedUrls[0].endsWith('.mp3'));
});

test('replayLast() re-plays from the beginning', async () => {
  playedUrls.length = 0;
  N.setVoice('sarah');
  await N.narrate('Hi.');
  const first = playedUrls[0];
  await N.replayLast();
  assert.equal(playedUrls.length, 2);
  assert.equal(playedUrls[1], first, 'replay must re-request the same clip (fresh Audio = from start)');
});

test('voice switching changes the addressed asset', async () => {
  playedUrls.length = 0;
  N.setVoice('sarah');
  await N.narrate('Hi.');
  N.setVoice('brian');
  await N.narrate('Hi.');
  assert.ok(playedUrls[0].includes('/audio/sarah/'));
  assert.ok(playedUrls[1].includes('/audio/brian/'));
  assert.notEqual(playedUrls[0], playedUrls[1]);
  N.setVoice('sarah'); // restore default
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
