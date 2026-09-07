// Utilities for importing a Corpus Monodicum "monodi workspace" export
// (*.monodijson) into the adiastematic search engine.
//
// A monodi workspace stores absolute pitches (base letter + octave). We convert
// each melody into a Volpiano string and derive the adiastematic contour, so the
// imported material behaves exactly like the pre-built corpora shipped in
// search_data.json.
//
// IMPORTANT: imported corpora live only in this browser's localStorage. See
// ImportCorpus.jsx for the user-facing warning about non-persistent storage.

export const IMPORTED_CORPORA_KEY = 'adiastematic_imported_corpora';

// Matches build_corpus.py so contour generation is identical across corpora.
const VOLPIANO_ALPHABET = '89abcdefghijklmnopqrstuvw';
const POSITION_MAP = {};
for (let i = 0; i < VOLPIANO_ALPHABET.length; i++) {
  POSITION_MAP[VOLPIANO_ALPHABET[i]] = i;
}

// Ascending Volpiano pitch letters (the real font skips the letter "i").
const VOLPIANO_ASC = [
  '8', '9', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
  'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's',
  't', 'u', 'v', 'w'
];
// Index of 'j' (middle C, c') within VOLPIANO_ASC — used as the pitch anchor.
const MIDDLE_C_INDEX = VOLPIANO_ASC.indexOf('j');
const BASE_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

// Port of build_corpus.py :: transform_to_contour, kept byte-for-byte compatible
// with the Python pipeline so imported items sort/search like native ones.
export function transformToContour(volpianoMelody) {
  if (typeof volpianoMelody !== 'string') return null;

  const notes = [];
  for (let i = 0; i < volpianoMelody.length; i++) {
    const lowerC = volpianoMelody[i].toLowerCase();
    if (lowerC in POSITION_MAP) {
      notes.push({ char: lowerC, pos: i });
    }
  }
  if (notes.length === 0) return null;

  const contour = ['*'];
  for (let i = 0; i < notes.length - 1; i++) {
    const n1 = notes[i];
    const n2 = notes[i + 1];
    const p1 = POSITION_MAP[n1.char];
    const p2 = POSITION_MAP[n2.char];

    let c;
    if (p2 > p1) c = 'u';
    else if (p2 < p1) c = 'd';
    else c = 'r';

    const inter = volpianoMelody.slice(n1.pos + 1, n2.pos);
    const hyphenCount = (inter.match(/-/g) || []).length;
    const hasBarline = /[3467]/.test(inter);

    if (hyphenCount >= 2 || hasBarline) contour.push('___');
    else if (hyphenCount === 1) contour.push(' ');

    contour.push(c);
  }
  return contour.join('');
}

// Convert a monodi note (base letter + octave) into a single Volpiano character.
// The monodi editor numbers octaves so that C in octave 5 is middle C (c' = "j").
function noteToVolpiano(base, octave) {
  if (typeof base !== 'string') return null;
  const bi = BASE_INDEX[base.toUpperCase()];
  if (bi === undefined) return null;
  const oct = Number(octave);
  if (!Number.isFinite(oct)) return null;

  const diatonic = (oct - 5) * 7 + bi; // 0 == middle C
  let idx = MIDDLE_C_INDEX + diatonic;
  if (idx < 0) idx = 0;
  if (idx >= VOLPIANO_ASC.length) idx = VOLPIANO_ASC.length - 1;
  return VOLPIANO_ASC[idx];
}

// A syllable carries its notes in a spaced -> nonSpaced -> grouped tree.
// grouped = one ligature (tight, no hyphen); every coarser boundary becomes a
// single "-" (a neume separation, i.e. a space in the contour).
function syllableToVolpiano(syllable) {
  const spaced = syllable?.notes?.spaced;
  if (!Array.isArray(spaced)) return '';

  const neumeSegments = [];
  for (const sp of spaced) {
    const nonSpaced = sp?.nonSpaced;
    if (!Array.isArray(nonSpaced)) continue;
    for (const ns of nonSpaced) {
      const grouped = ns?.grouped;
      if (!Array.isArray(grouped)) continue;
      let ligature = '';
      for (const note of grouped) {
        const ch = noteToVolpiano(note?.base, note?.octave);
        if (ch) ligature += ch;
      }
      if (ligature) neumeSegments.push(ligature);
    }
  }
  return neumeSegments.join('-');
}

