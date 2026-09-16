// Curriculum data for The Reading Ladder.
// Pure data — no browser APIs, no JSX. Safe to import from node tests.
//
// Sound teaching order: high-utility, low-confusion first; confusables
// (b/d, e/i, m/n) spaced apart. Digraphs after single letters.

export const SOUNDS = [
  { g: 'm',  say: 'mmm', keyword: 'moon',     emoji: '🌙' },
  { g: 's',  say: 'sss', keyword: 'sun',      emoji: '☀️' },
  { g: 'a',  say: 'ah',  keyword: 'apple',    emoji: '🍎' },
  { g: 't',  say: 't',   keyword: 'tiger',    emoji: '🐯' },
  { g: 'p',  say: 'p',   keyword: 'pig',      emoji: '🐷' },
  { g: 'i',  say: 'ih',  keyword: 'igloo',    emoji: '🧊' },
  { g: 'n',  say: 'nnn', keyword: 'nose',     emoji: '👃' },
  { g: 'd',  say: 'd',   keyword: 'dog',      emoji: '🐶' },
  { g: 'o',  say: 'aw',  keyword: 'ox',       emoji: '🐂' },
  { g: 'c',  say: 'k',   keyword: 'cat',      emoji: '🐱' },
  { g: 'g',  say: 'g',   keyword: 'goat',     emoji: '🐐' },
  { g: 'e',  say: 'eh',  keyword: 'egg',      emoji: '🥚' },
  { g: 'u',  say: 'uh',  keyword: 'umbrella', emoji: '☂️' },
  { g: 'f',  say: 'fff', keyword: 'fish',     emoji: '🐟' },
  { g: 'r',  say: 'rrr', keyword: 'rabbit',   emoji: '🐰' },
  { g: 'l',  say: 'lll', keyword: 'lion',     emoji: '🦁' },
  { g: 'h',  say: 'h',   keyword: 'hat',      emoji: '🎩' },
  { g: 'b',  say: 'b',   keyword: 'ball',     emoji: '⚽' },
  { g: 'k',  say: 'k',   keyword: 'kite',     emoji: '🪁' },
  { g: 'j',  say: 'j',   keyword: 'jelly',    emoji: '🫙' },
  { g: 'v',  say: 'vvv', keyword: 'van',      emoji: '🚐' },
  { g: 'w',  say: 'w',   keyword: 'whale',    emoji: '🐳' },
  { g: 'x',  say: 'ks',  keyword: 'box',      emoji: '📦' },
  { g: 'y',  say: 'y',   keyword: 'yo-yo',    emoji: '🪀' },
  { g: 'z',  say: 'zzz', keyword: 'zebra',    emoji: '🦓' },
  { g: 'sh', say: 'sh',  keyword: 'ship',     emoji: '🚢' },
  { g: 'ch', say: 'ch',  keyword: 'cheese',   emoji: '🧀' },
  { g: 'th', say: 'th',  keyword: 'thumb',    emoji: '👍' },
  { g: 'ng', say: 'ng',  keyword: 'ring',     emoji: '💍' },
  { g: 'ck', say: 'k',   keyword: 'duck',     emoji: '🦆' },
];

export const SOUND_INDEX = Object.fromEntries(SOUNDS.map((s, i) => [s.g, i]));

// Words the story engine may use even though they contain untaught
// sounds. They are ALWAYS surfaced to the parent as "preview words".
export const PREVIEW_WORDS = ['the', 'a'];

