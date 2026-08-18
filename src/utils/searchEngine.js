export function preprocessQuery(q, ignoreSyllables = true) {
  let query = (q || '').trim();
  query = query.replace(/\[\.\.\.\]/g, '.*');
  query = query.replace(/\[/g, '(').replace(/\]/g, ')');
  if (ignoreSyllables) {
    // If ignoring syllables, remove both underscores and spaces
    query = query.replace(/[\s_]+/g, '');
  } else {
    // Neume spaces should never affect search, remove whitespace
    query = query.replace(/\s+/g, '');
  }
  // In regex, '.' matches any relative pitch step (u, d, r) and NEVER the start note '*' or syllable boundary
  query = query.replace(/(^|[^\\])\./g, '$1[udr]');
  // Escape literal * when at start of string or preceded by group/alternation/boundary so regex doesn't crash on /*/
  query = query.replace(/(^|[\s|(^])\*/g, '$1\\*');
  return query;
}

export function parseQueryToTokens(q) {
  let tokens = [];
  let query = (q || '').replace(/\s+/g, '');
  for (let i = 0; i < query.length; i++) {
    if (query[i] === '[') {
      if (query.substring(i, i + 5) === '[...]') {
        tokens.push({ type: 'gap' });
        i += 4;
      } else {
        let end = query.indexOf(']', i);
        if (end !== -1) {
          let chars = query.substring(i + 1, end).split('|');
          tokens.push({ type: 'set', chars: chars });
          i = end;
        } else {
          tokens.push({ type: 'char', char: query[i] });
        }
      }
    } else if (query[i] === '.') {
      tokens.push({ type: 'skip_one' });
    } else if (query[i] === '*') {
      tokens.push({ type: 'char', char: '*' });
    } else {
      tokens.push({ type: 'char', char: query[i] });
    }
  }
  return tokens;
}

export function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  let dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function findSubsequenceMatch(queryTokens, target, startIdx) {
  let tIdx = startIdx;
  let matchedTokens = 0;

  for (let token of queryTokens) {
    let found = false;
    while (tIdx < target.length) {
      const char = target[tIdx];
      let isMatch = false;

      if (token.type === 'char') {
        if (char === token.char) isMatch = true;
      } else if (token.type === 'set') {
        if (token.chars.includes(char)) isMatch = true;
      } else if (token.type === 'skip_one' || token.type === 'gap') {
        isMatch = true;
      }

      if (isMatch) {
        found = true;
        tIdx++;
        matchedTokens++;
        break;
      } else {
        tIdx++;
      }
    }
    if (!found) break;
  }

  const accuracy = Math.round((matchedTokens / Math.max(1, queryTokens.length)) * 100);
  return {
    matched: matchedTokens === queryTokens.length,
    accuracy: accuracy,
    endIdx: tIdx
  };
}

export function mapIndicesToOriginalContour(originalContour, searchStart, searchEnd, ignoreSyllables) {
  let searchIdx = 0;
  let origStart = -1;
  let origEnd = -1;

  for (let i = 0; i < originalContour.length; i++) {
    const ch = originalContour[i];
    const isSearchChar = ignoreSyllables ? (ch !== '_' && ch !== ' ') : (ch !== ' ');
    if (isSearchChar) {
      if (searchIdx === searchStart) {
        origStart = i;
      }
      searchIdx++;
      if (searchIdx === searchEnd) {
        origEnd = i + 1;
        break;
      }
    }
  }

  if (origStart !== -1 && origEnd === -1) {
    origEnd = originalContour.length;
  }

  return { start: origStart, end: origEnd };
}

const VOLPIANO_ALPHABET_SET = new Set('89abcdefghijklmnopqrstuvw'.split(''));

export function getVolpianoMatchIndices(volpianoStr, originalContour, matchIndices) {
  if (!volpianoStr || !originalContour || !matchIndices) return null;

  const notePositions = [];
  for (let i = 0; i < volpianoStr.length; i++) {
    if (VOLPIANO_ALPHABET_SET.has(volpianoStr[i].toLowerCase())) {
      notePositions.push(i);
    }
  }

  if (notePositions.length === 0) return null;

  const { start, end } = matchIndices;
  let countBefore = 0;
  for (let i = 0; i < start && i < originalContour.length; i++) {
    const ch = originalContour[i];
    if (ch === '*' || ch === 'u' || ch === 'd' || ch === 'r') {
      countBefore++;
    }
  }

  let countMatch = 0;
  for (let i = start; i < end && i < originalContour.length; i++) {
    const ch = originalContour[i];
    if (ch === '*' || ch === 'u' || ch === 'd' || ch === 'r') {
      countMatch++;
    }
  }

  if (countMatch === 0 || countBefore >= notePositions.length) return null;

  const startNoteIdx = countBefore;
  const lastNoteIdx = Math.min(notePositions.length - 1, countBefore + countMatch - 1);

  const vStart = notePositions[startNoteIdx];
  const vEnd = notePositions[lastNoteIdx] + 1;

  return { start: vStart, end: vEnd };
}

export function validateQuery(rawQuery, searchMode = 'exact', ignoreSyllables = true) {
  const q = (rawQuery || '').trim();
  if (!q) return { isValid: true, error: null, warnings: [], compiledRegex: null };

  const warnings = [];
  let error = null;
  let compiledRegex = null;

  // 1. Syllable separator warning when ignoreSyllables is true
  if (ignoreSyllables && (q.includes('___') || q.includes('_'))) {
    warnings.push({
      id: 'syllable_ignored',
      type: 'warning',
      message: 'Query contains syllable separators ("_"), but "Ignore syllables in search" is active (underscores are stripped).',
      actionLabel: 'Disable "Ignore syllables"',
      action: 'disable_ignore_syllables'
    });
  }

  // 2. Unrecognized character warning (ignoring regex operators / character classes)
  const strippedClasses = q.replace(/\[[^\]]*\]/g, '').replace(/\{[^}]*\}/g, '');
  const invalidChars = [];
  for (const ch of strippedClasses) {
    if (!'udr.*_ ()|\\^$+?{}[]'.includes(ch.toLowerCase())) {
      if (!invalidChars.includes(ch)) invalidChars.push(ch);
    }
  }
  if (invalidChars.length > 0) {
    warnings.push({
      id: 'unrecognized_chars',
      type: 'info',
      message: `Unrecognized symbol(s): ${invalidChars.map(c => `"${c}"`).join(', ')}. Contour notes are * (start), u (up), d (down), r (repeat), and . (wildcard).`,
      suggestion: 'Use * for melody start, u/d/r for pitch steps, and . for any note.'
    });
  }

  // 3. Tip if * is placed in the middle of notes
  if (/[udr]\*[udr]/.test(q)) {
    warnings.push({
      id: 'star_in_middle',
      type: 'tip',
      message: '"*" represents the initial incipit note of a melody. To match any arbitrary note wildcard, use "." (e.g. "u.d" or ".{3}").',
      suggestion: 'Use "." for single-note wildcards.'
    });
  }

  // 4. Regex validation when in exact mode
  if (searchMode === 'exact') {
    try {
      const processedPattern = preprocessQuery(q, ignoreSyllables);
      new RegExp(processedPattern, 'g');
      compiledRegex = `/${processedPattern}/g`;
    } catch (err) {
      let friendlyMessage = err.message;
      if (err.message.includes('Unterminated group') || err.message.includes('missing )')) {
        friendlyMessage = 'Unclosed parenthesis "(". Please ensure all opening parentheses have a matching ")".';
      } else if (err.message.includes('Unterminated character class') || err.message.includes('missing ]')) {
        friendlyMessage = 'Unclosed bracket "[". Please ensure all opening brackets have a matching "]".';
      } else if (err.message.includes('Nothing to repeat') || err.message.includes('quantifier')) {
        friendlyMessage = 'Invalid quantifier position ("+", "?", "*"). Quantifiers must follow a character, group, or ".".';
      } else if (err.message.includes('Invalid regular expression') && q.endsWith('\\')) {
        friendlyMessage = 'Trailing backslash "\\" at the end of the query.';
      } else if (err.message.includes('numbers out of order in {}')) {
        friendlyMessage = 'Invalid quantifier range in {min,max}. Minimum must be less than or equal to maximum.';
      }
      error = {
        raw: err.message,
        message: friendlyMessage
      };
    }
  }

  return {
    isValid: !error,
    error,
    warnings,
    compiledRegex
  };
}

