import React, { useState, useMemo } from 'react';

const VOLPIANO_PITCHES_ORDER = [
  { key: '8', name: 'F', octave: 2, label: 'F' },
  { key: '9', name: 'G', octave: 2, label: 'G' },
  { key: 'a', name: 'A', octave: 2, label: 'A' },
  { key: 'b', name: 'B♭', octave: 2, label: 'B♭' },
  { key: 'y', name: 'B', octave: 2, label: 'B' },
  { key: 'c', name: 'C', octave: 3, label: 'C' },
  { key: 'd', name: 'D', octave: 3, label: 'D' },
  { key: 'e', name: 'E', octave: 3, label: 'E' },
  { key: 'f', name: 'F', octave: 3, label: 'F' },
  { key: 'g', name: 'G', octave: 3, label: 'G' },
  { key: 'h', name: 'a', octave: 3, label: 'a' },
  { key: 'j', name: 'b♭', octave: 3, label: 'b♭' },
  { key: 'k', name: 'b', octave: 3, label: 'b' },
  { key: 'l', name: 'c', octave: 4, label: 'c\'' },
  { key: 'm', name: 'd', octave: 4, label: 'd\'' },
  { key: 'n', name: 'e', octave: 4, label: 'e\'' },
  { key: 'o', name: 'f', octave: 4, label: 'f\'' },
  { key: 'p', name: 'g', octave: 4, label: 'g\'' },
  { key: 'q', name: 'a', octave: 4, label: 'a\'' },
  { key: 'r', name: 'b♭', octave: 4, label: 'b♭\'' },
  { key: 's', name: 'b', octave: 4, label: 'b\'' }
];

const ALGO_SUMMARIES = {
  hamming: {
    title: 'Hamming Substitutions',
    desc: 'Fixed-length matching. Allows direction mutations at any step without insertions.'
  },
  levenshtein: {
    title: 'Levenshtein Edit Distance',
    desc: 'Flexible alignment. Allows note insertions, deletions, and direction substitutions.'
  },
  subsequence: {
    title: 'Subsequence Embellishments',
    desc: 'Finds motif notes in sequence with arbitrary decorative filler notes in-between.'
  }
};

