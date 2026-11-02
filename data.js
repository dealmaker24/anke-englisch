'use strict';
/*
  Lerninhalt: Alphabet.
  say   = deutsche Lautschrift des Buchstabennamens (so liest es Anke auf dem Bildschirm)
  tts   = Text, den die Stimme spricht, damit der BUCHSTABENNAME kommt (nicht das Wort "a")
  word  = englisches Beispielwort, wsay = deutsche Lautschrift des Wortes, de = Bedeutung
  accept= was die Spracherkennung beim Buchstaben typischerweise liefert
*/
const LETTERS = [
  { l:'A', say:'ei',     tts:'ay',       accept:['a','ay','hey','eh','eight','8'],          word:'apple',    wsay:'äppl',      de:'Apfel',        emoji:'🍎', tip:'Wie „ei“ in Eis – der Mund startet offen: „ehi“.' },
  { l:'B', say:'bie',    tts:'bee',      accept:['b','bee','be','bi'],                      word:'ball',     wsay:'bohl',      de:'Ball',         emoji:'⚽', tip:'Lippen schließen, dann „bie“ – wie in Biene.' },
  { l:'C', say:'sie',    tts:'see',      accept:['c','see','sea','cee','si'],               word:'cat',      wsay:'kätt',      de:'Katze',        emoji:'🐱', tip:'Klingt wie „sie“ – nicht wie das deutsche C.' },
  { l:'D', say:'die',    tts:'dee',      accept:['d','dee','de','the'],                     word:'dog',      wsay:'dogg',      de:'Hund',         emoji:'🐶', tip:'Wie „die“ – Zungenspitze hinter die oberen Zähne.' },
  { l:'E', say:'ie',     tts:'ee',       accept:['e','ee','he','eat'],                      word:'egg',      wsay:'egg',       de:'Ei',           emoji:'🥚', tip:'Wie ein langes „ie“ in Biene.' },
  { l:'F', say:'eff',    tts:'eff',      accept:['f','eff','ef','if','and'],                word:'fish',     wsay:'fisch',     de:'Fisch',        emoji:'🐟', tip:'Obere Zähne auf die Unterlippe: „eff“.' },
  { l:'G', say:'dschie', tts:'gee',      accept:['g','gee','jee','ji','she'],               word:'goat',     wsay:'gout',      de:'Ziege',        emoji:'🐐', tip:'Wie „dschie“ – nicht wie das deutsche „ge“.' },
  { l:'H', say:'eitsch', tts:'aitch',    accept:['h','aitch','etch','age','each'],          word:'horse',    wsay:'hors',      de:'Pferd',        emoji:'🐴', tip:'„ei“ plus weiches „tsch“ am Ende: eitsch.' },
  { l:'I', say:'ai',     tts:'eye',      accept:['i','eye','aye','ai','hi'],                word:'ice',      wsay:'ais',       de:'Eis',          emoji:'🧊', tip:'Wie „ai“ in Hai – genau wie das Wort „eye“ (Auge).' },
  { l:'J', say:'dschei', tts:'jay',      accept:['j','jay','jae','jake','day'],             word:'juice',    wsay:'dschuhs',   de:'Saft',         emoji:'🧃', tip:'Wie „dschei“ – das „dsch“ wie in Dschungel.' },
  { l:'K', say:'kei',    tts:'kay',      accept:['k','kay','okay','ok','cay'],              word:'key',      wsay:'kie',       de:'Schlüssel',    emoji:'🔑', tip:'Wie „kei“ – mit kleinem Luftstoß.' },
  { l:'L', say:'ell',    tts:'el',       accept:['l','el','ell','elle','hell'],             word:'lion',     wsay:'laien',     de:'Löwe',         emoji:'🦁', tip:'Zungenspitze oben hinter die Zähne: „ell“.' },
  { l:'M', say:'emm',    tts:'em',       accept:['m','em','am','emma'],                     word:'moon',     wsay:'muhn',      de:'Mond',         emoji:'🌙', tip:'Lippen schließen und summen: „emm“.' },
  { l:'N', say:'enn',    tts:'en',       accept:['n','en','and','in','end'],                word:'nose',     wsay:'nous',      de:'Nase',         emoji:'👃', tip:'Zunge hinter die oberen Zähne: „enn“.' },
  { l:'O', say:'oh',     tts:'oh',       accept:['o','oh','owe','0','zero'],                word:'orange',   wsay:'orrindsch', de:'Orange',       emoji:'🍊', tip:'Wie „oh“ – am Ende leicht zu „ou“ werden lassen.' },
  { l:'P', say:'pie',    tts:'pee',      accept:['p','pee','pea','pi','peeve'],             word:'pig',      wsay:'pigg',      de:'Schwein',      emoji:'🐷', tip:'Kleiner Luftstoß: „pie“. Halte die Hand vor den Mund.' },
  { l:'Q', say:'kjuh',   tts:'cue',      accept:['q','cue','queue','kew','que'],            word:'queen',    wsay:'kwien',     de:'Königin',      emoji:'👑', tip:'„kjuh“ – wie „Kju“ in Kjubik.' },
  { l:'R', say:'ahr',    tts:'are',      accept:['r','are','our','ar','art'],               word:'rabbit',   wsay:'räbbit',    de:'Hase',         emoji:'🐰', tip:'„ahr“ – das R nicht rollen, die Zunge hängt locker.' },
  { l:'S', say:'ess',    tts:'ess',      accept:['s','ess','es','yes','as'],                word:'sun',      wsay:'ssann',     de:'Sonne',        emoji:'☀️', tip:'Scharfes S: „ess“.' },
  { l:'T', say:'tie',    tts:'tee',      accept:['t','tee','tea','ti','team'],              word:'tree',     wsay:'trie',      de:'Baum',         emoji:'🌳', tip:'Wie „tie“ – mit kleinem Luftstoß.' },
  { l:'U', say:'juh',    tts:'you',      accept:['u','you','ew','yu','yew'],                word:'umbrella', wsay:'ammbrella', de:'Regenschirm',  emoji:'☂️', tip:'Wie „ju“ – genau wie das Wort „you“ (du).' },
  { l:'V', say:'wie',    tts:'vee',      accept:['v','vee','we','vi'],                word:'violin',   wsay:'waiolinn',  de:'Geige',        emoji:'🎻', tip:'Obere Zähne auf die Unterlippe, mit Stimme: „wie“.' },
  { l:'W', say:'dabbel-juh', tts:'double you', accept:['w','double you','doubleyou','double u','doubleu'], word:'water', wsay:'wohter', de:'Wasser', emoji:'💧', tip:'„Doppel-U“ heißt es: dabbel-juh.' },
  { l:'X', say:'ex',     tts:'ex',       accept:['x','ex','eggs','axe','acts'],             word:'xylophone', wsay:'sailofohn', de:'Xylophon',     emoji:'🎹', tip:'Wie „ex“ in Export.' },
  { l:'Y', say:'wai',    tts:'why',      accept:['y','why','wye','wine','wire'],            word:'yellow',   wsay:'jello',     de:'gelb',         emoji:'💛', tip:'Wie „wai“ – genau wie das Wort „why“ (warum).' },
  { l:'Z', say:'sie',    tts:'zee',      accept:['z','zee','zed','see','sea'],              word:'zebra',    wsay:'siebra',    de:'Zebra',        emoji:'🦓', tip:'Amerikanisch „sie“, britisch „sed“. Wir üben „sie“ (zee).' }
];

