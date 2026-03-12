const SEARCH_DATA_URL = 'search_data.json';
let corpusData = [];

// DOM Elements
const queryInput = document.getElementById('query');
const corpusSelect = document.getElementById('corpus_select');
const searchLocation = document.getElementById('search_location');
const regionSize = document.getElementById('region_size');
const regionVal = document.getElementById('region_val');
const ignoreSyllables = document.getElementById('ignore_syllables');
const matchThreshold = document.getElementById('match_threshold'); // Deprecated, but keep for now or remove if confirmed

const fuzzySettings = document.getElementById('fuzzy_settings');
const fuzzyAlgo = document.getElementById('fuzzy_algo');
const fuzzyThreshold = document.getElementById('fuzzy_threshold');
const thresholdVal = document.getElementById('threshold_val');
const algoExplanation = document.getElementById('algo_explanation');

let searchMode = 'exact'; // 'exact' or 'fuzzy'

const ALGO_DESCRIPTIONS = {
    hamming: "<strong>Hamming Distance:</strong> Matches the query character-by-character. Allows mismatches but no insertions or deletions. Best for fixed-length motifs.",
    levenshtein: "<strong>Levenshtein Distance:</strong> Classic edit distance. Allows insertions, deletions, and substitutions. Finds the closest match even if notes are missing or extra notes are present.",
    subsequence: "<strong>Additions Allowed:</strong> Finds the query notes in the correct order, but allows arbitrary 'filler' notes between them. Perfect for finding embellished versions of a motif."
};

const searchBtn = document.getElementById('search_btn');
const resultsContainer = document.getElementById('results_container');
const resultCount = document.getElementById('result_count');
const loader = document.getElementById('loader');
const viewStatsBtn = document.getElementById('view_stats_btn');
const statsModal = document.getElementById('stats_modal');

// Chart Instances
let contourChart, positionChart, genreChart, modeChart;

// Global latest results reference for stats
let latestResults = [];
let pcaWorker = null;
let lastPcaResult = null;
let lastPcaInputHash = null;
let lastStatsHash = null; // Cache for non-PCA charts too

function initPcaWorker() {
    if (window.Worker) {
        pcaWorker = new Worker('pca_worker.js');
        pcaWorker.onmessage = function (e) {
            const pcaData = e.data;
            if (pcaData && pcaData.points) {
                renderPcaChart(pcaData, latestResults);
            } else {
                showPcaError(pcaData.error || 'Similarity analysis failed');
            }
        };
        pcaWorker.onerror = function (err) {
            console.error('PCA Worker Error:', err);
            showPcaError('Similarity analysis crashed');
        };
    }
}
initPcaWorker();

// Initial setup
regionSize.addEventListener('input', (e) => {
    regionVal.textContent = e.target.value + '%';
});

fuzzyThreshold.addEventListener('input', (e) => {
    thresholdVal.textContent = e.target.value + '%';
});

window.setSearchMode = function (mode) {
    searchMode = mode;
    document.getElementById('mode_exact').classList.toggle('active', mode === 'exact');
    document.getElementById('mode_fuzzy').classList.toggle('active', mode === 'fuzzy');

    if (mode === 'fuzzy') {
        fuzzySettings.classList.remove('hidden');
    } else {
        fuzzySettings.classList.add('hidden');
    }
};

window.updateAlgoExplanation = function () {
    const algo = fuzzyAlgo.value;
    algoExplanation.innerHTML = ALGO_DESCRIPTIONS[algo] || "";
};

// Load the JSON data
async function loadData() {
    try {
        loader.classList.remove('hidden');
        resultsContainer.innerHTML = '<div class="empty-state">Loading corpus data...</div>';

        const response = await fetch(SEARCH_DATA_URL);
        corpusData = await response.json();

        resultsContainer.innerHTML = `<div class="empty-state">Loaded ${corpusData.length} melodies. Ready to search.</div>`;
        
        // Initialize other components after data is ready
        renderSavedQueriesList();
        loadFromUrlParams();
    } catch (error) {
        console.error('Error loading data:', error);
        resultsContainer.innerHTML = '<div class="empty-state" style="color: #f56565;">Error loading database. Please ensure build_corpus.py was run.</div>';
    } finally {
        loader.classList.add('hidden');
    }
}

// Preprocess the user's query exactly as Python did
function preprocessQuery(q) {
    let query = q.replace(/\s+/g, ''); // Remove spaces
    query = query.replace(/\[\.\.\.\]/g, '.*'); // Convert [...] to regex skip
    query = query.replace(/\*/g, '.'); // Convert * to single note skip
    query = query.replace(/\[/g, '(').replace(/\]/g, ')'); // Convert options [u|d] to (u|d)
    return query;
}

// Parses a regex-like string into structured tokens for fuzzy matching
function parseQueryToTokens(q) {
    let tokens = [];
    let query = q.replace(/\s+/g, '');
    for (let i = 0; i < query.length; i++) {
        if (query[i] === '[') {
            if (query.substring(i, i + 5) === '[...]') {
                // Return a special token for variable length gaps if we ever want to support them in fuzzy
                tokens.push({ type: 'gap' });
                i += 4;
            } else {
                let end = query.indexOf(']', i);
                if (end !== -1) {
                    let chars = query.substring(i + 1, end).split('|');
                    tokens.push({ type: 'set', chars: chars });
                    i = end;
                } else {
                    tokens.push({ type: 'char', char: query[i] });
                }
            }
        } else if (query[i] === '*') {
            tokens.push({ type: 'skip_one' });
        } else {
            tokens.push({ type: 'char', char: query[i] });
        }
    }
    return tokens;
}

