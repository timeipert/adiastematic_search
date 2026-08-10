import React from 'react';
import MultiSelectCorpora from './MultiSelectCorpora';
import FuzzySettings from './FuzzySettings';
import WorkflowActions from './WorkflowActions';

export default function Controls({
  query,
  setQuery,
  availableCorpora,
  selectedCorpora,
  setSelectedCorpora,
  searchMode,
  setSearchMode,
  searchLocation,
  setSearchLocation,
  regionSize,
  setRegionSize,
  fuzzyAlgo,
  setFuzzyAlgo,
  fuzzyThreshold,
  setFuzzyThreshold,
  ignoreSyllables,
  setIgnoreSyllables,
  onSearch,
  getSearchState,
  setSearchState,
  searchHistory,
  onSelectHistory
}) {
  return (
    <section className="controls glass-panel">
      <div className="input-group full-width">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label htmlFor="query">Adiastematic Query</label>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Syntax: <span className="tag-pill">u = Up</span> <span className="tag-pill">d = Down</span> <span className="tag-pill">r = Repeat</span> <span className="tag-pill">_ = Syllable</span> <span className="tag-pill">[...] = Any Notes</span>
          </div>
        </div>
        <input
          type="text"
          id="query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. _uddd or [u|d]r"
          autoComplete="off"
        />

        {searchHistory && searchHistory.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Recent Searches (Last 5):</span>
            {searchHistory.map((histQuery, idx) => (
              <button
                key={idx}
                className="tag-pill"
                style={{ cursor: 'pointer', border: '1px solid var(--panel-border)', background: 'rgba(94, 114, 228, 0.15)', color: 'var(--text-main)' }}
                onClick={() => onSelectHistory(histQuery)}
                title="Click to search again"
              >
                🔍 {histQuery}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="control-row">
        <MultiSelectCorpora
          availableCorpora={availableCorpora}
          selectedCorpora={selectedCorpora}
          onChange={setSelectedCorpora}
        />

        <div className="input-group">
          <label>Search Mode</label>
          <div className="mode-toggle">
            <button
              className={`toggle-btn ${searchMode === 'exact' ? 'active' : ''}`}
              onClick={() => setSearchMode('exact')}
            >
              Exact
            </button>
            <button
              className={`toggle-btn ${searchMode === 'fuzzy' ? 'active' : ''}`}
              onClick={() => setSearchMode('fuzzy')}
            >
              Fuzzy
            </button>
          </div>
        </div>

        <div className="input-group">
          <label htmlFor="search_location">Where should the match occur?</label>
          <select
            id="search_location"
            value={searchLocation}
            onChange={(e) => setSearchLocation(e.target.value)}
          >
            <option value="Anywhere in the melody">Anywhere in the melody</option>
            <option value="Only in the Beginning (Incipit)">In the Beginning</option>
            <option value="Only in the End (Coda)">In the End</option>
          </select>
        </div>

        <div className="input-group slider-group">
          <label htmlFor="region_size">Size of Beginning or End ({regionSize}%)</label>
          <input
            type="range"
            id="region_size"
            min="5"
            max="100"
            step="5"
            value={regionSize}
            onChange={(e) => setRegionSize(parseInt(e.target.value))}
          />
        </div>
      </div>

      <FuzzySettings
        fuzzyAlgo={fuzzyAlgo}
        setFuzzyAlgo={setFuzzyAlgo}
        fuzzyThreshold={fuzzyThreshold}
        setFuzzyThreshold={setFuzzyThreshold}
        hidden={searchMode !== 'fuzzy'}
      />

      <div className="actions">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={ignoreSyllables}
            onChange={(e) => setIgnoreSyllables(e.target.checked)}
          />
          Ignore syllables in search
        </label>
        <button className="primary-btn" onClick={onSearch}>
          Search Melodies
        </button>
      </div>

      <WorkflowActions
        getSearchState={getSearchState}
        setSearchState={setSearchState}
        onSearch={onSearch}
      />
    </section>
  );
}
