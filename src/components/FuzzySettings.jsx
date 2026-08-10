import React from 'react';

const ALGO_DESCRIPTIONS = {
  hamming: "Hamming Distance: Matches the query character-by-character. Allows mismatches but no insertions or deletions. Best for fixed-length motifs.",
  levenshtein: "Levenshtein Distance: Classic edit distance. Allows insertions, deletions, and substitutions. Finds the closest match even if notes are missing or extra notes are present.",
  subsequence: "Additions Allowed: Finds the query notes in the correct order, but allows arbitrary 'filler' notes between them. Perfect for finding embellished versions of a motif."
};

export default function FuzzySettings({ fuzzyAlgo, setFuzzyAlgo, fuzzyThreshold, setFuzzyThreshold, hidden }) {
  return (
    <div className={`fuzzy-panel ${hidden ? 'hidden' : ''}`}>
      <div className="control-row">
        <div className="input-group">
          <label htmlFor="fuzzy_algo">Fuzzy Algorithm</label>
          <select
            id="fuzzy_algo"
            value={fuzzyAlgo}
            onChange={(e) => setFuzzyAlgo(e.target.value)}
          >
            <option value="hamming">Hamming Distance (Fixed Length)</option>
            <option value="subsequence">Additions Allowed (Subsequence)</option>
            <option value="levenshtein">Levenshtein Distance (Edit Distance)</option>
          </select>
        </div>

        <div className="input-group slider-group">
          <label htmlFor="fuzzy_threshold">Similarity Threshold ({fuzzyThreshold}%)</label>
          <input
            type="range"
            id="fuzzy_threshold"
            min="30"
            max="100"
            step="5"
            value={fuzzyThreshold}
            onChange={(e) => setFuzzyThreshold(parseInt(e.target.value))}
          />
        </div>
      </div>

      <div className="algo-explanation">
        {ALGO_DESCRIPTIONS[fuzzyAlgo] || ''}
      </div>
    </div>
  );
}