// Levenshtein Distance (using Dynamic Programming)
function levenshteinDistance(s1, s2) {
    const m = s1.length;
    const n = s2.length;
    let dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (s1[i - 1] === s2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
    }
    return dp[m][n];
}

// Subsequence with Additions allowed
// Returns { matched: boolean, accuracy: number, endIdx: number }
function findSubsequenceMatch(queryTokens, target, startIdx, maxAdditions) {
    let tIdx = startIdx;
    let errors = 0;
    let matchedTokens = 0;

    for (let token of queryTokens) {
        let found = false;
        while (tIdx < target.length) {
            const char = target[tIdx];
            let isMatch = false;

            if (token.type === 'char') {
                if (char === token.char) isMatch = true;
            } else if (token.type === 'set') {
                if (token.chars.includes(char)) isMatch = true;
            } else if (token.type === 'skip_one') {
                isMatch = true;
            } else if (token.type === 'gap') {
                // Gap matches everything until we find the next token
                // This is complex for a simple sliding window, let's treat gaps as wildcards for now
                isMatch = true;
            }

            if (isMatch) {
                found = true;
                tIdx++;
                matchedTokens++;
                break;
            } else {
                errors++;
                tIdx++;
                if (errors > maxAdditions) return { matched: false };
            }
        }
        if (!found) return { matched: false };
    }

    const accuracy = Math.round(((queryTokens.length) / (queryTokens.length + errors)) * 100);
    return { matched: true, accuracy, endIdx: tIdx - 1 };
}

// Map contour character index back to original Volpiano string indices
function getVolpianoMatchIndices(volpiano, matchStartInContour, matchLenInContour, searchContour) {
    if (!volpiano || !searchContour) return null;
    const VOLPIANO_ALPHABET = "89abcdefghijklmnopqrstuvw";

    // 1. Extract all note positions
    let notes = [];
    for (let i = 0; i < volpiano.length; i++) {
        if (VOLPIANO_ALPHABET.includes(volpiano[i])) {
            notes.push({ idx: i });
        }
    }

    if (notes.length < 2) return null;

    // 2. Track which interval corresponds to which notes
    let currentNoteIdx = 0;
    let startVolpianoIdx = -1;
    let endVolpianoIdx = -1;

    for (let i = 0; i < searchContour.length; i++) {
        const char = searchContour[i];

        // If this is the start of the match, record the start note
        if (i === matchStartInContour) {
            startVolpianoIdx = notes[currentNoteIdx].idx;
        }

        if (char !== '_') {
            // Character represents the interval from Note[currentNoteIdx] to Note[currentNoteIdx+1]
            if (i === matchStartInContour + matchLenInContour - 1) {
                endVolpianoIdx = notes[currentNoteIdx + 1].idx;
            }
            currentNoteIdx++;
        }

        // Fallback: if we found a start but match is very short or ends on a separator
        if (startVolpianoIdx !== -1 && endVolpianoIdx === -1 && i >= matchStartInContour + matchLenInContour - 1) {
            // Try to find the next available note to close the highlight
            if (currentNoteIdx + 1 < notes.length) {
                endVolpianoIdx = notes[currentNoteIdx + 1].idx;
            } else {
                endVolpianoIdx = notes[notes.length - 1].idx;
            }
        }
    }

    if (startVolpianoIdx !== -1 && endVolpianoIdx !== -1) {
        return { start: startVolpianoIdx, end: endVolpianoIdx };
    }
    return null;
}

// Search execution handled at the bottom of the file
searchBtn.addEventListener('click', () => window.performSearch());

// ENTER key for search
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        const activeEl = document.activeElement;
        // Assuming 'search_query' is the ID for the main search input, and 'save_query_name' is for a modal input
        if (activeEl.id === 'query' || activeEl.id === 'save_query_name') { // Changed 'search_query' to 'query' based on existing DOM element
            performSearch();
        }
    }
});

// Placeholder for renderSavedQueriesList if it exists elsewhere
// function renderSavedQueriesList() { /* ... */ }


function renderResultStats(count, duration) {
    resultCount.textContent = count;
    // We could add duration text next to it if we want
}

// The original renderResults function is replaced by displayResults and applyResultFilters
// function renderResults(results) { ... }

window.applyResultFilters = function (isInitial = false) {
    const filterText = document.getElementById('result_filter') ? document.getElementById('result_filter').value.toLowerCase() : '';
    const sortBy = document.getElementById('sort_by') ? document.getElementById('sort_by').value : 'none';

    let filtered = [...latestResults];

    // 1. Filter
    if (filterText) {
        filtered = filtered.filter(item => {
            const text = (item.initial_text || '').toLowerCase();
            const genre = (item.genre || '').toLowerCase();
            const mode = (item.mode || '').toString();
            const id = (item.uuid || '').toLowerCase();
            return text.includes(filterText) || genre.includes(filterText) || mode.includes(filterText) || id.includes(filterText);
        });
    }

    // 2. Sort
    if (sortBy !== 'none') {
        filtered.sort((a, b) => {
            if (sortBy === 'genre') return (a.genre || '').localeCompare(b.genre || '');
            if (sortBy === 'mode') return (a.mode || 0) - (b.mode || 0);
            if (sortBy === 'position') return (a.match_pct || 0) - (b.match_pct || 0);
            if (sortBy === 'id') return (a.uuid || '').localeCompare(b.uuid || '');
            return 0;
        });
    }

    displayResults(filtered, isInitial);
};

