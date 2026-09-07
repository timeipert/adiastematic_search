import React, { useRef, useState } from 'react';
import { parseMonodiWorkspace } from '../utils/monodiImport';

// Uploader for Corpus Monodicum "monodi workspace" exports (*.monodijson).
// Parses the file entirely in the browser, derives Volpiano + contour, and hands
// the resulting corpus up to App, which stores it in localStorage.
export default function ImportCorpus({ importedCorpora, onImport, onRemove }) {
  const fileInputRef = useRef(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [isParsing, setIsParsing] = useState(false);

  const corpusNameFromFile = (fileName) =>
    fileName.replace(/\.(monodijson|json)$/i, '').trim() || 'Imported corpus';

  const handleFile = async (file) => {
    if (!file) return;
    setError(null);
    setNotice(null);
    setIsParsing(true);

    try {
      const text = await file.text();
      let name = corpusNameFromFile(file.name);

      // Avoid silently overwriting an existing corpus of the same name.
      const existingNames = new Set(importedCorpora.map((c) => c.name));
      if (existingNames.has(name)) {
        let n = 2;
        while (existingNames.has(`${name} (${n})`)) n++;
        name = `${name} (${n})`;
      }

      const corpus = parseMonodiWorkspace(text, name);
      const persisted = onImport(corpus);

      let msg = `Imported “${corpus.name}” — ${corpus.items.length} melodies added.`;
      if (corpus.skipped > 0) {
        msg += ` (${corpus.skipped} document${corpus.skipped === 1 ? '' : 's'} without notation skipped.)`;
      }
      if (persisted === false) {
        msg += ' ⚠️ Could not save to local storage (quota?) — it is loaded for this session only.';
      }
      setNotice(msg);
    } catch (e) {
      setError(e.message || 'Could not import this file.');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    handleFile(file);
  };

  return (
    <section className="controls glass-panel import-corpus">
      <details className="options">
        <summary className="options-summary">
          <span>Import a corpus (monodi workspace)</span>
          <span className="options-chevron" aria-hidden="true">▾</span>
        </summary>

        <div className="options-body">
          <p className="import-intro">
            Load a <strong>monodi workspace export</strong> (<code>.monodijson</code>).
            Its melodies are converted to Volpiano and contour and added as a new
            searchable corpus.
          </p>

          <div className="import-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".monodijson,.json,application/json"
              onChange={onFileChange}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="primary-btn"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={isParsing}
            >
              {isParsing ? 'Importing…' : '⬆ Choose workspace file'}
            </button>
          </div>

          <div className="import-warning">
            <span aria-hidden="true">⚠️</span>
            <div>
              <strong>This is not permanent storage.</strong> Imported corpora are
              kept only in this browser's local storage. They can be lost if you
              clear browsing data, switch browser or device, or the storage is
              evicted. <strong>Keep the original file safe on your computer</strong> —
              you will need it to import again.
            </div>
          </div>

          {error && (
            <div className="compiler-alert compiler-error">
              <span className="compiler-icon" aria-hidden="true">⚠️</span>
              <div className="compiler-body">{error}</div>
            </div>
          )}

          {notice && (
            <div className="compiler-alert compiler-warning">
              <span className="compiler-icon" aria-hidden="true">✅</span>
              <div className="compiler-body">{notice}</div>
            </div>
          )}

          {importedCorpora.length > 0 && (
            <div className="imported-list">
              <span className="meta-label">Imported corpora</span>
              <ul>
                {importedCorpora.map((c) => (
                  <li key={c.name} className="imported-item">
                    <span className="imported-name">{c.name}</span>
                    <span className="corpus-badge">{c.items.length}</span>
                    <button
                      type="button"
                      className="btn-text imported-remove"
                      onClick={() => onRemove(c.name)}
                      title="Remove this imported corpus"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
