'use strict';
/* Reine Logik ohne Browser-Abhängigkeit (wird auch in Node getestet). */

function norm(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/* 'good' | 'close' | 'miss' */
function gradeLetter(L, alts) {
  let close = false;
  for (const alt of alts) {
    const n = norm(alt);
    if (!n) continue;
    const padded = ' ' + n + ' ';
    for (const a of L.accept) {
      if (n === a || padded.includes(' ' + a + ' ')) return 'good';
    }
    if (n.split(' ').some(tok => tok.length >= 2 && lev(tok, L.tts) <= 1)) close = true;
  }
  return close ? 'close' : 'miss';
}

function gradeWord(word, alts) {
  let best = 99;
  for (const alt of alts) {
    for (const tok of norm(alt).split(' ')) {
      if (tok) best = Math.min(best, lev(tok, word));
    }
  }
  const lim = word.length <= 3 ? 1 : 2;
  if (best === 0) return 'good';
  if (best <= lim) return 'close';
  return 'miss';
}

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromStr(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function shuffle(arr, r) {
  r = r || Math.random;
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildOptions(letter, pool, r) {
  const others = shuffle(pool.filter(x => x !== letter), r).slice(0, 3);
  return shuffle([letter, ...others], r);
}

if (typeof module !== 'undefined') {
  module.exports = { norm, lev, gradeLetter, gradeWord, rng, seedFromStr, shuffle, buildOptions };
}