function displayResults(results, isInitial = false) {
    const resultsContainer = document.getElementById('results_container');
    const resultCountEl = document.getElementById('result_count');

    resultsContainer.innerHTML = '';
    resultCountEl.textContent = results.length;
    loader.classList.add('hidden'); // hideLoader()

    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="empty-state">No matches found.</div>';
        viewStatsBtn.classList.add('hidden'); // Added this line as it was in original renderResults
        return;
    }

    // Clear previous chart instances if they exist and are valid Chart.js objects
    // This block was in the original renderResults, moved here for initial display
    if (isInitial) {
        if (window.contourChart && typeof window.contourChart.destroy === 'function') window.contourChart.destroy();
        if (window.positionChart && typeof window.positionChart.destroy === 'function') window.positionChart.destroy();
        if (window.genreChart && typeof window.genreChart.destroy === 'function') window.genreChart.destroy();
        if (window.lengthChartInstance && typeof window.lengthChartInstance.destroy === 'function') window.lengthChartInstance.destroy();
    }

    viewStatsBtn.classList.remove('hidden');

    // If we have cached non-PCA data, we could skip the math, 
    // but the math for these is very fast. The "flashing" is mainly from new Chart() calls.
    // However, let's keep track of hash to decide on PCA.
    // This block was in the original renderResults, moved here for initial display
    if (isInitial) {
        const currentHash = results.length + (results[0] ? results[0].uuid : '') + (results[results.length - 1] ? results[results.length - 1].uuid : '');
        lastStatsHash = currentHash;
    }

    const maxResults = 250;
    const itemsToRender = results.slice(0, maxResults);

    itemsToRender.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.id = `result-${item.originalIndex}`; // Use originalIndex for consistent ID

        // Build metadata dynamically
        let metaHtml = '';
        if (item.uuid) metaHtml += `<div class="meta-item"><span class="meta-label">ID</span><span class="meta-value">${item.uuid}</span></div>`;
        if (item.siglum) metaHtml += `<div class="meta-item"><span class="meta-label">Siglum</span><span class="meta-value">${item.siglum}</span></div>`;
        if (item.related_chant) metaHtml += `<div class="meta-item"><span class="meta-label">Cantus ID</span><span class="meta-value">${item.related_chant}</span></div>`;
        if (item.genre) metaHtml += `<div class="meta-item"><span class="meta-label">Genre</span><span class="meta-value">${item.genre}</span></div>`;
        if (item.mode) metaHtml += `<div class="meta-item"><span class="meta-label">Mode</span><span class="meta-value">${item.mode}</span></div>`;
        metaHtml += `<div class="meta-item"><span class="meta-label">Source</span><span class="meta-value">${item.database_source}</span></div>`;

        let displayVolpiano = item.volpiano || '';
        if (item.match_indices && displayVolpiano) {
            const start = item.match_indices.start;
            const end = item.match_indices.end;
            if (start <= end && end < displayVolpiano.length) {
                displayVolpiano =
                    displayVolpiano.substring(0, start) +
                    '<span class="match-highlight">' +
                    displayVolpiano.substring(start, end + 1) +
                    '</span>' +
                    displayVolpiano.substring(end + 1);
            }
        }

        card.innerHTML = `
            <div class="result-meta">
                ${metaHtml}
            </div>
            ${item.initial_text ? `<div><em>${item.initial_text}</em></div>` : ''}
            <div class="volpiano-container">
                <div class="volpiano-text">${displayVolpiano}</div>
            </div>
            <div class="match-stats">
                Match Position: ~${Math.round(item.match_pct)}% into the melody
                ${item.match_accuracy !== undefined ? ` <span style="margin-left: 15px; color: #48bb78;">Match Accuracy: ${item.match_accuracy}%</span>` : ''}
            </div>
            <div class="result-actions">
                <button class="small-btn" onclick="highlightInMap(${item.originalIndex})">📍 Show in Similarity Map</button>
            </div>
        `;
        resultsContainer.appendChild(card);
    });

    if (results.length > maxResults) {
        const msg = document.createElement('div');
        msg.className = 'empty-state';
        msg.textContent = `Showing the first ${maxResults} of ${results.length} results.`;
        resultsContainer.appendChild(msg);
    }

    // Auto-scroll the match highlights into the center
    setTimeout(() => {
        const highlights = resultsContainer.querySelectorAll('.match-highlight');
        highlights.forEach(h => {
            const container = h.closest('.volpiano-container');
            if (container) {
                const hLeft = h.offsetLeft;
                const hWidth = h.offsetWidth;
                const cWidth = container.offsetWidth;
                container.scrollLeft = hLeft - (cWidth / 2) + (hWidth / 2);
            }
        });
    }, 50);
}

// Statistics Modal Logic
window.openStatsModal = function () {
    statsModal.classList.remove('hidden');
    generateStatistics(latestResults);
};

window.closeStatsModal = function () {
    statsModal.classList.add('hidden');
};