// Word bank: [word, pos tags, animacy]
// pos: noun | verb | verbPast | verbPastTrans | adj | prep | modal | det | pron | conj | adv | interj | num
// anim: 'anim' (can sit/run) | 'thing' — only meaningful for nouns.
const RAW_BANK = [
  ['am','verb'], ['sam','noun','anim'],
  ['at','prep'], ['mat','noun','thing'], ['sat','verbPast','anim'],
  ['pat','verb'], ['tap','verb'], ['sap','noun','thing'], ['map','noun','thing'],
  ['it','pron'], ['sit','verb'], ['pit','noun','thing'], ['tip','noun','thing'], ['sip','verb'],
  ['in','prep'], ['an','det'], ['man','noun','anim'], ['pan','noun','thing'], ['pin','noun','thing'],
  ['tin','noun','thing'], ['tan','adj'], ['nap','verb'], ['nip','verb'], ['sin','noun','thing'], ['ant','noun','anim'],
  ['dad','noun','anim'], ['did','verbPastTrans'], ['mad','adj'], ['sad','adj'], ['pad','noun','thing'],
  ['dip','verb'], ['dim','adj'], ['dam','noun','thing'],
  ['on','prep'], ['not','adv'], ['pot','noun','thing'], ['top','noun','thing'], ['mop','noun','thing'],
  ['pop','verb'], ['nod','verb'], ['dot','noun','thing'], ['mom','noun','anim'], ['pod','noun','thing'], ['ton','noun','thing'],
  ['cat','noun','anim'], ['cap','noun','thing'], ['cot','noun','thing'], ['cop','noun','anim'],
  ['can','modal'], ['cod','noun','anim'],
  ['gag','verb'], ['gas','noun','thing'], ['gap','noun','thing'], ['tag','noun','thing'], ['pig','noun','anim'],
  ['dig','verb'], ['fig','noun','thing'], ['got','verbPastTrans'], ['gig','noun','thing'],
  ['met','verbPastTrans'], ['pet','noun','anim'], ['set','verb'], ['net','noun','thing'], ['ten','num'],
  ['pen','noun','thing'], ['men','noun','anim'], ['den','noun','thing'], ['get','verb'], ['egg','noun','thing'],
  ['up','prep'], ['us','pron'], ['cup','noun','thing'], ['pup','noun','anim'], ['mud','noun','thing'],
  ['sun','noun','thing'], ['tug','verb'], ['cut','verb'], ['nut','noun','thing'], ['gum','noun','thing'],
  ['tub','noun','thing'], ['dug','verbPastTrans'], ['sum','verb'],
  ['fun','noun'], ['fit','verb'], ['fin','noun','thing'], ['fan','noun','thing'], ['if','conj'],
  ['fed','verbPastTrans'], ['fog','noun','thing'],
  ['run','verb'], ['red','adj'], ['rat','noun','anim'], ['rip','verb'], ['rap','verb'],
  ['rim','noun','thing'], ['ram','noun','anim'], ['rot','verb'], ['rag','noun','thing'], ['rug','noun','thing'],
  ['rid','verb'], ['ran','verbPast','anim'],
  ['let','verb'], ['lit','verbPast','anim'], ['lip','noun','thing'], ['lap','noun','thing'], ['leg','noun','thing'],
  ['log','noun','thing'], ['lot','noun','thing'], ['lid','noun','thing'], ['lag','verb'],
  ['hat','noun','thing'], ['hot','adj'], ['hit','verbPastTrans'], ['hut','noun','thing'], ['hog','noun','anim'],
  ['ham','noun','thing'], ['hen','noun','anim'], ['had','verbPastTrans'], ['has','verb'],
  ['hid','verbPastTrans'], ['hop','verb'],
  ['hug','verb'], ['hush','verb'],
  ['bat','noun','anim'], ['bit','verbPastTrans'], ['but','conj'], ['bet','verb'], ['bad','adj'],
  ['bed','noun','thing'], ['big','adj'], ['bag','noun','thing'], ['bus','noun','thing'], ['bun','noun','thing'],
  ['bin','noun','thing'], ['bug','noun','anim'], ['rib','noun','thing'], ['rob','verb'], ['rub','verb'],
  ['kid','noun','anim'], ['kit','noun','thing'], ['kin','noun','anim'],
  ['jam','noun','thing'], ['jet','noun','thing'], ['jog','verb'], ['jug','noun','thing'], ['jut','verb'], ['jab','verb'], ['jig','noun','thing'],
  ['van','noun','thing'], ['vet','noun','anim'], ['vat','noun','thing'],
  ['win','verb'], ['wag','verb'], ['web','noun','thing'], ['wig','noun','thing'],
  ['ax','noun','thing'], ['ox','noun','anim'], ['box','noun','thing'], ['fox','noun','anim'],
  ['six','num'], ['mix','verb'], ['fix','verb'], ['wax','noun','thing'], ['tax','noun','thing'],
  ['yes','interj'], ['yam','noun','thing'], ['yet','adv'],
  ['zip','verb'], ['zap','verb'],
  ['ship','noun','thing'], ['shop','noun','thing'], ['shut','verbPast','thing'], ['fish','noun','anim'],
  ['wish','verb'], ['dish','noun','thing'], ['rash','noun','thing'], ['mash','verb'], ['ash','noun','thing'], ['cash','noun','thing'],
  ['chip','noun','thing'], ['chop','verb'], ['chat','verb'], ['rich','adj'], ['chug','verb'],
  ['this','det'], ['that','det'], ['then','adv'], ['with','prep'], ['thin','adj'], ['thud','noun','thing'], ['math','noun','thing'],
  ['sing','verb'], ['song','noun','thing'], ['long','adj'], ['king','noun','anim'], ['ring','noun','thing'],
  ['hang','verb'], ['sang','verbPast','anim'],
  ['duck','noun','anim'], ['kick','verb'], ['sick','adj'], ['back','adv'], ['neck','noun','thing'],
  ['rock','noun','thing'], ['lock','noun','thing'], ['sock','noun','thing'], ['pick','verb'], ['pack','verb'],
  ['lick','verb'], ['luck','noun','thing'], ['tick','noun','thing'], ['tack','noun','thing'], ['tuck','verb'],
];

