import React from 'react';

export default function ResultCard({ item }) {
  const title = item.initial_text || item.melodyname_standardized || item.uuid || 'Melody Record';
  const source = item.database_source || 'Unknown';
  const volpiano = item.volpiano || '';
  const contour = item.contour || '';
  const matchPositionPct = item.matchPositionPct !== undefined ? item.matchPositionPct : -1;
  const matchIndices = item.matchIndices;

  const renderContour = () => {
    if (!matchIndices) return contour;
    const { start, end } = matchIndices;
    if (start < 0 || end > contour.length) return contour;

    const before = contour.substring(0, start);
    const match = contour.substring(start, end);
    const after = contour.substring(end);

    return (
      <>
        {before}
        <span className="highlight">{match}</span>
        {after}
      </>
    );
  };

  return (
    <div className="result-card">
      <div className="card-header">
        <h3>{title}</h3>
        <span className="badge">{source}</span>
      </div>

      <div className="card-meta">
        {item.siglum && <span><strong>Siglum/Page:</strong> {item.siglum}</span>}
        {item.genre && <span><strong>Genre:</strong> {item.genre}</span>}
        {item.mode && <span><strong>Mode:</strong> {item.mode}</span>}
        {item.editor && <span><strong>Notes/Editor:</strong> {item.editor}</span>}
        {matchPositionPct >= 0 && <span><strong>Position:</strong> {matchPositionPct}%</span>}
        {item.accuracy !== undefined && item.accuracy < 100 && (
          <span><strong>Similarity:</strong> {item.accuracy}%</span>
        )}
      </div>

      {volpiano && (
        <div className="volpiano-display" title={volpiano}>
          {volpiano}
        </div>
      )}

      {contour && (
        <div className="contour-display">
          <strong>Contour: </strong>
          {renderContour()}
        </div>
      )}
    </div>
  );
}
