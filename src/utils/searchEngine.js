export function preprocessQuery(q) {
  let query = (q || '').replace(/\s+/g, ''); // Remove spaces
  query = query.replace(/\[\.\.\.\]/g, '.*'); // Convert [...] to regex skip
  query = query.replace(/\*/g, '.'); // Convert * to single note skip
  query = query.replace(/\[/g, '(').replace(/\]/g, ')'); // Convert options [u|d] to (u|d)
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
    } else if (query[i] === '*') {
      tokens.push({ type: 'skip_one' });
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
  if (!ignoreSyllables) {
    return { start: searchStart, end: searchEnd };
  }
  let searchIdx = 0;
  let origStart = -1;
  let origEnd = -1;

  for (let i = 0; i < originalContour.length; i++) {
    if (originalContour[i] !== '_') {
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
    if (VOLPIANO_ALPHABET_SET.has(volpianoStr[i])) {
      notePositions.push(i);
    }
  }

  const { start, end } = matchIndices;
  let countBefore = 0;
  for (let i = 0; i < start && i < originalContour.length; i++) {
    if (originalContour[i] === 'u' || originalContour[i] === 'd' || originalContour[i] === 'r') {
      countBefore++;
    }
  }

  let countMatch = 0;
  for (let i = start; i < end && i < originalContour.length; i++) {
    if (originalContour[i] === 'u' || originalContour[i] === 'd' || originalContour[i] === 'r') {
      countMatch++;
    }
  }

  const startNoteIdx = countBefore;
  const endNoteIdx = countBefore + countMatch;

  if (startNoteIdx >= notePositions.length) return null;

  const vStart = notePositions[startNoteIdx];
  const vEnd = (endNoteIdx < notePositions.length) ? notePositions[endNoteIdx] + 1 : volpianoStr.length;

  return { start: vStart, end: vEnd };
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

  const processedPattern = preprocessQuery(rawQuery);
  const selectedSet = new Set(selectedCorpora || []);

  let regex;
  let tokens = [];

  try {
    if (searchMode === 'exact') {
      regex = new RegExp(processedPattern, 'g');
    } else {
      tokens = parseQueryToTokens(rawQuery);
      if (tokens.length === 0) return [];
    }
  } catch (e) {
    console.error('Invalid Regex:', e);
    return [];
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
      search_contour = search_contour.replace(/_/g, "");
    }

    if (!search_contour) continue;

    let matched = false;
    let firstMatchPct = -1;
    let firstMatchIndices = null;
    let bestAccuracy = 0;
    const totalLen = Math.max(1, search_contour.length);

    if (searchMode === 'exact') {
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
    } else {
      // Fuzzy mode
      const queryLen = rawQuery.length;
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
        const windowSize = Math.max(1, queryLen);
        for (let sIdx = 0; sIdx <= search_contour.length - windowSize; sIdx++) {
          const start_pct_cand = (sIdx / totalLen) * 100;
          const end_pct_cand = ((sIdx + windowSize) / totalLen) * 100;
          if (start_pct_cand < start_pct || end_pct_cand > end_pct) continue;

          const sub = search_contour.substring(sIdx, sIdx + windowSize);
          const dist = levenshteinDistance(rawQuery, sub);
          const accuracy = Math.round((1 - dist / Math.max(queryLen, windowSize)) * 100);

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
