// Session end: hard but friendly. Celebrate precisely, issue ONE offline
// mission, and offer only "Done". No "one more lesson" — the loop closes.

import React, { useEffect } from 'react';
import { Screen, BigButton, Title, Subtitle } from './ui.jsx';
import { narrateQueue, stop } from '../lib/narration.js';
import { SOUNDS, ACCESSORIES } from '../lib/curriculum.js';
import { companionEmoji, companionBg } from './Home.jsx';

export default function SessionEnd({ profile, summary, unlockedAccessory, onDone, onCompanion }) {
  const sound = SOUNDS.find((s) => s.g === summary.newSound);

  useEffect(() => {
    stop();
    // Fixed parts via narrateQueue, not one composed string: the composed
    // string could never match a pre-generated clip hash, so the whole
    // summary fell back to Web Speech. Only the mission text is dynamic.
    const parts = ['All done!'];
    if (summary.newSound) parts.push(`You learned the sound ${sound ? sound.say : summary.newSound}.`);
    if (summary.wordsRead) parts.push(`You read ${summary.wordsRead} ${summary.wordsRead === 1 ? 'word' : 'words'}.`);
    if (summary.soundMastered) parts.push('You mastered a sound!');
    // The offline mission is the loop-closer: it must be SPOKEN, not just
    // shown — a pre-reader can never read it off the screen.
    if (summary.mission) parts.push(`Time for a real-world mission. ${summary.mission} Tell a grown-up when you've done it.`);
    parts.push('Tap Done to finish.');
    narrateQueue(parts);
  }, []);

  const acc = ACCESSORIES.find((a) => a.id === unlockedAccessory);

  return (
    <Screen bg="linear-gradient(160deg, #e8fbef 0%, #eef6ff 100%)">
      <div style={{
        width: 130, height: 130, borderRadius: '50%', fontSize: 72,
        background: companionBg(profile.companion), display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {companionEmoji(profile.companion)}
      </div>
      <Title>All done! 🎉</Title>
      <Subtitle>
        {summary.newSound && <>You learned{' '}<b>/{sound ? sound.say : summary.newSound}/</b>{' '}({summary.newSound}).<br /></>}
        {summary.wordsRead > 0 && <>You read <b>{summary.wordsRead}</b> {summary.wordsRead === 1 ? 'word' : 'words'}.<br /></>}
        {summary.soundMastered && <>🌟 You <b>mastered</b> a sound!<br /></>}
        {summary.minutes != null && <>Lesson time: {summary.minutes} min.<br /></>}
      </Subtitle>

      {acc && acc.emoji && (
        <div style={{
          background: '#fff7d6', border: '4px solid #f5b301', borderRadius: 20,
          padding: '14px 22px', fontSize: 22, fontWeight: 700, textAlign: 'center',
        }}>
          🎁 New for your buddy: {acc.emoji} {acc.name}!
          <div><button onClick={onCompanion} style={{ background: 'none', border: 'none', color: '#6f66a8', fontSize: 20, textDecoration: 'underline', cursor: 'pointer', minHeight: 48, padding: '8px 16px' }}>Try it on</button></div>
        </div>
      )}

      <div style={{
        background: '#fff', borderRadius: 24, padding: 24, width: '100%',
        border: '4px solid #7c5cd6', textAlign: 'center',
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#7c5cd6', marginBottom: 8 }}>🌍 OFFLINE MISSION</div>
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.4 }}>{summary.mission}</div>
        <div style={{ fontSize: 20, color: '#5b567d', marginTop: 8 }}>Tell a grown-up when you've done it.</div>
      </div>

      <BigButton color="#22a06b" onClick={() => { stop(); onDone(); }}>
        Done — put the tablet away 📴
      </BigButton>
    </Screen>
  );
}
