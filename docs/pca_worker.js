// Web Worker for calculating Melodic PCA (TF-IDF + PCA)
// This offloads heavy math from the main thread to keep the UI responsive.

self.onmessage = function(e) {
    const docs = e.data;
    if (!docs || docs.length < 3) {
        self.postMessage({ error: 'Not enough results' });
        return;
    }

    const result = calculateMelodicPCA(docs);
    self.postMessage(result);
};

function calculateMelodicPCA(docs) {
    // 1. TF-IDF Vectorization (using trigrams)
    const n = 3;
    let vocab = new Set();
    let docTF = []; // List of maps {trigram: count}
    let df = {}; // trigram: doc_count
    
    docs.forEach(doc => {
        let tf = {};
        for (let i = 0; i <= doc.length - n; i++) {
            const gram = doc.substring(i, i + n);
            tf[gram] = (tf[gram] || 0) + 1;
            vocab.add(gram);
        }
        docTF.push(tf);
        Object.keys(tf).forEach(gram => {
            df[gram] = (df[gram] || 0) + 1;
        });
    });
    
    const vocabList = Array.from(vocab);
    const N = docs.length;
    
    // Create TF-IDF matrix (Docs x Features)
    let matrix = docTF.map(tf => {
        return vocabList.map(gram => {
            const termFreq = tf[gram] || 0;
            const idf = Math.log(N / (df[gram] || 1));
            return termFreq * idf;
        });
    });
    
    if (matrix.length === 0 || matrix[0].length === 0) return null;

    // 2. Simple PCA (find first 2 principal components via Power Iteration)
    const cols = matrix[0].length;
    const means = new Array(cols).fill(0);
    matrix.forEach(row => row.forEach((val, j) => means[j] += val / N));
    const centered = matrix.map(row => row.map((val, j) => val - means[j]));
    
    function getPrincipalComponent(X) {
        let v = new Array(cols).fill(0).map(() => Math.random());
        // Basic normalization
        let mag0 = Math.sqrt(v.reduce((a,b) => a + b*b, 0));
        v = v.map(x => x / (mag0 || 1));

        for (let iter = 0; iter < 15; iter++) {
            let nextV = new Array(cols).fill(0);
            // nextV = X^T * (X * v)
            let Xv = new Array(N).fill(0);
            for(let i=0; i<N; i++) {
                for(let j=0; j<cols; j++) Xv[i] += X[i][j] * v[j];
            }
            for(let j=0; j<cols; j++) {
                for(let i=0; i<N; i++) nextV[j] += X[i][j] * Xv[i];
            }
            // Normalize
            const mag = Math.sqrt(nextV.reduce((a,b) => a + b*b, 0));
            v = nextV.map(x => x / (mag || 1));
        }
        return v;
    }
    
    const pc1 = getPrincipalComponent(centered);
    
    const centeredResidual = centered.map(row => {
        const dot = row.reduce((a, b, j) => a + b * pc1[j], 0);
        return row.map((val, j) => val - dot * pc1[j]);
    });
    const pc2 = getPrincipalComponent(centeredResidual);
    
    const points = centered.map(row => {
        const x = row.reduce((a, b, j) => a + b * pc1[j], 0);
        const y = row.reduce((a, b, j) => a + b * pc2[j], 0);
        return [x, y];
    });
    
    return { points };
}
