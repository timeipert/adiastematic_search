import React, { useMemo } from 'react';
import MultiSelectCorpora from './MultiSelectCorpora';
import FuzzySettings from './FuzzySettings';
import WorkflowActions from './WorkflowActions';
import { validateQuery } from '../utils/searchEngine';

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
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') onSearch();
  };

  const validation = useMemo(() => {
    return validateQuery(query, searchMode, ignoreSyllables);
  }, [query, searchMode, ignoreSyllables]);

  return (
    <section className="controls glass-panel">
      {/* Primary search bar — the hero of the page */}
      <div className="search-hero">
        <div className="search-field">
          <span className="search-icon" aria-hidden="true">🔍</span>
          <input
            type="text"
            id="query"
            className={`search-input ${validation.error ? 'input-error' : ''}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search a contour, e.g. *uddd, .{3}, or [u|d]r"
            autoComplete="off"
            aria-label="Adiastematic query"
          />
        </div>
        <button className="primary-btn search-btn" onClick={onSearch}>
          Search
        </button>
      </div>

      {/* Compiler & Syntax Feedback Alerts */}
      {validation.error && (
        <div className="compiler-alert compiler-error">
          <span className="compiler-icon" aria-hidden="true">⚠️</span>
          <div className="compiler-body">
            <strong>Regex Error:</strong> {validation.error.message}
          </div>
        </div>
      )}

      {validation.warnings.length > 0 && !validation.error && (
        <div className="compiler-warnings-list">
          {validation.warnings.map((w) => (
            <div key={w.id} className="compiler-alert compiler-warning">
              <span className="compiler-icon" aria-hidden="true">💡</span>
              <div className="compiler-body">
                <span>{w.message}</span>
                {w.action === 'disable_ignore_syllables' && (
                  <button
                    type="button"
                    className="compiler-action-btn"
                    onClick={() => {
                      setIgnoreSyllables(false);
                      setTimeout(onSearch, 50);
                    }}
                  >
                    {w.actionLabel}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Syntax legend + recent searches */}
      <div className="search-meta">
        <div className="syntax-legend">
          <span className="meta-label">Syntax</span>
          <span className="tag-pill">* = Start Note</span>
          <span className="tag-pill">u = Up</span>
          <span className="tag-pill">d = Down</span>
          <span className="tag-pill">r = Repeat</span>
          <span className="tag-pill">␣ = Neume</span>
          <span className="tag-pill">___ = Syllable</span>
          <span className="tag-pill">. = Any Note</span>
          <span className="tag-pill">[…] = Skip</span>
        </div>

        {searchMode === 'exact' && validation.compiledRegex && query.trim() && (
          <div className="compiled-regex-badge" title="Compiled JavaScript regular expression">
            <span className="meta-label">Regex</span>
            <code>{validation.compiledRegex}</code>
          </div>
        )}

        {searchHistory && searchHistory.length > 0 && (
          <div className="recent-searches">
            <span className="meta-label">Recent</span>
            {searchHistory.map((histQuery, idx) => (
              <button
                key={idx}
                className="tag-pill tag-pill-btn"
                onClick={() => onSelectHistory(histQuery)}
                title="Click to search again"
              >
                {histQuery}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Advanced options */}
      <details className="options" open>
        <summary className="options-summary">
          <span>Search options</span>
          <span className="options-chevron" aria-hidden="true">▾</span>
        </summary>

        <div className="options-body">
          <div className="options-grid">
            <MultiSelectCorpora
              availableCorpora={availableCorpora}
              selectedCorpora={selectedCorpora}
              onChange={setSelectedCorpora}
            />

            <div className="input-group">
              <label>Search mode</label>
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
              <label htmlFor="search_location">Match location</label>
              <select
                id="search_location"
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
              >
                <option value="Anywhere in the melody">Anywhere in the melody</option>
                <option value="Only in the Beginning (Incipit)">In the beginning (incipit)</option>
                <option value="Only in the End (Coda)">In the end (coda)</option>
              </select>
            </div>

            <div className="input-group slider-group">
              <label htmlFor="region_size">Region size ({regionSize}%)</label>
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

          <div className="options-footer">
            <label className="check-option">
              <input
                type="checkbox"
                checked={ignoreSyllables}
                onChange={(e) => setIgnoreSyllables(e.target.checked)}
              />
              Ignore syllables in search
            </label>

            <WorkflowActions
              getSearchState={getSearchState}
              setSearchState={setSearchState}
              onSearch={onSearch}
            />
          </div>
        </div>
      </details>
    </section>
  );
}