// Builds a Prefix Tree (Trie) from the extracted contour matching substrings
function renderIntervalTree(treeData) {
    const container = document.getElementById('treeContainer');
    container.innerHTML = ''; // Clear old SVG

    // Calculate layout depth and height
    let maxDepth = 0;
    let leafCount = 0;

    function traverse(node, depth) {
        maxDepth = Math.max(maxDepth, depth);
        if (!node.children || node.children.length === 0) {
            leafCount++;
        } else {
            node.children.forEach(c => traverse(c, depth + 1));
        }
    }
    traverse(treeData, 0);

    const width = Math.max(100 + maxDepth * 100, container.clientWidth);
    const height = Math.max(300, leafCount * 30);

    const svg = d3.select("#treeContainer").append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", "translate(40,0)");

    const treeMap = d3.tree().size([height, width - 100]);
    const root = d3.hierarchy(treeData, d => d.children);

    // Find the max count to scale link thickness
    let maxCount = d3.max(root.descendants(), d => d.data.count);
    let edgeScale = d3.scaleLinear().domain([1, maxCount]).range([1, 10]);

    const treeDataMap = treeMap(root);

    // Render Links
    const link = svg.selectAll(".d3-link")
        .data(treeDataMap.descendants().slice(1))
        .enter().append("path")
        .attr("class", "d3-link")
        .attr("d", d => {
            return "M" + d.y + "," + d.x
                + "C" + ((d.y + d.parent.y) / 2) + "," + d.x
                + " " + ((d.y + d.parent.y) / 2) + "," + d.parent.x
                + " " + d.parent.y + "," + d.parent.x;
        })
        .style("stroke-width", d => Math.max(1, edgeScale(d.data.count)));

    // Render Nodes
    const node = svg.selectAll(".d3-node")
        .data(treeDataMap.descendants())
        .enter().append("g")
        .attr("class", d => "d3-node" + (d.children ? " d3-node-internal" : " d3-node-leaf"))
        .attr("transform", d => "translate(" + d.y + "," + d.x + ")");

    node.append("circle")
        .attr("r", 5);

    node.append("text")
        .attr("dy", ".35em")
        .attr("x", d => d.children ? -8 : 8)
        .style("text-anchor", d => d.children ? "end" : "start")
        .text(d => d.data.name);
}
function generateStatistics(results) {
    // Robust Chart.js cleanup using getChart() to stay foolproof
    ['contourChart', 'positionChart', 'genreChart', 'lengthChart', 'pcaChart'].forEach(id => {
        const existingChart = Chart.getChart(id);
        if (existingChart) existingChart.destroy();
    });

    const VOLPIANO_ALPHABET = "89abcdefghijklmnopqrstuvw";
    let datasets = []; // For contour
    let positions = []; // For histogram
    let lengths = []; // For length distrib
    let genres = {}; // For pie

    // For TF-IDF/PCA
    let corpusDocs = [];

    const treeRoot = { name: "*", count: 0, childrenObj: {} };

    // Process Data
    let maxLength = 0;
    results.forEach((item, index) => {
        item.match_pct = parseFloat(item.match_pct);
        positions.push(item.match_pct);

        // Metadata Cleanups
        let g = (item.genre || "").toString().trim();
        g = g.replace(/^Genre:\s*/i, "");
        if (!g || g === "-" || g === "?") g = "Unknown";
        genres[g] = (genres[g] || 0) + 1;

        // Match-Segment Length distribution
        if (item.volpiano && item.match_indices && Object.keys(item.match_indices).length > 0) {
            const matchStr = item.volpiano.substring(item.match_indices.start, item.match_indices.end + 1);
            const notesOnly = matchStr.replace(/[^89abcdefghijklmnopqrstuvw]/g, '');
            lengths.push(notesOnly.length);
        } else {
            lengths.push(0);
        }

        // Prepare Document for TF-IDF (using intervals)
        if (item.contour) {
            corpusDocs.push(item.contour.replace(/_/g, '')); // Pure intervals
        } else {
            corpusDocs.push("");
        }


        // Contour Overlay Extraction
        if (item.volpiano && item.match_indices && Object.keys(item.match_indices).length > 0) {
            const matchStr = item.volpiano.substring(item.match_indices.start, item.match_indices.end + 1);
            let pitches = [];
            // Remove dashes completely to see pure pitch movement
            const cleanStr = matchStr.replace(/-/g, '');
            for (let i = 0; i < cleanStr.length; i++) {
                const code = VOLPIANO_ALPHABET.indexOf(cleanStr[i]);
                if (code !== -1) {
                    pitches.push(code);
                }
            }
            if (pitches.length > 0) {
                // Determine intervals for Tree
                let intervals = [];
                for (let i = 0; i < pitches.length - 1; i++) {
                    // Only process up to 15 nodes deep to avoid canvas explosion
                    if (i >= 15) break;
                    let diff = pitches[i + 1] - pitches[i];
                    let label = diff > 0 ? `+${diff}` : String(diff);
                    intervals.push(label);
                }

                // Add to Trie
                let currNode = treeRoot;
                currNode.count++;
                for (let step of intervals) {
                    if (!currNode.childrenObj[step]) {
                        currNode.childrenObj[step] = { name: step, count: 0, childrenObj: {} };
                    }
                    currNode = currNode.childrenObj[step];
                    currNode.count++;
                }

                // Normalize so every melody starts at 0 to compare contour shapes accurately
                const startPitch = pitches[0];
                const normalizedPitches = pitches.map(p => p - startPitch);

                // Cap the individual charted lengths to max 50 notes, to avoid extreme stretching from [...] wildcards
                const cappedPitches = normalizedPitches.slice(0, 50);
                maxLength = Math.max(maxLength, cappedPitches.length);

                // Only plot up to 50 lines to prevent canvas performance crush on huge queries
                if (datasets.length < 50) {
                    datasets.push({
                        label: item.uuid || `Match ${index}`,
                        data: cappedPitches,
                        borderColor: 'rgba(94, 114, 228, 0.15)', // Light accent color
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0, // hide dots
                        tension: 0.1
                    });
                }
            }
        }
    });

    // Helper to format Obj Trie into Array Trie for D3
    function convertTrieToArray(node) {
        let keys = Object.keys(node.childrenObj);
        if (keys.length > 0) {
            node.children = [];
            for (let k of keys) {
                node.children.push(convertTrieToArray(node.childrenObj[k]));
            }
            // Sort children by count descending so thicker branches are on top
            node.children.sort((a, b) => b.count - a.count);
        }
        delete node.childrenObj;
        return node;
    }
    const finalTreeData = convertTrieToArray(treeRoot);
    if (finalTreeData.children && finalTreeData.children.length > 0) {
        renderIntervalTree(finalTreeData);
    } else {
        document.getElementById('treeContainer').innerHTML = '<div class="empty-state">No intervals extracted for tree.</div>';
    }

    const contourCtx = document.getElementById('contourChart').getContext('2d');
    const labels = Array.from({ length: maxLength }, (_, i) => `Note ${i + 1}`);
    window.contourChart = new Chart(contourCtx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    title: { display: true, text: 'Relative Pitch Interval', color: '#a0aec0' },
                    ticks: { color: '#a0aec0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                x: {
                    ticks: { color: '#a0aec0', maxTicksLimit: 10 },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });

    // --- 2. Position Strip (Scatter Matrix) ---
    const positionCtx = document.getElementById('positionChart').getContext('2d');

    // Create scatter points exactly at the match percentage
    let scatterData = positions.map(p => ({ x: p, y: 0 }));

    window.positionChart = new Chart(positionCtx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Matches',
                data: scatterData,
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                borderColor: 'rgba(255, 99, 132, 0.8)',
                borderWidth: 2,
                pointStyle: 'line',
                rotation: 90, // vertical line
                radius: 25,   // 50px tall vertical bar
                hoverRadius: 30
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Match at ~${Math.round(ctx.parsed.x)}%`
                    }
                }
            },
            scales: {
                y: {
                    display: false,
                    min: -1,
                    max: 1
                },
                x: {
                    title: { display: true, text: 'Position in Melody (%)', color: '#a0aec0' },
                    min: 0,
                    max: 100,
                    ticks: { color: '#a0aec0', stepSize: 10 },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                }
            }
        }
    });

    // --- 3. Metadata Pie Charts ---
    // Helper to filter top N and group rest to "Other"
    const processTopN = (dataObj, limit) => {
        let entries = Object.entries(dataObj).sort((a, b) => b[1] - a[1]);
        if (entries.length <= limit) return dataObj;

        let result = {};
        let otherCount = 0;
        entries.forEach((entry, i) => {
            if (i < limit) {
                result[entry[0]] = entry[1];
            } else {
                otherCount += entry[1];
            }
        });
        if (otherCount > 0) result["Other"] = otherCount;
        return result;
    };

    genres = processTopN(genres, 8);
    const generateColors = (count) => {
        const colors = [
            'rgba(94, 114, 228, 0.7)',
            'rgba(45, 206, 137, 0.7)',
            'rgba(17, 205, 239, 0.7)',
            'rgba(251, 99, 64, 0.7)',
            'rgba(245, 54, 92, 0.7)',
            'rgba(137, 101, 224, 0.7)'
        ];
        while (colors.length < count) {
            colors.push(`hsla(${Math.random() * 360}, 70%, 60%, 0.7)`);
        }
        return colors;
    };

    const genreCtx = document.getElementById('genreChart').getContext('2d');
    const genreData = processTopN(genres, 8);
    window.genreChart = new Chart(genreCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(genreData),
            datasets: [{
                data: Object.values(genreData),
                backgroundColor: [
                    '#5e72e4', '#2dce89', '#11cdef', '#fb6340', '#f5365c',
                    '#fbcf33', '#8965e0', '#ced4da'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: '#a0aec0' } } }
        }
    });

    // --- 4. Length Distribution ---
    const lengthCtx = document.getElementById('lengthChart').getContext('2d');
    const lengthBins = {};
    lengths.forEach(l => {
        const binSize = 5; // More granular bins
        const bin = Math.floor(l / binSize) * binSize;
        const label = `${bin}-${bin + (binSize - 1)}`;
        lengthBins[label] = (lengthBins[label] || 0) + 1;
    });

    // Sort labels numerically
    const sortedLengthLabels = Object.keys(lengthBins).sort((a, b) => parseInt(a) - parseInt(b));

    window.lengthChartInstance = new Chart(lengthCtx, {
        type: 'bar',
        data: {
            labels: sortedLengthLabels,
            datasets: [{
                label: 'Result Count',
                data: sortedLengthLabels.map(l => lengthBins[l]),
                backgroundColor: 'rgba(17, 205, 239, 0.5)',
                borderColor: '#11cdef',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { ticks: { color: '#a0aec0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#a0aec0' }, grid: { display: false } }
            }
        }
    });

    // --- 5. Melodic Similarity (PCA) ---
    // CACHING LOGIC: Check if results have changed
    const currentResultsHash = results.length + (results[0] ? results[0].uuid : '') + (results[results.length - 1] ? results[results.length - 1].uuid : '');

    if (corpusDocs.length > 2 && pcaWorker) {
        if (lastPcaResult && lastPcaInputHash === currentResultsHash) {
            console.log("Using cached PCA result");
            renderPcaChart(lastPcaResult, latestResults);
        } else {
            lastPcaInputHash = currentResultsHash;
            showPcaLoading();
            pcaWorker.postMessage(corpusDocs);
        }
    } else if (!pcaWorker) {
        showPcaError("Web Workers not supported in this browser.");
    } else {
        showPcaError("Not enough results for similarity analysis.");
    }
}

function showPcaLoading() {
    const container = document.getElementById('pcaChart').parentElement;
    // Don't clear EVERYTHING, just show a small overlay if possible, 
    // but for now let's just update the caption or show a spinner
    const existingLoader = document.getElementById('pca-loader');
    if (!existingLoader) {
        const loader = document.createElement('div');
        loader.id = 'pca-loader';
        loader.className = 'empty-state';
        loader.innerHTML = '<div class="loader" style="margin: 0 auto 10px;"></div>Calculating melodic similarity...';
        container.appendChild(loader);
    }
    if (window.pcaChartInstance) window.pcaChartInstance.destroy();
}

function showPcaError(msg) {
    const loader = document.getElementById('pca-loader');
    if (loader) loader.remove();
    document.getElementById('pcaChart').parentElement.innerHTML = `<canvas id="pcaChart"></canvas><div class="empty-state">${msg}</div>`;
}

function renderPcaChart(pcaData, results) {
    lastPcaResult = pcaData;
    const loader = document.getElementById('pca-loader');
    if (loader) loader.remove();

    const canvas = document.getElementById('pcaChart');
    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    const pcaCtx = canvas.getContext('2d');
    window.pcaChartInstance = new Chart(pcaCtx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Melodies',
                data: pcaData.points.map((p, i) => {
                    const item = results[i];
                    const siglum = item.siglum ? ` [${item.siglum}]` : '';
                    const genre = item.genre || 'Unknown Genre';
                    const mode = item.mode ? ` (Mode ${item.mode})` : '';
                    const incipit = item.initial_text ? (item.initial_text.length > 25 ? item.initial_text.substring(0, 25) + '...' : item.initial_text) : '';

                    const label = `${genre}${mode}${siglum}${incipit ? ' - ' + incipit : ''}`;
                    return {
                        x: p[0],
                        y: p[1],
                        label: label || `Result ${i + 1}`,
                        index: i
                    };
                }),
                backgroundColor: 'rgba(94, 114, 228, 0.6)',
                borderColor: '#5e72e4',
                radius: 6,
                hoverRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const originalIndex = window.pcaChartInstance.data.datasets[0].data[elements[0].index].index;
                    const resultId = `result-${originalIndex}`;
                    closeStatsModal();

                    // If results are filtered, the card might not be visible. 
                    // Let's clear filter if it's missing.
                    let element = document.getElementById(resultId);
                    if (!element) {
                        document.getElementById('result_filter').value = '';
                        applyResultFilters();
                        element = document.getElementById(resultId);
                    }
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.classList.add('jump-highlight');
                        setTimeout(() => element.classList.remove('jump-highlight'), 2000);
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ctx.raw.label
                    }
                }
            },
            scales: {
                x: { display: false },
                y: { display: false }
            }
        }
    });
}


window.performSearch = function() {
    if (!corpusData || corpusData.length === 0) {
        resultsContainer.innerHTML = '<div class="empty-state">Database not loaded. Please wait...</div>';
        return;
    }

    resultsContainer.innerHTML = '<div class="empty-state">Searching...</div>';

    // Allow UI to update before blocking main thread with search
    setTimeout(() => {
        const startTime = performance.now();
        const raw_query = queryInput.value.toLowerCase().trim();
        const processed_pattern = preprocessQuery(raw_query);
        const corpus_sel = corpusSelect.value;
        const sel_loc = searchLocation.value;
        const r_size = parseInt(regionSize.value);
        const ignore_syl = ignoreSyllables.checked;

        // Advanced Fuzzy state
        const threshold = (searchMode === 'exact') ? 100 : parseInt(fuzzyThreshold.value);
        const algo = fuzzyAlgo.value;

        let regex;
        let tokens = [];

        try {
            if (searchMode === 'exact') {
                regex = new RegExp(processed_pattern, 'g');
            } else {
                tokens = parseQueryToTokens(raw_query);
                if (tokens.length === 0) throw new Error("Please enter a query.");
            }
        } catch (e) {
            resultsContainer.innerHTML = `<div class="empty-state" style="color: #f56565;">Invalid Query Syntax: ${e.message}</div>`;
            loader.classList.add('hidden');
            return;
        }

        // Determine Start and End percentages
        let start_pct = 0;
        let end_pct = 100;
        if (sel_loc === "Only in the Beginning (Incipit)") {
            end_pct = r_size;
        } else if (sel_loc === "Only in the End (Coda)") {
            start_pct = 100 - r_size;
        }

        const results = [];
        let i = 0;
        for (i = 0; i < corpusData.length; i++) {
            const item = corpusData[i];

            // Database filter
            // Database filter - accommodate both exact match and cumulative
            if (corpus_sel !== "Cumulative (Both)") {
                // Ensure we handle potential whitespace or slight variations
                const source = (item.database_source || "").trim();
                if (source !== corpus_sel) continue;
            }

            // Generate search contour
            let search_contour = item.contour || "";
            if (ignore_syl) {
                search_contour = search_contour.replace(/_/g, "");
            }

            if (!search_contour) continue;

            // Execute Search
            let matched = false;
            let firstMatchPct = -1;
            let firstMatchIndices = null;
            let bestAccuracy = 0;
            const totalLen = Math.max(1, search_contour.length);

            if (searchMode === 'exact') {
                // Exact Regex Match
                regex.lastIndex = 0;
                let match;
                while ((match = regex.exec(search_contour)) !== null) {
                    const match_start_pct = (match.index / totalLen) * 100;
                    const match_end_pct = ((match.index + match[0].length) / totalLen) * 100;

                    if (match_start_pct >= start_pct && match_end_pct <= end_pct) {
                        matched = true;
                        firstMatchPct = match_start_pct;

                        const matchIndices = getVolpianoMatchIndices(item.volpiano, match.index, match[0].length, search_contour);
                        if (matchIndices) {
                            firstMatchIndices = matchIndices;
                        }
                        break;
                    }
                    if (match.index === regex.lastIndex) regex.lastIndex++;
                }
            } else {
                // --- ADVANCED FUZZY LOGIC ---
                const qLen = tokens.length;
                const minAccuracy = threshold / 100.0;

                if (algo === 'hamming') {
                    const wLen = qLen;
                    const maxAllowedErrors = Math.floor(wLen * (1 - minAccuracy));
                    for (let j = 0; j <= search_contour.length - wLen; j++) {
                        const m_start_pct = (j / totalLen) * 100;
                        const m_end_pct = ((j + wLen) / totalLen) * 100;
                        if (m_start_pct < start_pct || m_end_pct > end_pct) continue;

                        let errors = 0;
                        for (let t = 0; t < wLen; t++) {
                            const tok = tokens[t];
                            const char = search_contour[j + t];
                            if (tok.type === 'char' && char !== tok.char) errors++;
                            else if (tok.type === 'set' && !tok.chars.includes(char)) errors++;
                            if (errors > maxAllowedErrors) break;
                        }
                        if (errors <= maxAllowedErrors) {
                            matched = true;
                            firstMatchPct = m_start_pct;
                            bestAccuracy = Math.round(((wLen - errors) / wLen) * 100);
                            firstMatchIndices = getVolpianoMatchIndices(item.volpiano, j, wLen, search_contour);
                            break;
                        }
                    }
                } else if (algo === 'levenshtein') {
                    // Sliding Levenshtein: look in windows of query length +/- edit budget
                    const editBudget = Math.floor(qLen * (1 - minAccuracy)) + 1;
                    const queryStr = raw_query.replace(/\s+/g, ''); // Simplification: Levenshtein on raw chars

                    for (let j = 0; j < search_contour.length; j++) {
                        const m_start_pct = (j / totalLen) * 100;
                        if (m_start_pct < start_pct) continue;
                        if (m_start_pct > end_pct) break;

                        // Check various window sizes
                        for (let wl = Math.max(1, qLen - editBudget); wl <= qLen + editBudget; wl++) {
                            if (j + wl > search_contour.length) break;
                            const m_end_pct = ((j + wl) / totalLen) * 100;
                            if (m_end_pct > end_pct) continue;

                            const sub = search_contour.substring(j, j + wl);
                            const dist = levenshteinDistance(queryStr, sub);
                            const acc = Math.round(((Math.max(qLen, wl) - dist) / Math.max(qLen, wl)) * 100);

                            if (acc >= threshold) {
                                if (!matched || acc > bestAccuracy) {
                                    matched = true;
                                    firstMatchPct = m_start_pct;
                                    bestAccuracy = acc;
                                    firstMatchIndices = getVolpianoMatchIndices(item.volpiano, j, wl, search_contour);
                                }
                            }
                        }
                        if (matched && threshold >= 90) break; // Greedy break for high threshold
                    }
                } else if (algo === 'subsequence') {
                    // Find query characters in order, allowing gaps
                    const maxAdditions = Math.floor(qLen * 2); // Allow up to 2x query length in additions
                    for (let j = 0; j < search_contour.length; j++) {
                        const m_start_pct = (j / totalLen) * 100;
                        if (m_start_pct < start_pct) continue;
                        if (m_start_pct > end_pct) break;

                        const match = findSubsequenceMatch(tokens, search_contour, j, maxAdditions);
                        if (match.matched) {
                            const m_end_pct = ((match.endIdx + 1) / totalLen) * 100;
                            if (m_end_pct <= end_pct && match.accuracy >= threshold) {
                                if (!matched || match.accuracy > bestAccuracy) {
                                    matched = true;
                                    firstMatchPct = m_start_pct;
                                    bestAccuracy = match.accuracy;
                                    firstMatchIndices = getVolpianoMatchIndices(item.volpiano, j, match.endIdx - j + 1, search_contour);
                                }
                            }
                        }
                    }
                }
            }

            if (matched) {
                let resObj = { ...item, match_pct: firstMatchPct, match_indices: firstMatchIndices, originalIndex: i };
                if (threshold < 100) {
                    resObj.match_accuracy = bestAccuracy;
                }
                results.push(resObj);
            }
        }

        const duration = performance.now() - startTime;
        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    No matches found for "${raw_query}".<br>
                    <small style="color: var(--text-muted); display: block; margin-top: 10px;">
                        Checked ${i} melodies in ${corpus_sel}.<br>
                        Wait, did you mean to search for an exact melody segment or a contour (u, d, r)?
                    </small>
                </div>`;
            viewStatsBtn.classList.add('hidden');
        } else {
            latestResults = results;
            applyResultFilters(true); // first render
            generateStatistics(latestResults);
        }
        loader.classList.add('hidden');

    }, 10);
};

