import React, { useState, useEffect, useRef } from 'react';

export default function MultiSelectCorpora({ availableCorpora, selectedCorpora, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const total = availableCorpora.length;
  const selectedCount = selectedCorpora.length;

  let btnText = '';
  if (selectedCount === total && total > 0) {
    btnText = `All Corpora (${total})`;
  } else if (selectedCount === 0) {
    btnText = `None selected (0)`;
  } else if (selectedCount === 1) {
    btnText = selectedCorpora[0];
  } else {
    btnText = `${selectedCount} / ${total} Corpora`;
  }

  const handleToggle = (name) => {
    if (selectedCorpora.includes(name)) {
      onChange(selectedCorpora.filter((c) => c !== name));
    } else {
      onChange([...selectedCorpora, name]);
    }
  };

  const handleSelectAll = () => {
    onChange(availableCorpora.map((c) => c.name));
  };

  const handleDeselectAll = () => {
    onChange([]);
  };

  return (
    <div className="input-group custom-multiselect-group" ref={containerRef}>
      <label>Corpora</label>
      <div className={`custom-multiselect ${isOpen ? 'open' : ''}`}>
        <button
          type="button"
          className="multiselect-btn"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span>{btnText}</span>
          <span className="arrow">▼</span>
        </button>

        {isOpen && (
          <div className="multiselect-menu">
            <div className="multiselect-actions">
              <button type="button" className="btn-text" onClick={handleSelectAll}>
                Select All
              </button>
              <span className="sep">|</span>
              <button type="button" className="btn-text" onClick={handleDeselectAll}>
                Deselect All
              </button>
            </div>
            <div className="multiselect-options">
              {availableCorpora.map((corp) => {
                const isChecked = selectedCorpora.includes(corp.name);
                return (
                  <label key={corp.name} className="multiselect-option">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggle(corp.name)}
                    />
                    <span>{corp.name}</span>
                    <span className="corpus-badge">{corp.count}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
