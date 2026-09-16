// Session end: hard but friendly. Celebrate precisely, issue ONE offline
// mission, and offer only "Done". No "one more lesson" — the loop closes.

import React, { useEffect } from 'react';
import { Screen, BigButton, Title, Subtitle } from './ui.jsx';
import { speak, stop } from '../lib/speech.js';
import { SOUNDS, ACCESSORIES } from '../lib/curriculum.js';
import { companionEmoji, companionBg } from './Home.jsx';

export default function SessionEnd({ profile, summary, unlockedAccessory, onDone, onCompanion }) {
  const sound = SOUNDS.find((s) => s.g === summary.newSound);

  useEffect(() => {
    stop();
    const bits = [];
    if (summary.newSound) bits.push(`You learned the sound ${sound ? sound.say : summary.newSound}.`);
    if (summary.wordsRead) bits.push(`You read ${summary.wordsRead} words.`);
    speak(`All done, ${profile.name}! ` + bits.join(' ') + ' Time for a real-world mission.');
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
        {summary.newSound && <>You learned <b>/{sound ? sound.say : summary.newSound}/</b> ({summary.newSound}).<br /></>}
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
          <div><button onClick={onCompanion} style={{ background: 'none', border: 'none', color: '#7c5cd6', fontSize: 19, textDecoration: 'underline', cursor: 'pointer' }}>Try it on</button></div>
        </div>
      )}

      <div style={{
        background: '#fff', borderRadius: 24, padding: 24, width: '100%',
        border: '4px solid #7c5cd6', textAlign: 'center',
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#7c5cd6', marginBottom: 8 }}>🌍 OFFLINE MISSION</div>
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.4 }}>{summary.mission}</div>
        <div style={{ fontSize: 18, color: '#5b567d', marginTop: 8 }}>Tell a grown-up when you've done it.</div>
      </div>

      <BigButton color="#22a06b" onClick={() => { stop(); onDone(); }}>
        Done — put the tablet away 📴
      </BigButton>
    </Screen>
  );
}