export function getSearchDiagnostics({
  query,
  searchMode,
  searchLocation,
  regionSize,
  fuzzyThreshold,
  ignoreSyllables,
  selectedCorpora,
  availableCorpora,
  resultsCount,
  regexError
}) {
  if (resultsCount > 0) return null;
  const q = (query || '').trim();
  if (!q) return null;

  const diagnostics = [];

  // 1. Regex Syntax Error
  if (regexError) {
    diagnostics.push({
      type: 'error',
      title: 'Regex Syntax Error',
      message: regexError.message || regexError,
      remedy: 'Please correct the regular expression syntax.'
    });
    return diagnostics;
  }

  // 2. Syllable setting mismatch
  if (ignoreSyllables && (q.includes('___') || q.includes('_') || q.includes(' '))) {
    diagnostics.push({
      type: 'warning',
      title: 'Syllable Separators Ignored',
      message: 'Your query includes syllable or neume breaks ("_" or spaces), but "Ignore syllables in search" was checked, so separators were stripped before searching.',
      remedyLabel: 'Disable "Ignore syllables" & Search',
      action: 'disable_ignore_syllables'
    });
  } else if (!ignoreSyllables && (q.includes('___') || q.includes('_') || q.includes(' '))) {
    diagnostics.push({
      type: 'suggestion',
      title: 'Strict Syllable Boundaries Active',
      message: 'Search was performed with strict syllable and neume spacing. Melodies in the corpora may differ in spacing.',
      remedyLabel: 'Enable "Ignore syllables" & Search',
      action: 'enable_ignore_syllables'
    });
  }

  // 3. Location and Region Size constraints
  if (searchLocation !== 'Anywhere in the melody') {
    const locName = searchLocation.includes('Incipit') ? 'Incipit (Beginning)' : 'Coda (End)';
    diagnostics.push({
      type: 'suggestion',
      title: `Restricted to ${locName}`,
      message: `Search was constrained only to the ${locName} (${regionSize}% of melody). No matches found in this region.`,
      remedyLabel: 'Search Anywhere in Melody',
      action: 'reset_location'
    });
  } else if (regionSize < 100) {
    diagnostics.push({
      type: 'suggestion',
      title: `Region Size is ${regionSize}%`,
      message: 'Expanding region size allows searching across a larger percentage of the melody.',
      remedyLabel: 'Set Region Size to 100%',
      action: 'max_region_size'
    });
  }

  // 4. Corpora database filters
  if (selectedCorpora && availableCorpora && selectedCorpora.length > 0 && selectedCorpora.length < availableCorpora.length) {
    const excludedCount = availableCorpora.length - selectedCorpora.length;
    diagnostics.push({
      type: 'suggestion',
      title: 'Database Source Filter Active',
      message: `Search was limited to ${selectedCorpora.length} of ${availableCorpora.length} databases (${excludedCount} excluded).`,
      remedyLabel: 'Select All Databases & Search',
      action: 'select_all_corpora'
    });
  }

  // 5. Exact vs Fuzzy Mode suggestion
  if (searchMode === 'exact') {
    diagnostics.push({
      type: 'suggestion',
      title: 'Try Fuzzy Search',
      message: 'No exact matches were found. Fuzzy mode tolerates minor note variations or transcription differences.',
      remedyLabel: 'Switch to Fuzzy Search',
      action: 'switch_to_fuzzy'
    });
  } else if (searchMode === 'fuzzy' && fuzzyThreshold > 60) {
    diagnostics.push({
      type: 'suggestion',
      title: 'Lower Fuzzy Similarity Threshold',
      message: `Similarity threshold is currently at ${fuzzyThreshold}%. Lowering it allows more approximate matches.`,
      remedyLabel: 'Lower Threshold to 60%',
      action: 'lower_fuzzy_threshold'
    });
  }

  return diagnostics;
}