// Depth-first walk of a document's note tree, collecting only the melodic spine.
// We descend into structural containers, record syllables, and treat line/folio
// changes as breaks. Comment music examples, clefs, brackets and rubrics are
// intentionally skipped so they don't pollute the melody.
const DESCEND_KINDS = new Set([
  'RootContainer',
  'FormteilContainer',
  'ZeileContainer'
]);

function collectTokens(node, out) {
  if (!node || typeof node !== 'object') return;
  const kind = node.kind;

  if (kind === 'Syllable') {
    out.push({ type: 'syllable', volpiano: syllableToVolpiano(node) });
    return;
  }
  if (kind === 'LineChange' || kind === 'FolioChange') {
    out.push({ type: 'break' });
    return;
  }
  if (DESCEND_KINDS.has(kind)) {
    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) collectTokens(child, out);
    }
    if (kind === 'ZeileContainer') out.push({ type: 'break' });
  }
  // Everything else (Paratext, Clef, Bracket, Comment*, Notes examples, Text) is
  // ignored on purpose.
}

// Join syllable fragments into a full Volpiano melody. Syllables are separated by
// "--" so each syllable boundary renders as a "___" (syllable) marker in the
// contour, matching the existing corpora's spacing conventions.
function buildVolpiano(rootNode) {
  const tokens = [];
  collectTokens(rootNode, tokens);

  const syllables = tokens
    .filter((t) => t.type === 'syllable' && t.volpiano)
    .map((t) => t.volpiano);

  return syllables.join('--');
}

// Parse the raw text of a *.monodijson file into corpus items compatible with
// search_data.json. `corpusName` becomes the database_source (the selectable
// corpus). Returns { name, items, importedAt } or throws on malformed input.
export function parseMonodiWorkspace(rawText, corpusName) {
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    throw new Error('The file is not valid JSON. Is it a monodi workspace export?');
  }

  if (!data || !Array.isArray(data.documents) || typeof data.notes !== 'object') {
    throw new Error(
      'This does not look like a monodi workspace export (missing "documents"/"notes").'
    );
  }

  // sigla lookup: source id -> display sigle
  const sourceById = {};
  if (Array.isArray(data.sources)) {
    for (const s of data.sources) {
      if (s && s.id) {
        sourceById[s.id] = (s.quellensigle || s.bibliothekssignatur || '').trim();
      }
    }
  }

  const items = [];
  let skipped = 0;

  for (const doc of data.documents) {
    if (!doc || !doc.id) continue;
    const rootNode = data.notes[doc.id];
    if (!rootNode) {
      skipped++;
      continue;
    }

    const volpiano = buildVolpiano(rootNode);
    const contour = transformToContour(volpiano);
    if (!volpiano || !contour) {
      skipped++; // no notated music in this document
      continue;
    }

    const title =
      (doc.textinitium || '').trim() ||
      (doc.dokumenten_id || '').trim() ||
      doc.id;

    items.push({
      uuid: doc.id,
      siglum: sourceById[doc.quelle_id] || (doc.dokumenten_id || '').trim() || '',
      related_chant: (doc.bibliographischerverweis || '').trim(),
      genre: (doc.gattung1 || '').trim(),
      subgenre: (doc.gattung2 || '').trim(),
      genre2: '',
      mode: '',
      feast_day: (doc.festtag || '').trim(),
      feast_time: (doc.feier || '').trim(),
      initial_text: title,
      melodyname_standardized: title,
      editor: (doc.editionsstatus || '').trim(),
      volpiano,
      contour,
      database_source: corpusName
    });
  }

  if (items.length === 0) {
    throw new Error('No notated melodies were found in this workspace file.');
  }

  return {
    name: corpusName,
    items,
    importedAt: new Date().toISOString(),
    skipped
  };
}

// ---- localStorage helpers -------------------------------------------------

export function loadImportedCorpora() {
  try {
    const raw = localStorage.getItem(IMPORTED_CORPORA_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to read imported corpora from localStorage:', e);
    return [];
  }
}

export function saveImportedCorpora(list) {
  try {
    localStorage.setItem(IMPORTED_CORPORA_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error('Failed to persist imported corpora:', e);
    return false;
  }
}
