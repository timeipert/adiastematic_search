import React, { useState, useEffect } from 'react';

export default function WorkflowActions({ getSearchState, setSearchState, onSearch }) {
  const [savedQueries, setSavedQueries] = useState({});
  const [saveName, setSaveName] = useState('');
  const [selectedLoad, setSelectedLoad] = useState('');

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('adiastematic_queries') || '{}');
      setSavedQueries(stored);
    } catch (e) {
      console.error('Error loading saved queries:', e);
    }
  }, []);

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) {
      alert('Please enter a name for the query.');
      return;
    }
    const state = getSearchState();
    const updated = { ...savedQueries, [name]: state };
    setSavedQueries(updated);
    localStorage.setItem('adiastematic_queries', JSON.stringify(updated));
    setSaveName('');
  };

  const handleLoad = (name) => {
    if (!name || !savedQueries[name]) return;
    setSearchState(savedQueries[name]);
    setSelectedLoad('');
    setTimeout(onSearch, 100);
  };

  const handleDelete = () => {
    if (!selectedLoad) {
      alert('Please select a saved query to delete.');
      return;
    }
    if (confirm(`Are you sure you want to delete "${selectedLoad}"?`)) {
      const updated = { ...savedQueries };
      delete updated[selectedLoad];
      setSavedQueries(updated);
      localStorage.setItem('adiastematic_queries', JSON.stringify(updated));
      setSelectedLoad('');
    }
  };

  const handleShare = () => {
    const state = getSearchState();
    const params = new URLSearchParams();
    Object.keys(state).forEach((key) => {
      if (Array.isArray(state[key])) {
        params.set(key, state[key].join(','));
      } else {
        params.set(key, state[key]);
      }
    });

    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Share link copied to clipboard!');
    });
  };

  return (
    <div className="workflow-actions">
      <div className="workflow-group">
        <div className="saved-queries-container">
          <input
            type="text"
            className="inline-input"
            placeholder="Name query..."
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
          />
          <button className="icon-btn" onClick={handleSave} title="Save Current Query">
            💾
          </button>
          <div className="vertical-divider"></div>
          <select
            value={selectedLoad}
            onChange={(e) => {
              setSelectedLoad(e.target.value);
              handleLoad(e.target.value);
            }}
          >
            <option value="" disabled>
              Load Saved...
            </option>
            {Object.keys(savedQueries).sort().map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button className="icon-btn delete-btn" onClick={handleDelete} title="Delete Selected Query">
            🗑️
          </button>
        </div>
      </div>
      <button className="secondary-btn share-btn" onClick={handleShare}>
        🔗 Share
      </button>
    </div>
  );
}