export function parseContourToUnits(contourStr) {
  const units = [];
  const s = contourStr || '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ') {
      i++;
      continue;
    }
    if (ch === '_') {
      let start = i;
      while (i < s.length && s[i] === '_') i++;
      units.push({
        type: 'syllable',
        raw: s.substring(start, i),
        start,
        end: i
      });
      continue;
    }
    if (ch === '[') {
      let end = s.indexOf(']', i);
      if (end !== -1) {
        let inside = s.substring(i + 1, end).trim();
        let chars = inside.split('|').map((c) => c.trim());
        let set = new Set();
        let hasWildcard = false;
        for (const c of chars) {
          if (c === '.' || c.includes('.')) hasWildcard = true;
          else for (const note of c) if ('udr'.includes(note.toLowerCase())) set.add(note.toLowerCase());
        }
        units.push({
          type: 'note',
          raw: s.substring(i, end + 1),
          allowed: hasWildcard ? new Set(['u', 'd', 'r']) : set,
          isWildcard: hasWildcard,
          start: i,
          end: end + 1
        });
        i = end + 1;
        continue;
      }
    }
    if (ch === '.') {
      units.push({
        type: 'note',
        raw: '.',
        allowed: new Set(['u', 'd', 'r']),
        isWildcard: true,
        start: i,
        end: i + 1
      });
      i++;
      continue;
    }
    const lowerCh = ch.toLowerCase();
    if (lowerCh === '*' || lowerCh === 'u' || lowerCh === 'd' || lowerCh === 'r') {
      units.push({
        type: 'note',
        raw: ch,
        allowed: new Set([lowerCh]),
        isWildcard: false,
        start: i,
        end: i + 1
      });
      i++;
      continue;
    }
    i++;
  }
  return units;
}