// --- Navigation Helpers ---

window.highlightInMap = function (index) {
    if (!latestResults.length) return;
    openStatsModal();
    // Use timeout to ensure modal is open and chart might need a moment to be ready if recalculating
    const checkChart = () => {
        if (window.pcaChartInstance) {
            // Find the data point that has the original index
            const dataset = window.pcaChartInstance.data.datasets[0];
            const dataIndex = dataset.data.findIndex(d => d.index === index);

            if (dataIndex !== -1) {
                // We use Chart.js built-in tooltip trigger or active elements
                const meta = window.pcaChartInstance.getDatasetMeta(0);
                const point = meta.data[dataIndex];

                // Set as active and show tooltip
                window.pcaChartInstance.setActiveElements([{
                    datasetIndex: 0,
                    index: dataIndex
                }]);
                window.pcaChartInstance.tooltip.setActiveElements([{
                    datasetIndex: 0,
                    index: dataIndex
                }], {
                    x: point.x,
                    y: point.y
                });
                window.pcaChartInstance.update();
            }
        } else {
            setTimeout(checkChart, 100);
        }
    };
    checkChart();
};

// --- Query Management (Save/Load/Share) ---

function getSearchState() {
    return {
        query: queryInput.value,
        corpus: corpusSelect.value,
        location: searchLocation.value,
        mode: searchMode,
        region: regionSize.value,
        algo: fuzzyAlgo.value,
        threshold: fuzzyThreshold.value,
        ignoreSyllables: ignoreSyllables.checked
    };
}

