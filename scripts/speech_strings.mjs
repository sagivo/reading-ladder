// Shared helper: statically extract every string the app can speak.
//
// Scans src/**/*.js(x) for calls to the narration API
//   speak, speakSound, speakSoundsSeparately, speakSlow,
//   narrate, narrateQueue, celebrate
// and pulls out plain string-literal arguments. Template literals containing
// ${...} are NOT resolvable statically — they're reported as `interpolated`
// sites so the catalog builder's hand-enumerated expansions can be checked
// against them (that's how stale strings like the old blend direction
// silently lost their audio clips).
//
// celebrate() emoji-strips its text at runtime (praise.js), so literals from
// celebrate() calls are stripped the same way here — otherwise the hash
// never matches the pre-generated clip.

import fs from 'node:fs';
import path from 'node:path';

const CALL_RE =
  /(speak|speakSound|speakSoundsSeparately|speakSlow|narrate|narrateQueue|celebrate)\s*\(/g;

// Strip emoji exactly like praise.js celebrate() does.
const EMOJI_RE = /[‍\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;
function stripEmoji(s) {
  return s.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}

function unescapeStr(s) {
  // Handles the escapes that appear in spoken strings: \\ \' \" \` \n \t
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\(['"`\\])/g, '$1');
}

// Parse one string literal starting at src[i] (src[i] is the quote char).
// Returns { text, end } or null. Template literals report hasInterp.
function parseString(src, i) {
  const q = src[i];
  let j = i + 1;
  let out = '';
  let hasInterp = false;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\' && j + 1 < src.length) {
      out += c + src[j + 1];
      j += 2;
      continue;
    }
    if (q === '`' && c === '$' && src[j + 1] === '{') {
      hasInterp = true;
      // skip the ${...} expression with brace counting
      let depth = 1;
      j += 2;
      while (j < src.length && depth > 0) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        j++;
      }
      continue;
    }
    if (c === q) {
      return { text: unescapeStr(out), end: j + 1, hasInterp };
    }
    if (c === '\n' && q !== '`') return null; // unterminated single-line
    out += c;
    j++;
  }
  return null;
}

function skipWs(src, i) {
  while (i < src.length && /\s/.test(src[i])) i++;
  return i;
}

export function extractSpokenLiterals(srcDir) {
  const literals = new Map(); // text -> Set(files)
  const interpolated = []; // { file, line, call, preview }

  function addLiteral(text, file, call) {
    const t = call === 'celebrate' ? stripEmoji(text) : text;
    if (!t) return;
    if (!literals.has(t)) literals.set(t, new Set());
    literals.get(t).add(file);
  }

  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(e.name)) scanFile(p);
    }
  }

  function scanFile(file) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(srcDir, file);
    CALL_RE.lastIndex = 0;
    let m;
    while ((m = CALL_RE.exec(src))) {
      const call = m[1];
      let i = skipWs(src, m.index + m[0].length);
      const line = src.slice(0, m.index).split('\n').length;
      if (i >= src.length) continue;
      const ch = src[i];
      if (ch === '[') {
        // narrateQueue([...]) — extract every string element
        i++;
        while (i < src.length && src[i] !== ']') {
          i = skipWs(src, i);
          if (src[i] === "'" || src[i] === '"' || src[i] === '`') {
            const r = parseString(src, i);
            if (!r) break;
            if (r.hasInterp) interpolated.push({ file: rel, line, call, preview: r.text.slice(0, 80) });
            else addLiteral(r.text, rel, call);
            i = r.end;
          } else {
            i++;
          }
          i = skipWs(src, i);
          if (src[i] === ',') i++;
        }
        continue;
      }
      if (ch !== "'" && ch !== '"' && ch !== '`') {
        // Not a literal first arg (identifier, member expr, conditional...).
        // If it's a template literal it was caught above; anything else we
        // can't resolve — but a backtick check is cheap, so peek anyway.
        continue;
      }
      const r = parseString(src, i);
      if (!r) continue;
      // Concatenation ('a' + b): the literal alone is never spoken — skip.
      const after = skipWs(src, r.end);
      if (src[after] === '+') continue;
      if (r.hasInterp) {
        interpolated.push({ file: rel, line, call, preview: r.text.slice(0, 80) });
      } else {
        addLiteral(r.text, rel, call);
      }
    }

    // ---------- Phase 2: JSX props that are spoken ----------
    // QuizStep speaks its `instruction` prop on mount (unless speakInstruction
    // is false) and ALWAYS on retry ("Let's try again." + instruction). Those
    // strings are narration too - treat them as spoken literals/templates.
    // Simple const strings in the file, so `instruction={instruction}` (a bare
    // identifier) can be resolved to the assigned literal.
    const constStrings = []; // [{ name, pos, r }] — nearest preceding declaration wins
    for (const cm of src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*['"`]/g)) {
      const litStart = cm.index + cm[0].length - 1;
      const r = parseString(src, litStart);
      // Only plain assignments: the char after the literal must be `;`
      if (r && skipWs(src, r.end) < src.length && src[skipWs(src, r.end)] === ';') {
        constStrings.push({ name: cm[1], pos: cm.index, r });
      }
    }
    const resolveInstruction = (expr, pline, ppos) => {
      let best = null;
      for (const c of constStrings) {
        if (c.name === expr && c.pos < ppos && (!best || c.pos > best.pos)) best = c;
      }
      if (!best) {
        interpolated.push({ file: rel, line: pline, call: 'instruction', preview: `{${expr}} (unresolved)` });
        return;
      }
      const r = best.r;
      if (r.hasInterp) interpolated.push({ file: rel, line: pline, call: 'instruction', preview: r.text.slice(0, 80) });
      else addLiteral(r.text, rel, 'instruction');
    };
    for (const pm of src.matchAll(/instruction=\{(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\}/g)) {
      const raw = pm[1];
      const q = raw[0];
      const pline = src.slice(0, pm.index).split('\n').length;
      let out = '';
      let pi = 1;
      while (pi < raw.length - 1) {
        const ch = raw[pi];
        if (ch === '\\') { out += raw[pi + 1] ?? ''; pi += 2; continue; }
        if (q === '`' && ch === '$' && raw[pi + 1] === '{') {
          let depth = 1; let j = pi + 2;
          while (j < raw.length && depth > 0) {
            if (raw[j] === '{') depth++;
            else if (raw[j] === '}') depth--;
            j++;
          }
          pi = j; continue;
        }
        out += ch; pi++;
      }
      if (raw.includes('${')) interpolated.push({ file: rel, line: pline, call: 'instruction', preview: out.slice(0, 80) });
      else addLiteral(out, rel, 'instruction');
    }
    for (const pm of src.matchAll(/instruction="([^"]*)"/g)) {
      addLiteral(unescapeStr(pm[1]), rel, 'instruction');
    }
    for (const pm of src.matchAll(/instruction=\{([A-Za-z_$][\w$]*)\}/g)) {
      resolveInstruction(pm[1], src.slice(0, pm.index).split('\n').length, pm.index);
    }
  }


  walk(srcDir);


  return { literals, interpolated };
}