export default function WildcardBreakdown({
  results,
  query,
  searchMode = 'exact',
  fuzzyAlgo = 'hamming',
  fuzzyThreshold = 80,
  filterText,
  onSelectPatternFilter,
  isOpen,
  onToggle
}) {
  const [selectedStep, setSelectedStep] = useState(0);

  const analysis = useMemo(() => {
    if (!results || results.length === 0 || !query) return null;

    const qClean = query.replace(/^\*/, '');
    const hasWildcards = /[.\[\]{}?+*|]/.test(qClean);
    const isFuzzy = searchMode === 'fuzzy';

    // Show breakdown if search has wildcards OR is in fuzzy mode
    if (!hasWildcards && !isFuzzy) return null;

    const patternCounts = {};
    const positionStats = [];
    const stepPitchCounts = [];
    const lengthCounts = {};
    const scoreBuckets = { '100%': 0, '90-99%': 0, '80-89%': 0, '70-79%': 0, '<70%': 0 };
    let totalPitches = 0;
    let maxPatternLen = 0;

    for (const r of results) {
      // Score distribution for fuzzy mode
      if (isFuzzy && r.accuracy !== undefined) {
        const acc = r.accuracy;
        if (acc === 100) scoreBuckets['100%']++;
        else if (acc >= 90) scoreBuckets['90-99%']++;
        else if (acc >= 80) scoreBuckets['80-89%']++;
        else if (acc >= 70) scoreBuckets['70-79%']++;
        else scoreBuckets['<70%']++;
      }

      if (r.matchIndices && r.contour) {
        const raw = r.contour.substring(r.matchIndices.start, r.matchIndices.end);
        const clean = raw.replace(/[^udr*]/gi, '').toLowerCase();
        if (clean) {
          patternCounts[clean] = (patternCounts[clean] || 0) + 1;
          const len = clean.length;
          lengthCounts[len] = (lengthCounts[len] || 0) + 1;
          maxPatternLen = Math.max(maxPatternLen, len);

          for (let i = 0; i < clean.length; i++) {
            if (!positionStats[i]) {
              positionStats[i] = { u: 0, d: 0, r: 0, star: 0, total: 0 };
            }
            const char = clean[i];
            if (char === 'u') positionStats[i].u++;
            else if (char === 'd') positionStats[i].d++;
            else if (char === 'r') positionStats[i].r++;
            else if (char === '*') positionStats[i].star++;
            positionStats[i].total++;
          }
        }
      }

      // Per-step Volpiano Pitch extraction
      if (r.volpiano && r.volpianoMatchIndices) {
        const vSlice = r.volpiano.substring(r.volpianoMatchIndices.start, r.volpianoMatchIndices.end);
        const vNotes = Array.from(vSlice).filter((ch) => VOLPIANO_PITCHES_ORDER.some((p) => p.key === ch));
        for (let s = 0; s < vNotes.length; s++) {
          if (!stepPitchCounts[s]) stepPitchCounts[s] = {};
          const p = vNotes[s];
          stepPitchCounts[s][p] = (stepPitchCounts[s][p] || 0) + 1;
          totalPitches++;
        }
      }
    }

    const sortedPatterns = Object.entries(patternCounts)
      .map(([pat, count]) => ({
        pat,
        count,
        pct: Math.round((count / results.length) * 100)
      }))
      .sort((a, b) => b.count - a.count);

    if (sortedPatterns.length === 0) return null;

    // Length histogram
    const lengthStats = Object.entries(lengthCounts)
      .map(([lenStr, count]) => ({
        len: parseInt(lenStr),
        count,
        pct: Math.round((count / results.length) * 100)
      }))
      .sort((a, b) => a.len - b.len);

    const maxLengthCount = Math.max(1, ...lengthStats.map((l) => l.count));

    // Score stats for fuzzy
    const scoreStats = Object.entries(scoreBuckets)
      .filter(([_, count]) => count > 0)
      .map(([range, count]) => ({
        range,
        count,
        pct: Math.round((count / results.length) * 100)
      }));
    const maxScoreCount = Math.max(1, ...scoreStats.map((s) => s.count));

    return {
      isFuzzy,
      fuzzyAlgo,
      totalResults: results.length,
      uniqueCount: sortedPatterns.length,
      patterns: sortedPatterns.slice(0, 8),
      totalPitches,
      stepPitchCounts,
      lengthStats,
      maxLengthCount,
      hasVariableLength: lengthStats.length > 1,
      scoreStats,
      maxScoreCount,
      positionStats: positionStats.slice(0, Math.min(8, maxPatternLen))
    };
  }, [results, query, searchMode, fuzzyAlgo]);

  // Active step pitch histogram calculation
  const currentStepPitchData = useMemo(() => {
    if (!analysis || !analysis.stepPitchCounts || analysis.stepPitchCounts.length === 0) return null;
    const stepIdx = Math.min(selectedStep, analysis.stepPitchCounts.length - 1);
    const counts = analysis.stepPitchCounts[stepIdx] || {};
    const totalInStep = Object.values(counts).reduce((a, b) => a + b, 0);

    const activePitches = VOLPIANO_PITCHES_ORDER.filter((p) => counts[p.key] > 0);
    if (activePitches.length === 0) return null;

    const minIdx = VOLPIANO_PITCHES_ORDER.findIndex((p) => p.key === activePitches[0].key);
    const maxIdx = VOLPIANO_PITCHES_ORDER.findIndex((p) => p.key === activePitches[activePitches.length - 1].key);
    const list = VOLPIANO_PITCHES_ORDER.slice(Math.max(0, minIdx - 1), Math.min(VOLPIANO_PITCHES_ORDER.length, maxIdx + 2)).map((p) => ({
      ...p,
      count: counts[p.key] || 0,
      pct: totalInStep > 0 ? Math.round(((counts[p.key] || 0) / totalInStep) * 100) : 0
    }));

    const maxCount = Math.max(1, ...list.map((p) => p.count));
    return {
      stepIdx,
      totalInStep,
      pitches: list,
      maxCount
    };
  }, [analysis, selectedStep]);

  if (!analysis) return null;

  const algoInfo = ALGO_SUMMARIES[fuzzyAlgo] || ALGO_SUMMARIES.hamming;

  return (
    <div className="wildcard-breakdown-compact">
      <div className="wildcard-compact-header">
        <div className="wildcard-compact-title">
          <span className="mini-badge">
            {analysis.isFuzzy ? `Fuzzy: ${algoInfo.title}` : 'Pattern Distribution'}
          </span>
          <span className="compact-meta">
            {analysis.uniqueCount} variants · {analysis.totalResults} melodies
            {analysis.hasVariableLength
              ? ` · lengths ${analysis.lengthStats[0]?.len}–${analysis.lengthStats[analysis.lengthStats.length - 1]?.len} notes`
              : ` · ${analysis.lengthStats[0]?.len || ''} notes`}
          </span>
        </div>
        <button
          type="button"
          className="btn-toggle-mini"
          onClick={onToggle}
          title={isOpen ? "Collapse diagrams" : "Expand diagrams"}
        >
          {isOpen ? "Hide Charts ▲" : "Show Charts ▼"}
        </button>
      </div>

      {isOpen && (
        <div className="wildcard-compact-grid">
          {/* 1. Per-Step Pitch Histogram */}
          {analysis.stepPitchCounts.length > 0 && (
            <div className="compact-card pitch-card">
              <div className="card-header-mini">
                <strong>Pitch by Step</strong>
                <div className="step-picker-mini">
                  {analysis.stepPitchCounts.slice(0, 6).map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`step-pick-btn ${selectedStep === idx ? 'active' : ''}`}
                      onClick={() => setSelectedStep(idx)}
                      title={`Show pitch histogram for Step ${idx + 1}`}
                    >
                      S{idx + 1}
                    </button>
                  ))}
                </div>
              </div>
              {currentStepPitchData && currentStepPitchData.pitches.length > 0 ? (
                <div className="pitch-histogram-bars">
                  {currentStepPitchData.pitches.map((p, idx) => {
                    const heightPct = Math.max(4, Math.round((p.count / currentStepPitchData.maxCount) * 100));
                    return (
                      <div
                        key={idx}
                        className="pitch-bar-col"
                        title={`Step ${currentStepPitchData.stepIdx + 1} - ${p.name}${p.octave} (${p.label}): ${p.count} (${p.pct}%)`}
                      >
                        <div className="pitch-bar-track">
                          <div
                            className="pitch-bar-fill"
                            style={{ height: `${heightPct}%` }}
                          ></div>
                        </div>
                        <span className="pitch-label">{p.label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-subtext">No pitch data for step</div>
              )}
            </div>
          )}

          {/* 2. Fuzzy Score Histogram (for Fuzzy mode) OR Length Histogram */}
          {analysis.isFuzzy && analysis.scoreStats.length > 0 ? (
            <div className="compact-card score-card">
              <div className="card-header-mini">
                <strong>Similarity Scores</strong>
                <span className="card-sub">{fuzzyAlgo}</span>
              </div>
              <div className="score-histogram-bars">
                {analysis.scoreStats.map((s, idx) => {
                  const heightPct = Math.max(6, Math.round((s.count / analysis.maxScoreCount) * 100));
                  return (
                    <div
                      key={idx}
                      className="score-bar-col"
                      title={`${s.range} similarity: ${s.count} matches (${s.pct}%)`}
                    >
                      <div className="score-bar-track">
                        <div
                          className="score-bar-fill"
                          style={{ height: `${heightPct}%` }}
                        ></div>
                      </div>
                      <span className="score-label">{s.range}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : analysis.hasVariableLength ? (
            <div className="compact-card length-card">
              <div className="card-header-mini">
                <strong>Match Lengths</strong>
                <span className="card-sub">{analysis.lengthStats.length} sizes</span>
              </div>
              <div className="length-histogram-bars">
                {analysis.lengthStats.map((l, idx) => {
                  const heightPct = Math.max(6, Math.round((l.count / analysis.maxLengthCount) * 100));
                  return (
                    <div
                      key={idx}
                      className="length-bar-col"
                      title={`${l.len} notes: ${l.count} matches (${l.pct}%)`}
                    >
                      <div className="length-bar-track">
                        <div
                          className="length-bar-fill"
                          style={{ height: `${heightPct}%` }}
                        ></div>
                      </div>
                      <span className="length-label">{l.len}n</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Fixed length Step Directions */
            analysis.positionStats.length > 0 && (
              <div className="compact-card contour-card">
                <div className="card-header-mini">
                  <strong>Step Directions</strong>
                  <span className="card-legend-tags">
                    <span className="tag-u">▲u</span>
                    <span className="tag-d">▼d</span>
                    <span className="tag-r">●r</span>
                  </span>
                </div>
                <div className="contour-step-bars">
                  {analysis.positionStats.map((stat, pIdx) => {
                    const tot = stat.total || 1;
                    const uPct = Math.round((stat.u / tot) * 100);
                    const dPct = Math.round((stat.d / tot) * 100);
                    const rPct = Math.round((stat.r / tot) * 100);

                    return (
                      <div
                        key={pIdx}
                        className="step-col"
                        title={`Step ${pIdx + 1}: u=${uPct}%, d=${dPct}%, r=${rPct}%`}
                      >
                        <div className="step-stack-bar">
                          {uPct > 0 && <div className="seg-u" style={{ height: `${uPct}%` }}></div>}
                          {dPct > 0 && <div className="seg-d" style={{ height: `${dPct}%` }}></div>}
                          {rPct > 0 && <div className="seg-r" style={{ height: `${rPct}%` }}></div>}
                        </div>
                        <span className="step-idx">{pIdx + 1}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {/* 3. Top Matched Variants */}
          <div className="compact-card motifs-card">
            <div className="card-header-mini">
              <strong>{analysis.isFuzzy ? 'Matched Variants' : 'Top Motifs'}</strong>
              <span className="card-sub">Filter</span>
            </div>
            <div className="motifs-mini-pills">
              {analysis.patterns.map((item, idx) => {
                const isSelected = filterText === item.pat;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`motif-mini-chip ${isSelected ? 'active' : ''}`}
                    onClick={() => onSelectPatternFilter(isSelected ? '' : item.pat)}
                    title={`Filter for "${item.pat}" (${item.count} matches, ${item.pct}%)`}
                  >
                    <code>{item.pat}</code>
                    <span className="chip-cnt">{item.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