const LESSONS = [
  { id:1, title:'A · B · C · D',     letters:['A','B','C','D'], icon:'🍎' },
  { id:2, title:'E · F · G · H',     letters:['E','F','G','H'], icon:'🐴' },
  { id:3, title:'I · J · K · L',     letters:['I','J','K','L'], icon:'🦁' },
  { id:4, title:'M · N · O · P',     letters:['M','N','O','P'], icon:'🌙' },
  { id:5, title:'Q · R · S · T',     letters:['Q','R','S','T'], icon:'👑' },
  { id:6, title:'U · V · W · X',     letters:['U','V','W','X'], icon:'☂️' },
  { id:7, title:'Y · Z + Wiederholung', letters:['Y','Z'], icon:'🦓', reviewExtra:4 }
];

const COMING_SOON = [
  { title:'Zahlen 1 – 10', icon:'🔢' },
  { title:'Hello! Begrüßung', icon:'👋' },
  { title:'Farben', icon:'🎨' },
  { title:'Meine Familie', icon:'👨‍👩‍👧' }
];

const LETTER_BY = Object.fromEntries(LETTERS.map(x => [x.l, x]));

// Node-Export nur für Tests, im Browser ohne Wirkung
if (typeof module !== 'undefined') module.exports = { LETTERS, LESSONS, LETTER_BY };
