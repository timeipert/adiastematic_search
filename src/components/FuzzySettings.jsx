import React from 'react';

const ALGO_DESCRIPTIONS = {
  hamming: "Fixed length: allows substitutions, but no note insertions or deletions.",
  levenshtein: "Edit distance: allows substitutions, note insertions, and deletions.",
  subsequence: "Subsequence: allows extra decorative notes between matching notes."
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
            <option value="hamming">Hamming (Fixed length)</option>
            <option value="subsequence">Subsequence (Additions allowed)</option>
            <option value="levenshtein">Levenshtein (Edit distance)</option>
          </select>
        </div>

        <div className="input-group slider-group">
          <label htmlFor="fuzzy_threshold">Similarity ({fuzzyThreshold}%)</label>
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