function setSearchState(state) {
    if (!state) return;
    queryInput.value = state.query || '';
    corpusSelect.value = state.corpus || 'Cumulative (Both)';
    searchLocation.value = state.location || 'Anywhere in the melody';
    setSearchMode(state.mode || 'exact');
    regionSize.value = state.region || 25;
    regionVal.textContent = regionSize.value + '%';
    fuzzyAlgo.value = state.algo || 'hamming';
    fuzzyThreshold.value = state.threshold || 80;
    thresholdVal.textContent = fuzzyThreshold.value + '%';
    ignoreSyllables.checked = state.ignoreSyllables !== undefined ? state.ignoreSyllables : true;
    updateAlgoExplanation();
}

window.saveCurrentQuery = function () {
    const nameInput = document.getElementById('save_query_name');
    const name = nameInput.value.trim();
    if (!name) {
        alert("Please enter a name for the query.");
        nameInput.focus();
        return;
    }

    let saved = JSON.parse(localStorage.getItem('adiastematic_queries') || '{}');
    saved[name] = getSearchState();
    localStorage.setItem('adiastematic_queries', JSON.stringify(saved));
    nameInput.value = '';
    renderSavedQueriesList();
};

window.loadSavedQuery = function (name) {
    if (!name) return;
    let saved = JSON.parse(localStorage.getItem('adiastematic_queries') || '{}');
    if (saved[name]) {
        setSearchState(saved[name]);
        performSearch();
    }
};

