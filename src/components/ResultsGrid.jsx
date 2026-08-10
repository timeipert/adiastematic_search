import React, { useState, useMemo } from 'react';
import ResultCard from './ResultCard';

export default function ResultsGrid({ results, isLoading, onOpenStats }) {
  const [filterText, setFilterText] = useState('');
  const [sortBy, setSortBy] = useState('none');

  const filteredResults = useMemo(() => {
    if (!results) return [];
    let list = [...results];

    if (filterText.trim()) {
      const query = filterText.toLowerCase();
      list = list.filter((item) => {
        const title = (item.initial_text || item.melodyname_standardized || '').toLowerCase();
        const siglum = (item.siglum || '').toLowerCase();
        const genre = (item.genre || '').toLowerCase();
        const mode = (item.mode || '').toLowerCase();
        const source = (item.database_source || '').toLowerCase();
        return title.includes(query) || siglum.includes(query) || genre.includes(query) || mode.includes(query) || source.includes(query);
      });
    }

    if (sortBy === 'genre') {
      list.sort((a, b) => (a.genre || '').localeCompare(b.genre || ''));
    } else if (sortBy === 'mode') {
      list.sort((a, b) => (a.mode || '').localeCompare(b.mode || ''));
    } else if (sortBy === 'position') {
      list.sort((a, b) => (a.matchPositionPct || 0) - (b.matchPositionPct || 0));
    } else if (sortBy === 'id') {
      list.sort((a, b) => (a.uuid || '').localeCompare(b.uuid || ''));
    }

    return list;
  }, [results, filterText, sortBy]);

  return (
    <section className="results glass-panel">
      <header className="results-header">
        <div className="header-left">
          <h2>
            Results (<span id="result_count">{filteredResults.length}</span>)
          </h2>
          {isLoading && <div className="loader"></div>}
        </div>

        <div className="results-controls">
          <input
            type="text"
            className="inline-input"
            placeholder="Filter results..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          <select
            className="inline-input select-input"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="none">Sort By: Relevance</option>
            <option value="genre">Sort By: Genre</option>
            <option value="mode">Sort By: Mode</option>
            <option value="position">Sort By: Position</option>
            <option value="id">Sort By: ID</option>
          </select>

          {results && results.length > 0 && (
            <button className="secondary-btn" onClick={onOpenStats}>
              📊 View Statistics
            </button>
          )}
        </div>
      </header>

      <div className="results-grid">
        {filteredResults.length > 0 ? (
          filteredResults.map((item, idx) => (
            <ResultCard key={item.uuid || idx} item={item} />
          ))
        ) : (
          <div className="empty-state">
            {isLoading ? 'Searching...' : 'No matching melodies found.'}
          </div>
        )}
      </div>
    </section>
  );
}
