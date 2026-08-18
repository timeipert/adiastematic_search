import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Header from './components/Header';
import Controls from './components/Controls';
import ResultsTable from './components/ResultsTable';
import StatsModal from './components/StatsModal';
import { searchCorpus } from './utils/searchEngine';

export default function App() {
  const [corpusData, setCorpusData] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState(null);

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
  const [availableCorpora, setAvailableCorpora] = useState([]);
  const [selectedCorpora, setSelectedCorpora] = useState(() => savedSettings?.selectedCorpora || []);
  const [searchMode, setSearchMode] = useState(() => savedSettings?.searchMode || 'exact');
  const [searchLocation, setSearchLocation] = useState(() => savedSettings?.searchLocation || 'Anywhere in the melody');
  const [regionSize, setRegionSize] = useState(() => savedSettings?.regionSize || 25);
  const [fuzzyAlgo, setFuzzyAlgo] = useState(() => savedSettings?.fuzzyAlgo || 'hamming');
  const [fuzzyThreshold, setFuzzyThreshold] = useState(() => savedSettings?.fuzzyThreshold || 80);
  const [ignoreSyllables, setIgnoreSyllables] = useState(() => savedSettings?.ignoreSyllables !== undefined ? savedSettings.ignoreSyllables : true);

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
      ignoreSyllables
    };
    localStorage.setItem('adiastematic_user_settings', JSON.stringify(settings));
  }, [availableCorpora, query, selectedCorpora, searchMode, searchLocation, regionSize, fuzzyAlgo, fuzzyThreshold, ignoreSyllables]);

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
        setCorpusData(data);
        setIsLoadingData(false);

        // Extract corpora options
        const countsMap = {};
        data.forEach((item) => {
          const src = (item.database_source || 'Unknown').trim();
          countsMap[src] = (countsMap[src] || 0) + 1;
        });

        const corpora = Object.keys(countsMap).map((src) => ({
          name: src,
          count: countsMap[src]
        }));

        setAvailableCorpora(corpora);

        // Set selectedCorpora: if savedSettings existed and has valid choices, keep them; else default to all
        setSelectedCorpora((prevSelected) => {
          if (prevSelected && prevSelected.length > 0) {
            const validSet = new Set(corpora.map((c) => c.name));
            const filtered = prevSelected.filter((name) => validSet.has(name));
            if (filtered.length > 0) return filtered;
          }
          return corpora.map((c) => c.name);
        });
      })
      .catch((err) => {
        console.error('Data loading error:', err);
        setLoadError(err.message);
        setIsLoadingData(false);
      });
  }, []);

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
        ignoreSyllables
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
    ignoreSyllables
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
        if (params.has('ignoreSyllables')) setIgnoreSyllables(params.get('ignoreSyllables') === 'true');
      }
      handleSearch();
    }
  }, [corpusData, isLoadingData]);

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
      ignoreSyllables
    };
  }, [query, selectedCorpora, searchLocation, searchMode, regionSize, fuzzyAlgo, fuzzyThreshold, ignoreSyllables]);

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
    if (state.ignoreSyllables !== undefined) setIgnoreSyllables(state.ignoreSyllables);
  }, []);

  const handleUpdateSearchState = useCallback((updates, triggerSearch = true) => {
    if (updates.query !== undefined) setQuery(updates.query);
    if (updates.corpus !== undefined) setSelectedCorpora(updates.corpus);
    if (updates.location !== undefined) setSearchLocation(updates.location);
    if (updates.mode !== undefined) setSearchMode(updates.mode);
    if (updates.region !== undefined) setRegionSize(updates.region);
    if (updates.algo !== undefined) setFuzzyAlgo(updates.algo);
    if (updates.threshold !== undefined) setFuzzyThreshold(updates.threshold);
    if (updates.ignoreSyllables !== undefined) setIgnoreSyllables(updates.ignoreSyllables);

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
    ignoreSyllables
  }), [query, selectedCorpora, searchLocation, searchMode, regionSize, fuzzyAlgo, fuzzyThreshold, ignoreSyllables]);

  return (
    <div>
      <div className="overlay"></div>
      <main className="dashboard">
        <Header theme={theme} setTheme={setTheme} />

        {loadError ? (
          <div className="glass-panel empty-state" style={{ color: '#f5365c' }}>
            Error loading database: {loadError}. Please run `npm run build-data`.
          </div>
        ) : (
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
              ignoreSyllables={ignoreSyllables}
              setIgnoreSyllables={setIgnoreSyllables}
              onSearch={handleSearch}
              getSearchState={getSearchState}
              setSearchState={setSearchState}
              searchHistory={searchHistory}
              onSelectHistory={handleSelectHistory}
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
        )}
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
