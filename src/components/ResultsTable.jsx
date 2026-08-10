import React, { useState, useMemo } from 'react';

export default function ResultsTable({ results, isLoading, onOpenStats }) {
  const [filterText, setFilterText] = useState('');
  const [sortBy, setSortBy] = useState('relevance'); // 'relevance' | 'title' | 'source' | 'position'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedRow, setExpandedRow] = useState(null);

  const filteredResults = useMemo(() => {
    if (!results) return [];
    let list = [...results];

    // Text filter
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      list = list.filter((item) => {
        const title = (item.initial_text || item.melodyname_standardized || '').toLowerCase();
        const siglum = (item.siglum || '').toLowerCase();
        const genre = (item.genre || '').toLowerCase();
        const mode = (item.mode || '').toLowerCase();
        const source = (item.database_source || '').toLowerCase();
        return title.includes(q) || siglum.includes(q) || genre.includes(q) || mode.includes(q) || source.includes(q);
      });
    }

    // Sorting
    if (sortBy === 'title') {
      list.sort((a, b) => {
        const tA = (a.initial_text || a.melodyname_standardized || '').toLowerCase();
        const tB = (b.initial_text || b.melodyname_standardized || '').toLowerCase();
        return sortOrder === 'asc' ? tA.localeCompare(tB) : tB.localeCompare(tA);
      });
    } else if (sortBy === 'source') {
      list.sort((a, b) => {
        const sA = (a.database_source || '').toLowerCase();
        const sB = (b.database_source || '').toLowerCase();
        return sortOrder === 'asc' ? sA.localeCompare(sB) : sB.localeCompare(sA);
      });
    } else if (sortBy === 'position') {
      list.sort((a, b) => {
        const pA = a.matchPositionPct !== undefined ? a.matchPositionPct : 0;
        const pB = b.matchPositionPct !== undefined ? b.matchPositionPct : 0;
        return sortOrder === 'asc' ? pA - pB : pB - pA;
      });
    }

    return list;
  }, [results, filterText, sortBy, sortOrder]);

  // Reset page when filters change
  useMemo(() => {
    setPage(1);
  }, [results, filterText, sortBy, sortOrder]);

  const effectivePageSize = pageSize === 0 ? Math.max(1, filteredResults.length) : pageSize;
  const totalPages = Math.ceil(filteredResults.length / effectivePageSize) || 1;

  const paginatedResults = useMemo(() => {
    if (pageSize === 0) return filteredResults;
    const start = (page - 1) * pageSize;
    return filteredResults.slice(start, start + pageSize);
  }, [filteredResults, page, pageSize]);

  const handleSortHeader = (col) => {
    if (sortBy === col) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
  };

  const renderContourHighlight = (contour, matchIndices) => {
    if (!contour) return '-';
    if (!matchIndices || matchIndices.start < 0 || matchIndices.end > contour.length) {
      return contour;
    }
    const before = contour.substring(0, matchIndices.start);
    const match = contour.substring(matchIndices.start, matchIndices.end);
    const after = contour.substring(matchIndices.end);

    return (
      <span className="contour-text">
        {before}
        <mark className="highlight-glow">{match}</mark>
        {after}
      </span>
    );
  };

  const renderVolpianoHighlight = (volpiano, vMatchIndices) => {
    if (!volpiano) return '-';
    if (!vMatchIndices || vMatchIndices.start < 0 || vMatchIndices.end > volpiano.length) {
      return volpiano;
    }
    const before = volpiano.substring(0, vMatchIndices.start);
    const match = volpiano.substring(vMatchIndices.start, vMatchIndices.end);
    const after = volpiano.substring(vMatchIndices.end);

    return (
      <>
        {before}
        <mark className="highlight-glow-volpiano">{match}</mark>
        {after}
      </>
    );
  };

  return (
    <section className="results glass-panel">
      {/* Sleek Results Controls Header */}
      <header className="results-header">
        <div className="header-left">
          <h2>
            Results (<span id="result_count">{filteredResults.length}</span>)
          </h2>
          {isLoading && <div className="loader"></div>}
        </div>

        <div className="results-controls">
          {/* Quick Search in Results */}
          <input
            type="text"
            className="inline-input"
            style={{ minWidth: '200px' }}
            placeholder="🔎 Filter results..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />

          {/* Sort By Select */}
          <select
            className="inline-input select-input"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setSortOrder('asc');
            }}
          >
            <option value="relevance">Sort By: Relevance</option>
            <option value="title">Sort By: Title (A-Z)</option>
            <option value="source">Sort By: Corpus Source</option>
            <option value="position">Sort By: Match Position</option>
          </select>

          {results && results.length > 0 && (
            <button className="secondary-btn" onClick={onOpenStats}>
              📊 Statistics
            </button>
          )}
        </div>
      </header>

      {/* Top Pagination Bar */}
      {filteredResults.length > 0 && (
        <div className="pagination-bar" style={{ marginBottom: '1rem', marginTop: 0 }}>
          <div className="pagination-info">
            Showing {pageSize === 0 ? 1 : (page - 1) * pageSize + 1} to{' '}
            {pageSize === 0 ? filteredResults.length : Math.min(filteredResults.length, page * pageSize)} of {filteredResults.length} melodies
          </div>

          <div className="pagination-controls">
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Page Size:</label>
            <select
              className="inline-input"
              style={{ width: '80px', padding: '0.2rem 0.4rem' }}
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value));
                setPage(1);
              }}
            >
              <option value="15">15</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="0">All</option>
            </select>

            {pageSize > 0 && (
              <>
                <button
                  className="secondary-btn"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  ◀ Prev
                </button>
                <span className="page-indicator">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="secondary-btn"
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next ▶
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Large Results Table */}
      <div className="table-responsive">
        <table className="results-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th style={{ minWidth: '340px' }}>Volpiano Melody (Match Highlighted)</th>
              <th style={{ minWidth: '200px' }}>Contour Match</th>
              <th onClick={() => handleSortHeader('title')} className="sortable-col" style={{ minWidth: '200px' }}>
                Title / Incipit {sortBy === 'title' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSortHeader('source')} className="sortable-col">
                Corpus Source {sortBy === 'source' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th>Genre / Mode</th>
              <th onClick={() => handleSortHeader('position')} className="sortable-col">
                Position {sortBy === 'position' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th style={{ width: '60px' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {paginatedResults.length > 0 ? (
              paginatedResults.map((item, idx) => {
                const globalIdx = pageSize === 0 ? idx + 1 : (page - 1) * pageSize + idx + 1;
                const isExpanded = expandedRow === item.uuid || expandedRow === globalIdx;
                return (
                  <React.Fragment key={item.uuid || globalIdx}>
                    <tr className={`table-row ${isExpanded ? 'row-expanded' : ''}`}>
                      <td className="cell-num">{globalIdx}</td>

                      {/* 1st Main Column: Volpiano Notation with Highlight */}
                      <td className="cell-volpiano">
                        <div className="volpiano-cell" title={item.volpiano}>
                          {renderVolpianoHighlight(item.volpiano, item.volpianoMatchIndices)}
                        </div>
                      </td>

                      {/* 2nd Main Column: Contour String with Highlight */}
                      <td className="cell-contour">
                        {renderContourHighlight(item.contour, item.matchIndices)}
                      </td>

                      {/* Title & Siglum/Page */}
                      <td className="cell-title">
                        <strong>{item.initial_text || item.melodyname_standardized || item.uuid || 'Melody'}</strong>
                        {item.siglum && <div className="cell-muted" style={{ fontSize: '0.8rem' }}>Siglum: {item.siglum}</div>}
                      </td>

                      {/* Corpus Source */}
                      <td>
                        <span className="badge">{item.database_source || 'Unknown'}</span>
                      </td>

                      {/* Genre & Mode */}
                      <td className="cell-muted">
                        {item.genre && <span className="tag-pill">{item.genre}</span>}
                        {item.mode && <span className="tag-pill mode">{item.mode}</span>}
                        {!item.genre && !item.mode && '-'}
                      </td>

                      {/* Match Position */}
                      <td>
                        {item.matchPositionPct !== undefined ? (
                          <span className="pos-badge">{item.matchPositionPct}%</span>
                        ) : (
                          '-'
                        )}
                      </td>

                      {/* Expand Toggle */}
                      <td>
                        <button
                          className="btn-icon-tiny"
                          onClick={() => setExpandedRow(isExpanded ? null : item.uuid || globalIdx)}
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Row Detail */}
                    {isExpanded && (
                      <tr className="expanded-detail-row">
                        <td colSpan="8">
                          <div className="expanded-detail-content">
                            <div><strong>UUID:</strong> {item.uuid || '-'}</div>
                            <div><strong>Standardized Name:</strong> {item.melodyname_standardized || '-'}</div>
                            <div><strong>Manuscript Siglum:</strong> {item.siglum || '-'}</div>
                            <div><strong>Editor / Notes:</strong> {item.editor || '-'}</div>
                            <div><strong>Feast Day / Time:</strong> {item.feast_day || '-'} {item.feast_time || ''}</div>
                            <div><strong>Related Chant:</strong> {item.related_chant || '-'}</div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <strong>Full Volpiano Notation:</strong>
                              <div className="volpiano-display" style={{ marginTop: '0.4rem' }}>
                                {renderVolpianoHighlight(item.volpiano, item.volpianoMatchIndices)}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan="8" className="empty-state">
                  {isLoading ? 'Searching database...' : 'No matching melodies found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Pagination Bar */}
      {filteredResults.length > 0 && (
        <div className="pagination-bar">
          <div className="pagination-info">
            Showing {pageSize === 0 ? 1 : (page - 1) * pageSize + 1} to{' '}
            {pageSize === 0 ? filteredResults.length : Math.min(filteredResults.length, page * pageSize)} of {filteredResults.length} melodies
          </div>

          <div className="pagination-controls">
            {pageSize > 0 && (
              <>
                <button
                  className="secondary-btn"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  ◀ Prev
                </button>
                <span className="page-indicator">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="secondary-btn"
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next ▶
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