export function parseQueryToUnits(queryStr) {
  const units = [];
  let q = (queryStr || '').trim();
  q = q.replace(/\[\.\.\.\]/g, '.*');
  let i = 0;
  while (i < q.length) {
    const ch = q[i];
    if (ch === ' ') {
      i++;
      continue;
    }
    if (ch === '_') {
      let start = i;
      while (i < q.length && q[i] === '_') i++;
      units.push({ type: 'syllable' });
      continue;
    }
    if (ch === '[') {
      let end = q.indexOf(']', i);
      if (end !== -1) {
        let inside = q.substring(i + 1, end).trim();
        let chars = inside.split('|').map((c) => c.trim());
        let set = new Set();
        let hasWildcard = false;
        for (const c of chars) {
          if (c === '.' || c.includes('.')) hasWildcard = true;
          else for (const note of c) if ('udr'.includes(note.toLowerCase())) set.add(note.toLowerCase());
        }
        units.push({
          type: 'note',
          allowed: hasWildcard ? new Set(['u', 'd', 'r']) : set,
          isWildcard: hasWildcard
        });
        i = end + 1;
        continue;
      }
    }
    if (ch === '(') {
      let end = q.indexOf(')', i);
      if (end !== -1) {
        let inside = q.substring(i + 1, end).trim();
        let chars = inside.split('|').map((c) => c.trim());
        let set = new Set();
        for (const c of chars) for (const note of c) if ('udr'.includes(note.toLowerCase())) set.add(note.toLowerCase());
        units.push({ type: 'note', allowed: set, isWildcard: false });
        i = end + 1;
        continue;
      }
    }
    if (ch === '.') {
      if (q[i + 1] === '{') {
        let closeBrace = q.indexOf('}', i + 1);
        if (closeBrace !== -1) {
          let count = parseInt(q.substring(i + 2, closeBrace));
          for (let k = 0; k < count; k++) {
            units.push({ type: 'note', allowed: new Set(['u', 'd', 'r']), isWildcard: true });
          }
          i = closeBrace + 1;
          continue;
        }
      }
      units.push({ type: 'note', allowed: new Set(['u', 'd', 'r']), isWildcard: true });
      i++;
      continue;
    }
    const lowerCh = ch.toLowerCase();
    if (lowerCh === '*' || lowerCh === 'u' || lowerCh === 'd' || lowerCh === 'r') {
      if (q[i + 1] === '{') {
        let closeBrace = q.indexOf('}', i + 1);
        if (closeBrace !== -1) {
          let count = parseInt(q.substring(i + 2, closeBrace));
          for (let k = 0; k < count; k++) {
            units.push({ type: 'note', allowed: new Set([lowerCh]), isWildcard: false });
          }
          i = closeBrace + 1;
          continue;
        }
      }
      units.push({ type: 'note', allowed: new Set([lowerCh]), isWildcard: false });
      i++;
      continue;
    }
    i++;
  }
  return units;
}

