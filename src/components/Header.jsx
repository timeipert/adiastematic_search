import React from 'react';

export default function Header({ theme, setTheme }) {
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">♪</span>
        <div className="brand-text">
          <h1>Adiastematic Search</h1>
          <p className="brand-sub">Search melodic contours across chant corpora</p>
        </div>
      </div>
      <button
        className="theme-toggle"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title="Toggle light / dark theme"
      >
        {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
      </button>
    </header>
  );
}
