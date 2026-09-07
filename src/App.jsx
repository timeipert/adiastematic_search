import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Header from './components/Header';
import Controls from './components/Controls';
import ImportCorpus from './components/ImportCorpus';
import ResultsTable from './components/ResultsTable';
import StatsModal from './components/StatsModal';
import { searchCorpus } from './utils/searchEngine';
import { loadImportedCorpora, saveImportedCorpora } from './utils/monodiImport';

export default function App() {
  // Base corpora fetched from search_data.json
  const [baseData, setBaseData] = useState([]);
  // Corpora imported by the user from monodi workspace files (localStorage-backed)
  const [importedCorpora, setImportedCorpora] = useState(() => loadImportedCorpora());
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // The full searchable dataset = base corpora + every imported corpus.
  const corpusData = useMemo(() => {
    const imported = importedCorpora.flatMap((c) => c.items || []);
    return [...baseData, ...imported];
  }, [baseData, importedCorpora]);

  // Corpus options (name + count) derived from the combined dataset.
  const availableCorpora = useMemo(() => {
    const counts = {};
    corpusData.forEach((item) => {
      const src = (item.database_source || 'Unknown').trim();
      counts[src] = (counts[src] || 0) + 1;
    });
    return Object.keys(counts).map((src) => ({ name: src, count: counts[src] }));
  }, [corpusData]);

  // Theme state ('dark' | 'light') — light is the default
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('adiastematic_theme') || 'light';
  });

  // Helper to read initial saved settings
  const savedSettings = useMemo(() => {
    try {
      const saved = localStorage.getItem('adiastematic_user_settings');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  }, []);

  // Search Controls State (with LocalStorage initial fallback)
  const [query, setQuery] = useState(() => savedSettings?.query || 'uddu');
  const [selectedCorpora, setSelectedCorpora] = useState(() => savedSettings?.selectedCorpora || []);
  const [searchMode, setSearchMode] = useState(() => savedSettings?.searchMode || 'exact');
  const [searchLocation, setSearchLocation] = useState(() => savedSettings?.searchLocation || 'Anywhere in the melody');
  const [regionSize, setRegionSize] = useState(() => savedSettings?.regionSize || 25);
  const [fuzzyAlgo, setFuzzyAlgo] = useState(() => savedSettings?.fuzzyAlgo || 'hamming');
  const [fuzzyThreshold, setFuzzyThreshold] = useState(() => savedSettings?.fuzzyThreshold || 80);
  // Syllable-boundary strategy: 'fixed' | 'ignore' | 'loose' (default loose).
  // Legacy setting migration: old boolean ignoreSyllables → true was "ignore"
  // (now superseded by the more capable "loose"), false → "fixed".
  const [syllableMode, setSyllableMode] = useState(() => {
    if (savedSettings?.syllableMode) return savedSettings.syllableMode;
    if (savedSettings?.ignoreSyllables === false) return 'fixed';
    return 'loose';
  });

  // Recent Search History (Last 5 unique searches)
  const [searchHistory, setSearchHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('adiastematic_search_history') || '[]');
    } catch (e) {
      return [];
    }
  });

  // Results & Modal State
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);

  // Sync theme attribute to document element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('adiastematic_theme', theme);
  }, [theme]);

  // Persist all user control settings ONLY AFTER availableCorpora are loaded
  useEffect(() => {
    if (availableCorpora.length === 0) return; // Prevent premature overwrite
    const settings = {
      query,
      selectedCorpora,
      searchMode,
      searchLocation,
      regionSize,
      fuzzyAlgo,
      fuzzyThreshold,
      syllableMode
    };
    localStorage.setItem('adiastematic_user_settings', JSON.stringify(settings));
  }, [availableCorpora, query, selectedCorpora, searchMode, searchLocation, regionSize, fuzzyAlgo, fuzzyThreshold, syllableMode]);

  // Web Worker Instance
  const pcaWorker = useMemo(() => {
    try {
      return new Worker(new URL('./workers/pcaWorker.js', import.meta.url), { type: 'module' });
    } catch (e) {
      console.error('PCA Worker initialization failed:', e);
      return null;
    }
  }, []);

  // Fetch search_data.json
  useEffect(() => {
    setIsLoadingData(true);
    fetch('./search_data.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} - Failed to load search_data.json`);
        return res.json();
      })
      .then((data) => {
        setBaseData(data);
        setIsLoadingData(false);
      })
      .catch((err) => {
        console.error('Data loading error:', err);
        setLoadError(err.message);
        setIsLoadingData(false);
      });
  }, []);

  // Reconcile the selected-corpora choice once, after the base data has loaded:
  // keep the user's saved selection where still valid, otherwise select all.
  const selectionInitialized = useRef(false);
  useEffect(() => {
    if (isLoadingData) return;
    if (selectionInitialized.current) return;
    if (availableCorpora.length === 0) return;
    selectionInitialized.current = true;

    setSelectedCorpora((prevSelected) => {
      if (prevSelected && prevSelected.length > 0) {
        const validSet = new Set(availableCorpora.map((c) => c.name));
        const filtered = prevSelected.filter((name) => validSet.has(name));
        if (filtered.length > 0) return filtered;
      }
      return availableCorpora.map((c) => c.name);
    });
  }, [isLoadingData, availableCorpora]);

  // Import a parsed monodi corpus: persist to localStorage, add to the dataset,
  // and auto-select it. Returns false if localStorage could not be written.
  const handleImportCorpus = useCallback(
    (corpus) => {
      const next = [...importedCorpora.filter((c) => c.name !== corpus.name), corpus];
      const persisted = saveImportedCorpora(next);
      setImportedCorpora(next);
      setSelectedCorpora((prev) =>
        prev.includes(corpus.name) ? prev : [...prev, corpus.name]
      );
      return persisted;
    },
    [importedCorpora]
  );

  const handleRemoveImported = useCallback(
    (name) => {
      const next = importedCorpora.filter((c) => c.name !== name);
      saveImportedCorpora(next);
      setImportedCorpora(next);
      setSelectedCorpora((prev) => prev.filter((n) => n !== name));
    },
    [importedCorpora]
  );

  // Search Action
  const handleSearch = useCallback(() => {
    if (!corpusData || corpusData.length === 0) return;
    setIsSearching(true);

    const trimmed = query.trim();
    if (trimmed) {
      setSearchHistory((prev) => {
        const filtered = prev.filter((h) => h !== trimmed);
        const updated = [trimmed, ...filtered].slice(0, 5); // Keep last 5 unique
        localStorage.setItem('adiastematic_search_history', JSON.stringify(updated));
        return updated;
      });
    }

    setTimeout(() => {
      const res = searchCorpus({
        corpusData,
        query,
        selectedCorpora,
        searchMode,
        searchLocation,
        regionSize,
        fuzzyAlgo,
        fuzzyThreshold,
        syllableMode
      });
      setResults(res);
      setIsSearching(false);
    }, 50);
  }, [
    corpusData,
    query,
    selectedCorpora,
    searchMode,
    searchLocation,
    regionSize,
    fuzzyAlgo,
    fuzzyThreshold,
    syllableMode
  ]);

  // Initial search when data ready
  useEffect(() => {
    if (corpusData.length > 0 && !isLoadingData) {
      const params = new URLSearchParams(window.location.search);
      if (params.has('query')) {
        setQuery(params.get('query') || '');
        if (params.has('corpus')) {
          const cVal = params.get('corpus');
          setSelectedCorpora(cVal.includes(',') ? cVal.split(',') : [cVal]);
        }
        if (params.has('location')) setSearchLocation(params.get('location'));
        if (params.has('mode')) setSearchMode(params.get('mode'));
        if (params.has('region')) setRegionSize(parseInt(params.get('region')));
        if (params.has('algo')) setFuzzyAlgo(params.get('algo'));
        if (params.has('threshold')) setFuzzyThreshold(parseInt(params.get('threshold')));
        if (params.has('syllableMode')) setSyllableMode(params.get('syllableMode'));
      }
      handleSearch();
    }
  }, [corpusData, isLoadingData]);

  // Re-run the search whenever the set of imported corpora changes (import/remove),
  // but only once the base data is ready so we don't fire on the initial mount.
  const importResearchReady = useRef(false);
  useEffect(() => {
    if (isLoadingData) return;
    if (!importResearchReady.current) {
      importResearchReady.current = true; // skip the first (initial-load) run
      return;
    }
    handleSearch();
  }, [importedCorpora, isLoadingData]);

  const handleSelectHistory = (histQuery) => {
    setQuery(histQuery);
    setTimeout(handleSearch, 50);
  };

  const getSearchState = useCallback(() => {
    return {
      query,
      corpus: selectedCorpora,
      location: searchLocation,
      mode: searchMode,
      region: regionSize,
      algo: fuzzyAlgo,
      threshold: fuzzyThreshold,
      syllableMode
    };
  }, [query, selectedCorpora, searchLocation, searchMode, regionSize, fuzzyAlgo, fuzzyThreshold, syllableMode]);

  const setSearchState = useCallback((state) => {
    if (!state) return;
    if (state.query !== undefined) setQuery(state.query);
    if (state.corpus !== undefined) {
      if (Array.isArray(state.corpus)) setSelectedCorpora(state.corpus);
      else if (typeof state.corpus === 'string') {
        if (state.corpus.includes(',')) setSelectedCorpora(state.corpus.split(','));
        else setSelectedCorpora([state.corpus]);
      }
    }
    if (state.location !== undefined) setSearchLocation(state.location);
    if (state.mode !== undefined) setSearchMode(state.mode);
    if (state.region !== undefined) setRegionSize(parseInt(state.region));
    if (state.algo !== undefined) setFuzzyAlgo(state.algo);
    if (state.threshold !== undefined) setFuzzyThreshold(parseInt(state.threshold));
    if (state.syllableMode !== undefined) setSyllableMode(state.syllableMode);
  }, []);

  const handleUpdateSearchState = useCallback((updates, triggerSearch = true) => {
    if (updates.query !== undefined) setQuery(updates.query);
    if (updates.corpus !== undefined) setSelectedCorpora(updates.corpus);
    if (updates.location !== undefined) setSearchLocation(updates.location);
    if (updates.mode !== undefined) setSearchMode(updates.mode);
    if (updates.region !== undefined) setRegionSize(updates.region);
    if (updates.algo !== undefined) setFuzzyAlgo(updates.algo);
    if (updates.threshold !== undefined) setFuzzyThreshold(updates.threshold);
    if (updates.syllableMode !== undefined) setSyllableMode(updates.syllableMode);

    if (triggerSearch) {
      setTimeout(() => {
        handleSearch();
      }, 60);
    }
  }, [handleSearch]);

  const searchState = useMemo(() => ({
    query,
    selectedCorpora,
    searchLocation,
    searchMode,
    regionSize,
    fuzzyAlgo,
    fuzzyThreshold,
    syllableMode
  }), [query, selectedCorpora, searchLocation, searchMode, regionSize, fuzzyAlgo, fuzzyThreshold, syllableMode]);

  return (
    <div>
      <div className="overlay"></div>
      <main className="dashboard">
        <Header theme={theme} setTheme={setTheme} />

        {loadError && (
          <div className="glass-panel empty-state" style={{ color: '#f5365c' }}>
            Error loading the built-in database: {loadError}. Please run `npm run build-data`.
            You can still import and search your own corpora below.
          </div>
        )}

        <>
          <Controls
              query={query}
              setQuery={setQuery}
              availableCorpora={availableCorpora}
              selectedCorpora={selectedCorpora}
              setSelectedCorpora={setSelectedCorpora}
              searchMode={searchMode}
              setSearchMode={setSearchMode}
              searchLocation={searchLocation}
              setSearchLocation={setSearchLocation}
              regionSize={regionSize}
              setRegionSize={setRegionSize}
              fuzzyAlgo={fuzzyAlgo}
              setFuzzyAlgo={setFuzzyAlgo}
              fuzzyThreshold={fuzzyThreshold}
              setFuzzyThreshold={setFuzzyThreshold}
              syllableMode={syllableMode}
              setSyllableMode={setSyllableMode}
              onSearch={handleSearch}
              getSearchState={getSearchState}
              setSearchState={setSearchState}
              searchHistory={searchHistory}
              onSelectHistory={handleSelectHistory}
            />

            <ImportCorpus
              importedCorpora={importedCorpora}
              onImport={handleImportCorpus}
              onRemove={handleRemoveImported}
            />

            <ResultsTable
              results={results}
              isLoading={isLoadingData || isSearching}
              onOpenStats={() => setIsStatsOpen(true)}
              searchState={searchState}
              onUpdateSearchState={handleUpdateSearchState}
              availableCorpora={availableCorpora}
              onSearch={handleSearch}
          />
        </>

        <footer className="site-footer">
          <p>
            Part of the <strong>Corpus Monodicum</strong> infrastructure. Visit the main platform at{' '}
            <a href="https://monodi.app" target="_blank" rel="noopener noreferrer">monodi.app</a>.
          </p>
        </footer>
      </main>

      <StatsModal
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        results={results}
        pcaWorker={pcaWorker}
      />
    </div>
  );
}