export function matchUncertainContour(queryUnits, origContour, ignoreSyllables, start_pct, end_pct, isFuzzy = false, fuzzyThreshold = 80) {
  const tUnits = parseContourToUnits(origContour);
  const targetNotes = ignoreSyllables ? tUnits.filter((u) => u.type === 'note') : tUnits;
  const queryNotes = ignoreSyllables ? queryUnits.filter((u) => u.type === 'note') : queryUnits;

  if (queryNotes.length === 0 || targetNotes.length === 0) return null;

  const totalLen = Math.max(1, targetNotes.length);
  let bestAccuracy = 0;
  let bestResult = null;

  const maxStart = targetNotes.length;

  for (let sIdx = 0; sIdx <= maxStart; sIdx++) {
    const match_start_pct = (sIdx / totalLen) * 100;
    const match_end_pct = (Math.min(targetNotes.length, sIdx + queryNotes.length) / totalLen) * 100;

    if (match_start_pct < start_pct || match_end_pct > end_pct) continue;

    if (!isFuzzy) {
      // In EXACT mode, every note in queryNotes must match consecutively at sIdx + k
      if (sIdx + queryNotes.length > targetNotes.length) continue;

      let exactMatch = true;
      for (let k = 0; k < queryNotes.length; k++) {
        const q = queryNotes[k];
        const t = targetNotes[sIdx + k];

        if (q.type !== t.type) {
          exactMatch = false;
          break;
        }
        if (q.type === 'syllable') {
          continue;
        }

        let intersects = false;
        for (const note of q.allowed) {
          if (t.allowed.has(note)) {
            intersects = true;
            break;
          }
        }
        if (!intersects) {
          exactMatch = false;
          break;
        }
      }

      if (exactMatch) {
        const startUnit = targetNotes[sIdx];
        const endUnit = targetNotes[sIdx + queryNotes.length - 1];
        return {
          matched: true,
          matchPositionPct: Math.round(match_start_pct),
          matchIndices: { start: startUnit.start, end: endUnit.end },
          accuracy: 100
        };
      }
    } else {
      // In FUZZY mode
      let matchCount = 0;
      for (let k = 0; k < queryNotes.length; k++) {
        if (sIdx + k >= targetNotes.length) break;
        const q = queryNotes[k];
        const t = targetNotes[sIdx + k];

        if (q.type !== t.type) continue;
        if (q.type === 'syllable') {
          matchCount++;
          continue;
        }

        let intersects = false;
        for (const note of q.allowed) {
          if (t.allowed.has(note)) {
            intersects = true;
            break;
          }
        }
        if (intersects) {
          matchCount++;
        }
      }

      const accuracy = Math.round((matchCount / Math.max(1, queryNotes.length)) * 100);
      if (accuracy >= fuzzyThreshold && accuracy > bestAccuracy) {
        bestAccuracy = accuracy;
        const startUnit = targetNotes[sIdx];
        const lastIdx = Math.min(targetNotes.length - 1, sIdx + queryNotes.length - 1);
        const endUnit = targetNotes[lastIdx];
        bestResult = {
          matched: true,
          matchPositionPct: Math.round(match_start_pct),
          matchIndices: { start: startUnit.start, end: endUnit.end },
          accuracy: bestAccuracy
        };
      }
    }
  }

  return bestResult;
}

