import React, { useState, useMemo, useRef, useEffect } from 'react';
import { getSearchDiagnostics } from '../utils/searchEngine';
import WildcardBreakdown from './WildcardBreakdown';

function ScrollableCell({ children, className, title, emptyPlaceholder = '-' }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      const mark = containerRef.current.querySelector('mark');
      if (mark) {
        const containerWidth = containerRef.current.clientWidth;
        const markOffsetLeft = mark.offsetLeft;
        const markWidth = mark.offsetWidth;
        const targetScrollLeft = Math.max(0, markOffsetLeft - (containerWidth / 2) + (markWidth / 2));
        containerRef.current.scrollLeft = targetScrollLeft;
      } else {
        containerRef.current.scrollLeft = 0;
      }
    }
  }, [children]);

  if (!children) return <span className="cell-muted">{emptyPlaceholder}</span>;

  return (
    <div ref={containerRef} className={className} title={title}>
      {children}
    </div>
  );
}

export default function ResultsTable({
  results,
  isLoading,
  onOpenStats,
  searchState,
  onUpdateSearchState,
  availableCorpora,
  onSearch
}) {
  const [filterText, setFilterText] = useState('');
  const [sortBy, setSortBy] = useState('relevance'); // 'relevance' | 'title' | 'source' | 'position'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedRow, setExpandedRow] = useState(null);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);

  const diagnostics = useMemo(() => {
    if (isLoading || (results && results.length > 0)) return null;
    return getSearchDiagnostics({
      query: searchState?.query,
      searchMode: searchState?.searchMode,
      searchLocation: searchState?.searchLocation,
      regionSize: searchState?.regionSize,
      fuzzyThreshold: searchState?.fuzzyThreshold,
      ignoreSyllables: searchState?.ignoreSyllables,
      selectedCorpora: searchState?.selectedCorpora,
      availableCorpora: availableCorpora,
      resultsCount: results?.length || 0,
      regexError: results?.regexError
    });
  }, [results, isLoading, searchState, availableCorpora]);

  const handleDiagnosticAction = (action) => {
    if (!onUpdateSearchState) return;
    if (action === 'disable_ignore_syllables') {
      onUpdateSearchState({ ignoreSyllables: false });
    } else if (action === 'enable_ignore_syllables') {
      onUpdateSearchState({ ignoreSyllables: true });
    } else if (action === 'reset_location') {
      onUpdateSearchState({ location: 'Anywhere in the melody' });
    } else if (action === 'max_region_size') {
      onUpdateSearchState({ region: 100 });
    } else if (action === 'select_all_corpora') {
      onUpdateSearchState({ corpus: availableCorpora?.map((c) => c.name) || [] });
    } else if (action === 'switch_to_fuzzy') {
      onUpdateSearchState({ mode: 'fuzzy' });
    } else if (action === 'lower_fuzzy_threshold') {
      onUpdateSearchState({ threshold: 60 });
    }
  };

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
    if (!contour) return null;
    if (!matchIndices || matchIndices.start < 0 || matchIndices.end > contour.length) {
      return <span>{contour}</span>;
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
    if (!volpiano) return null;
    if (!vMatchIndices || vMatchIndices.start < 0 || vMatchIndices.end > volpiano.length) {
      return <span>{volpiano}</span>;
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
      {/* Results Header */}
      <header className="results-header">
        <div className="header-left">
          <h2>
            Results (<span id="result_count">{filteredResults.length}</span>)
          </h2>
          {isLoading && <div className="loader"></div>}
        </div>

        <div className="results-controls">
          {/* Quick Filter */}
          <input
            type="text"
            className="inline-input"
            style={{ minWidth: '180px' }}
            placeholder="🔎 Filter results..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />

          {/* Sort Select */}
          <select
            className="inline-input select-input"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setSortOrder('asc');
            }}
          >
            <option value="relevance">Sort: Relevance</option>
            <option value="title">Sort: Title (A-Z)</option>
            <option value="source">Sort: Corpus Source</option>
            <option value="position">Sort: Match Position</option>
          </select>

          {results && results.length > 0 && (
            <button className="secondary-btn" onClick={onOpenStats}>
              📊 Stats
            </button>
          )}
        </div>
      </header>

      {/* Mini-Diagrams for Wildcard & Fuzzy searches */}
      {results && results.length > 0 && (
        <WildcardBreakdown
          results={results}
          query={searchState?.query}
          searchMode={searchState?.searchMode}
          fuzzyAlgo={searchState?.fuzzyAlgo}
          fuzzyThreshold={searchState?.fuzzyThreshold}
          filterText={filterText}
          onSelectPatternFilter={setFilterText}
          isOpen={isBreakdownOpen}
          onToggle={() => setIsBreakdownOpen(!isBreakdownOpen)}
        />
      )}

      {/* Top Pagination Bar */}
      {filteredResults.length > 0 && (
        <div className="pagination-bar" style={{ marginBottom: '1rem', marginTop: 0 }}>
          <div className="pagination-info">
            Showing {pageSize === 0 ? 1 : (page - 1) * pageSize + 1}–
            {pageSize === 0 ? filteredResults.length : Math.min(filteredResults.length, page * pageSize)} of {filteredResults.length} melodies
          </div>

          <div className="pagination-controls">
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Show:</label>
            <select
              className="inline-input"
              style={{ width: '75px', padding: '0.2rem 0.4rem' }}
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
                  Page {page} / {totalPages}
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

      {/* Results Table */}
      <div className="table-responsive">
        <table className="results-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th style={{ minWidth: '320px' }}>Volpiano (Scrollable)</th>
              <th style={{ minWidth: '220px' }}>Contour (Scrollable)</th>
              <th onClick={() => handleSortHeader('title')} className="sortable-col" style={{ minWidth: '180px' }}>
                Title {sortBy === 'title' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSortHeader('source')} className="sortable-col">
                Source {sortBy === 'source' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th>Genre / Mode</th>
              <th onClick={() => handleSortHeader('position')} className="sortable-col">
                Position {sortBy === 'position' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th style={{ width: '50px' }}></th>
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

                      {/* 1st Main Column: Volpiano Notation with Highlight and Auto-Centering Scroll */}
                      <td className="cell-volpiano">
                        {item.volpiano ? (
                          <ScrollableCell className="volpiano-cell" title={item.volpiano}>
                            {renderVolpianoHighlight(item.volpiano, item.volpianoMatchIndices)}
                          </ScrollableCell>
                        ) : (
                          <span className="adiastematic-badge" title="Adiastematic transcription (unpitched notation)">
                            Adiastematic
                          </span>
                        )}
                      </td>

                      {/* 2nd Main Column: Contour String with Highlight and Auto-Centering Scroll */}
                      <td className="cell-contour">
                        <ScrollableCell className="contour-cell" title={item.contour}>
                          {renderContourHighlight(item.contour, item.matchIndices)}
                        </ScrollableCell>
                      </td>

                      {/* Title & Siglum */}
                      <td className="cell-title">
                        <strong>{item.initial_text || item.melodyname_standardized || item.uuid || 'Melody'}</strong>
                        {item.siglum && <div className="cell-muted" style={{ fontSize: '0.8rem' }}>{item.siglum}</div>}
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

                      {/* Match Position / Score */}
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
                          title="Toggle details"
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
                            <div><strong>Title:</strong> {item.initial_text || item.melodyname_standardized || '-'}</div>
                            <div><strong>Siglum:</strong> {item.siglum || '-'}</div>
                            <div><strong>Editor:</strong> {item.editor || '-'}</div>
                            <div><strong>Feast:</strong> {item.feast_day || '-'} {item.feast_time || ''}</div>
                            <div><strong>Related:</strong> {item.related_chant || '-'}</div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <strong>Full Contour:</strong>
                              <div className="contour-cell" style={{ marginTop: '0.4rem', padding: '0.6rem' }}>
                                {renderContourHighlight(item.contour, item.matchIndices)}
                              </div>
                            </div>
                            {item.volpiano && (
                              <div style={{ gridColumn: '1 / -1' }}>
                                <strong>Full Volpiano:</strong>
                                <div className="volpiano-display" style={{ marginTop: '0.4rem' }}>
                                  {renderVolpianoHighlight(item.volpiano, item.volpianoMatchIndices)}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan="8" className="empty-state-cell">
                  {isLoading ? (
                    <div className="empty-state-loading">
                      <div className="loader"></div>
                      <p>Searching melodic databases...</p>
                    </div>
                  ) : filterText.trim() ? (
                    <div className="empty-state-box">
                      <p>No results match filter <strong>"{filterText}"</strong>.</p>
                      <button className="secondary-btn" onClick={() => setFilterText('')}>
                        Clear Filter
                      </button>
                    </div>
                  ) : (
                    <div className="empty-state-diagnostic">
                      <div className="diagnostic-header">
                        <span className="diagnostic-icon" aria-hidden="true">🔍</span>
                        <h3>No melodies found {searchState?.query ? `for "${searchState.query}"` : ''}</h3>
                      </div>

                      {results?.regexError && (
                        <div className="compiler-alert compiler-error" style={{ margin: '1rem 0', textAlign: 'left' }}>
                          <span className="compiler-icon" aria-hidden="true">⚠️</span>
                          <div className="compiler-body">
                            <strong>Regex error:</strong> {results.regexError.message}
                          </div>
                        </div>
                      )}

                      {diagnostics && diagnostics.length > 0 && (
                        <div className="diagnostic-advisor-panel">
                          <div className="advisor-title">💡 Diagnostic suggestions & quick fixes:</div>
                          <div className="diagnostic-cards-grid">
                            {diagnostics.map((diag, dIdx) => (
                              <div key={dIdx} className={`diagnostic-card ${diag.type}`}>
                                <div className="diagnostic-card-main">
                                  <strong>{diag.title}</strong>
                                  <p>{diag.message}</p>
                                </div>
                                {diag.remedyLabel && (
                                  <button
                                    type="button"
                                    className="primary-btn btn-sm diagnostic-btn"
                                    onClick={() => handleDiagnosticAction(diag.action)}
                                  >
                                    {diag.remedyLabel}
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
            Showing {pageSize === 0 ? 1 : (page - 1) * pageSize + 1}–
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
                  Page {page} / {totalPages}
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
