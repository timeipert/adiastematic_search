import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';

export default function StatsModal({ isOpen, onClose, results, pcaWorker }) {
  const sourceCanvasRef = useRef(null);
  const genreCanvasRef = useRef(null);
  const positionCanvasRef = useRef(null);
  const pcaCanvasRef = useRef(null);

  const chartInstances = useRef({});
  const [pcaPoints, setPcaPoints] = useState(null);
  const [pcaError, setPcaError] = useState(null);

  useEffect(() => {
    if (!isOpen || !results || results.length === 0) return;

    // Trigger Web Worker PCA calculation
    if (pcaWorker) {
      pcaWorker.onmessage = (e) => {
        if (e.data && e.data.points) {
          setPcaPoints(e.data.points);
          setPcaError(null);
        } else {
          setPcaError(e.data.error || 'PCA clustering failed');
        }
      };
      pcaWorker.postMessage(results);
    }

    // 1. Source Breakdown Chart
    const sourcesMap = {};
    results.forEach((item) => {
      const src = item.database_source || 'Unknown';
      sourcesMap[src] = (sourcesMap[src] || 0) + 1;
    });

    if (sourceCanvasRef.current) {
      if (chartInstances.current.source) chartInstances.current.source.destroy();
      chartInstances.current.source = new Chart(sourceCanvasRef.current, {
        type: 'bar',
        data: {
          labels: Object.keys(sourcesMap),
          datasets: [
            {
              label: 'Melodies by Corpus',
              data: Object.values(sourcesMap),
              backgroundColor: 'rgba(94, 114, 228, 0.6)',
              borderColor: '#5e72e4',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#a0aec0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#a0aec0' }, grid: { color: 'rgba(255,255,255,0.05)' } }
          }
        }
      });
    }

    // 2. Genre Breakdown Chart
    const genreMap = {};
    results.forEach((item) => {
      const g = (item.genre || 'Unspecified').trim();
      if (g) genreMap[g] = (genreMap[g] || 0) + 1;
    });

    if (genreCanvasRef.current) {
      if (chartInstances.current.genre) chartInstances.current.genre.destroy();
      chartInstances.current.genre = new Chart(genreCanvasRef.current, {
        type: 'doughnut',
        data: {
          labels: Object.keys(genreMap).slice(0, 10),
          datasets: [
            {
              data: Object.values(genreMap).slice(0, 10),
              backgroundColor: [
                '#5e72e4', '#2dce89', '#11cdef', '#fb6340', '#f5365c',
                '#8965e0', '#ffd600', '#20c997', '#e056fd', '#686de0'
              ]
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { color: '#a0aec0' } } }
        }
      });
    }

    // 3. Position Distribution Chart
    const posBins = new Array(10).fill(0); // 0-10%, 10-20%, etc.
    results.forEach((item) => {
      const pos = item.matchPositionPct !== undefined ? item.matchPositionPct : 0;
      const bin = Math.min(9, Math.floor(pos / 10));
      posBins[bin]++;
    });

    if (positionCanvasRef.current) {
      if (chartInstances.current.position) chartInstances.current.position.destroy();
      chartInstances.current.position = new Chart(positionCanvasRef.current, {
        type: 'line',
        data: {
          labels: ['0-10%', '10-20%', '20-30%', '30-40%', '40-50%', '50-60%', '60-70%', '70-80%', '80-90%', '90-100%'],
          datasets: [
            {
              label: 'Match Location Frequency',
              data: posBins,
              borderColor: '#2dce89',
              backgroundColor: 'rgba(45, 206, 137, 0.2)',
              fill: true,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: '#a0aec0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#a0aec0' }, grid: { color: 'rgba(255,255,255,0.05)' } }
          }
        }
      });
    }

    return () => {
      Object.values(chartInstances.current).forEach((chart) => chart && chart.destroy());
    };
  }, [isOpen, results]);

  // PCA Scatter Chart
  useEffect(() => {
    if (!isOpen || !pcaPoints || !pcaCanvasRef.current) return;

    if (chartInstances.current.pca) chartInstances.current.pca.destroy();
    chartInstances.current.pca = new Chart(pcaCanvasRef.current, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Melody Contour Clustering (PC1 vs PC2)',
            data: pcaPoints,
            backgroundColor: 'rgba(255, 214, 0, 0.7)',
            borderColor: '#ffd600',
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#a0aec0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#a0aec0' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }, [isOpen, pcaPoints]);

  if (!isOpen) return null;

  return (
    <div className="modal">
      <div className="modal-content glass-panel">
        <span className="close-modal" onClick={onClose}>
          &times;
        </span>
        <h2 className="modal-title">Search Results Statistics</h2>

        <div className="charts-grid">
          <div className="chart-container">
            <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Corpus Source Breakdown</h4>
            <canvas ref={sourceCanvasRef} />
          </div>

          <div className="chart-container">
            <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Genre Distribution</h4>
            <canvas ref={genreCanvasRef} />
          </div>

          <div className="chart-container">
            <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Match Location Distribution</h4>
            <canvas ref={positionCanvasRef} />
          </div>

          <div className="chart-container">
            <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-muted)' }}>PCA Contour Similarity Map</h4>
            {pcaError ? (
              <div style={{ color: '#f5365c', textAlign: 'center', marginTop: '2rem' }}>{pcaError}</div>
            ) : (
              <canvas ref={pcaCanvasRef} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