window.deleteSelectedQuery = function () {
    const list = document.getElementById('saved_queries_list');
    const name = list.value;
    if (!name) {
        alert("Please select a query to delete.");
        return;
    }

    if (confirm(`Are you sure you want to delete "${name}"?`)) {
        let saved = JSON.parse(localStorage.getItem('adiastematic_queries') || '{}');
        delete saved[name];
        localStorage.setItem('adiastematic_queries', JSON.stringify(saved));
        renderSavedQueriesList();
    }
};

function renderSavedQueriesList() {
    const list = document.getElementById('saved_queries_list');
    let saved = JSON.parse(localStorage.getItem('adiastematic_queries') || '{}');

    // Clear but keep first
    list.innerHTML = '<option value="" disabled selected>Load Saved...</option>';

    Object.keys(saved).sort().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        list.appendChild(opt);
    });
}

window.copyShareLink = function () {
    const state = getSearchState();
    const params = new URLSearchParams();
    Object.keys(state).forEach(key => params.set(key, state[key]));

    const url = window.location.origin + window.location.pathname + '?' + params.toString();
    navigator.clipboard.writeText(url).then(() => {
        alert("Share link copied to clipboard!");
    });
};

function loadFromUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('query')) {
        const state = {
            query: params.get('query'),
            corpus: params.get('corpus'),
            location: params.get('location'),
            mode: params.get('mode'),
            region: params.get('region'),
            algo: params.get('algo'),
            threshold: params.get('threshold'),
            ignoreSyllables: params.get('ignoreSyllables') === 'true'
        };
        setSearchState(state);
        setTimeout(performSearch, 500); // Wait for data to be ready
    }
}

// Kickoff
loadData();