export const WORD_BANK = RAW_BANK.map(([w, pos, anim]) => ({ w, pos, anim: anim || null }));

// Emoji for story nouns (optional decoration; absent = no emoji).
export const NOUN_EMOJI = {
  sam: '🧒', cat: '🐱', dog: '🐶', pig: '🐷', fish: '🐟', fox: '🦊', duck: '🦆',
  hen: '🐔', kid: '🧒', man: '👨', mom: '👩', dad: '🧑', bug: '🐞', rat: '🐭',
  ant: '🐜', hog: '🐖', pup: '🐶', ox: '🐂', ram: '🐏', cop: '👮', vet: '🧑‍⚕️',
  king: '🤴', pet: '🐕', men: '👥', kin: '👪',
  sun: '☀️', box: '📦', hat: '🎩', egg: '🥚', ship: '🚢', rock: '🪨', sock: '🧦',
  cup: '☕',
};

// Sentence templates. Slots: {slot:'noun'|'verb'|..., anim?:bool, trans?:bool}
// Literals are validated against the decodability contract too.
export const TEMPLATES = [
  [{ lit: 'the' }, { slot: 'adj' }, { slot: 'noun', anim: true }, { slot: 'verbPast', trans: false }],
  [{ lit: 'a' }, { slot: 'noun', anim: true }, { lit: 'can' }, { slot: 'verb' }],
  [{ lit: 'the' }, { slot: 'noun' }, { slot: 'verbPast', trans: true }, { lit: 'the' }, { slot: 'noun' }],
  [{ lit: 'the' }, { slot: 'noun', anim: true }, { slot: 'verbPast', trans: false }, { lit: 'on' }, { lit: 'the' }, { slot: 'noun' }],
  [{ slot: 'noun', anim: true }, { slot: 'verbPast', trans: false }],
  [{ lit: 'a' }, { slot: 'adj' }, { slot: 'noun' }, { slot: 'verbPast', trans: true }, { lit: 'a' }, { slot: 'noun' }],
];

// Offline missions. {g} letter, {G} uppercase, {say} sound, {word} a word, {keyword} sound keyword.
export const MISSIONS = [
  'Find 3 things that start with the /{say}/ sound.',
  'Make the letter {G} with sticks, clay, or crayons.',
  "Step once for each sound in '{word}', then jump and say the word!",
  'Find the letter {G} on a cereal box or a book cover.',
  'Teach a toy how to say /{say}/.',
  "Clap the sounds in '{word}' with a grown-up.",
  'Draw a {keyword} and say its first sound: /{say}/.',
  "Play I-spy: spy something that starts with /{say}/.",
  "Build '{word}' with paper letters. Mix them up and build it again.",
  'Find a book. Point to the letter {G} on a page.',
];

export const COMPANIONS = [
  { id: 'fox', emoji: '🦊', name: 'Fox' },
  { id: 'rabbit', emoji: '🐰', name: 'Bunny' },
  { id: 'owl', emoji: '🦉', name: 'Owl' },
  { id: 'turtle', emoji: '🐢', name: 'Turtle' },
];

export const COMPANION_COLORS = [
  { id: 'purple', bg: '#e6dcff' },
  { id: 'blue', bg: '#dbeafe' },
  { id: 'green', bg: '#dcfce7' },
  { id: 'pink', bg: '#fce7f3' },
  { id: 'yellow', bg: '#fef9c3' },
];

// Finite cosmetic rewards: one accessory unlocked per completed session.
export const ACCESSORIES = [
  { id: 'none', emoji: '', name: 'None' },
  { id: 'hat', emoji: '🎩', name: 'Top hat' },
  { id: 'cap', emoji: '🧢', name: 'Cap' },
  { id: 'bow', emoji: '🎀', name: 'Bow' },
  { id: 'star', emoji: '⭐', name: 'Star' },
  { id: 'glasses', emoji: '🕶️', name: 'Sunglasses' },
];