export function searchCorpus({
  corpusData,
  query,
  selectedCorpora,
  searchMode,
  searchLocation,
  regionSize,
  fuzzyAlgo,
  fuzzyThreshold,
  ignoreSyllables
}) {
  if (!corpusData || corpusData.length === 0) return [];
  const rawQuery = (query || '').toLowerCase().trim();
  if (!rawQuery) return [];

  const processedPattern = preprocessQuery(rawQuery, ignoreSyllables);
  const queryUnits = parseQueryToUnits(rawQuery);
  const selectedSet = new Set(selectedCorpora || []);

  let regex;
  let tokens = [];

  try {
    if (searchMode === 'exact') {
      regex = new RegExp(processedPattern, 'g');
    } else {
      const cleanFuzzyQuery = ignoreSyllables ? rawQuery.replace(/[\s_]+/g, '') : rawQuery;
      tokens = parseQueryToTokens(cleanFuzzyQuery);
      if (tokens.length === 0) return [];
    }
  } catch (e) {
    console.error('Invalid Regex in searchCorpus:', e);
    const errResults = [];
    errResults.regexError = { raw: e.message, message: e.message };
    return errResults;
  }

  let start_pct = 0;
  let end_pct = 100;
  if (searchLocation === "Only in the Beginning (Incipit)") {
    end_pct = regionSize;
  } else if (searchLocation === "Only in the End (Coda)") {
    start_pct = 100 - regionSize;
  }

  const results = [];

  for (let i = 0; i < corpusData.length; i++) {
    const item = corpusData[i];

    // Database filter
    const source = (item.database_source || "").trim();
    if (selectedSet.size > 0 && !selectedSet.has(source)) {
      continue;
    }

    const origContour = item.contour || "";
    if (!origContour) continue;

    let search_contour = origContour;
    if (ignoreSyllables) {
      search_contour = search_contour.replace(/[_ ]/g, "");
    } else {
      search_contour = search_contour.replace(/ /g, "");
    }

    if (!search_contour) continue;

    let matched = false;
    let firstMatchPct = -1;
    let firstMatchIndices = null;
    let bestAccuracy = 0;
    const totalLen = Math.max(1, search_contour.length);

    const hasUncertainty = /[\[(]/.test(origContour);

    if (searchMode === 'exact') {
      if (hasUncertainty) {
        const uRes = matchUncertainContour(queryUnits, origContour, ignoreSyllables, start_pct, end_pct, false);
        if (uRes) {
          matched = true;
          firstMatchPct = uRes.matchPositionPct;
          firstMatchIndices = uRes.matchIndices;
          bestAccuracy = 100;
        }
      } else {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(search_contour)) !== null) {
          const match_start_pct = (match.index / totalLen) * 100;
          const match_end_pct = ((match.index + match[0].length) / totalLen) * 100;

          if (match_start_pct >= start_pct && match_end_pct <= end_pct) {
            matched = true;
            if (firstMatchPct === -1) {
              firstMatchPct = Math.round(match_start_pct);
              firstMatchIndices = mapIndicesToOriginalContour(origContour, match.index, match.index + match[0].length, ignoreSyllables);
            }
            break;
          }
        }
      }
    } else {
      // Fuzzy mode
      if (hasUncertainty) {
        const uRes = matchUncertainContour(queryUnits, origContour, ignoreSyllables, start_pct, end_pct, true, fuzzyThreshold);
        if (uRes) {
          matched = true;
          firstMatchPct = uRes.matchPositionPct;
          firstMatchIndices = uRes.matchIndices;
          bestAccuracy = uRes.accuracy;
        }
      } else {
        const queryLen = tokens.length;
        if (fuzzyAlgo === 'hamming') {
          for (let sIdx = 0; sIdx <= search_contour.length - queryLen; sIdx++) {
            const start_pct_cand = (sIdx / totalLen) * 100;
            const end_pct_cand = ((sIdx + queryLen) / totalLen) * 100;
            if (start_pct_cand < start_pct || end_pct_cand > end_pct) continue;

            let matches = 0;
            for (let t = 0; t < queryLen; t++) {
              const token = tokens[t];
              const char = search_contour[sIdx + t];
              if (token.type === 'char' && char === token.char) matches++;
              else if (token.type === 'set' && token.chars.includes(char)) matches++;
              else if (token.type === 'skip_one' || token.type === 'gap') matches++;
            }
            const accuracy = Math.round((matches / queryLen) * 100);
            if (accuracy >= fuzzyThreshold) {
              if (accuracy > bestAccuracy) {
                bestAccuracy = accuracy;
                firstMatchPct = Math.round(start_pct_cand);
                firstMatchIndices = mapIndicesToOriginalContour(origContour, sIdx, sIdx + queryLen, ignoreSyllables);
                matched = true;
              }
            }
          }
        } else if (fuzzyAlgo === 'subsequence') {
          for (let sIdx = 0; sIdx < search_contour.length; sIdx++) {
            const start_pct_cand = (sIdx / totalLen) * 100;
            if (start_pct_cand < start_pct) continue;

            const res = findSubsequenceMatch(tokens, search_contour, sIdx);
            const end_pct_cand = (res.endIdx / totalLen) * 100;

            if (end_pct_cand <= end_pct && res.accuracy >= fuzzyThreshold) {
              if (res.accuracy > bestAccuracy) {
                bestAccuracy = res.accuracy;
                firstMatchPct = Math.round(start_pct_cand);
                firstMatchIndices = mapIndicesToOriginalContour(origContour, sIdx, res.endIdx, ignoreSyllables);
                matched = true;
              }
            }
          }
        } else if (fuzzyAlgo === 'levenshtein') {
          const cleanRaw = ignoreSyllables ? rawQuery.replace(/[\s_]+/g, '') : rawQuery;
          const windowSize = Math.max(1, cleanRaw.length);
          for (let sIdx = 0; sIdx <= search_contour.length - windowSize; sIdx++) {
            const start_pct_cand = (sIdx / totalLen) * 100;
            const end_pct_cand = ((sIdx + windowSize) / totalLen) * 100;
            if (start_pct_cand < start_pct || end_pct_cand > end_pct) continue;

            const sub = search_contour.substring(sIdx, sIdx + windowSize);
            const dist = levenshteinDistance(cleanRaw, sub);
            const accuracy = Math.round((1 - dist / Math.max(cleanRaw.length, windowSize)) * 100);

            if (accuracy >= fuzzyThreshold) {
              if (accuracy > bestAccuracy) {
                bestAccuracy = accuracy;
                firstMatchPct = Math.round(start_pct_cand);
                firstMatchIndices = mapIndicesToOriginalContour(origContour, sIdx, sIdx + windowSize, ignoreSyllables);
                matched = true;
              }
            }
          }
        }
      }
    }

    if (matched) {
      const vMatchIndices = getVolpianoMatchIndices(item.volpiano, origContour, firstMatchIndices);
      results.push({
        ...item,
        matchPositionPct: firstMatchPct,
        matchIndices: firstMatchIndices,
        volpianoMatchIndices: vMatchIndices,
        accuracy: searchMode === 'fuzzy' ? bestAccuracy : 100
      });
    }
  }

  return results;
}
