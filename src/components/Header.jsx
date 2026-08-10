import React from 'react';

export default function Header({ theme, setTheme }) {
  return (
    <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ flex: 1 }}></div>
      <h1 style={{ flex: 2, textAlign: 'center' }}>Adiastematic Search</h1>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="secondary-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="Toggle Dark/Light Theme"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
        >
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>
    </header>
  );
}
