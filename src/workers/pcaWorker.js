// Web Worker for calculating PCA dimensionality reduction on melody contours

self.onmessage = function (e) {
    const results = e.data;
    if (!results || results.length < 3) {
        self.postMessage({ error: 'At least 3 results required for PCA clustering' });
        return;
    }

    try {
        const featureMatrix = extractFeatures(results);
        const pcaPoints = calculatePCA2D(featureMatrix);
        self.postMessage({ points: pcaPoints });
    } catch (err) {
        self.postMessage({ error: err.message });
    }
};

function extractFeatures(results) {
    return results.map(item => {
        const contour = (item.contour || '').replace(/_/g, '');
        const len = contour.length || 1;
        let u = 0, d = 0, r = 0;
        for (let i = 0; i < contour.length; i++) {
            if (contour[i] === 'u') u++;
            else if (contour[i] === 'd') d++;
            else if (contour[i] === 'r') r++;
        }
        const uRatio = u / len;
        const dRatio = d / len;
        const rRatio = r / len;

        const posPct = (item.matchPositionPct || 0) / 100;
        const accuracyPct = (item.accuracy || 100) / 100;

        return [uRatio, dRatio, rRatio, len / 100, posPct, accuracyPct];
    });
}

function calculatePCA2D(matrix) {
    const n = matrix.length;
    const p = matrix[0].length;

    // Mean center
    const means = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < p; j++) {
            means[j] += matrix[i][j];
        }
    }
    for (let j = 0; j < p; j++) means[j] /= n;

    const centered = matrix.map(row => row.map((val, j) => val - means[j]));

    // Covariance matrix
    const cov = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < p; i++) {
        for (let j = 0; j < p; j++) {
            let sum = 0;
            for (let k = 0; k < n; k++) {
                sum += centered[k][i] * centered[k][j];
            }
            cov[i][j] = sum / (n - 1 || 1);
        }
    }

    // Power iteration for 1st Principal Component
    let v1 = new Array(p).fill(1 / Math.sqrt(p));
    for (let iter = 0; iter < 20; iter++) {
        let v1Next = new Array(p).fill(0);
        for (let i = 0; i < p; i++) {
            for (let j = 0; j < p; j++) {
                v1Next[i] += cov[i][j] * v1[j];
            }
        }
        let norm = Math.sqrt(v1Next.reduce((a, b) => a + b * b, 0)) || 1;
        v1 = v1Next.map(x => x / norm);
    }

    // Deflate covariance matrix for 2nd Principal Component
    const covDeflated = Array.from({ length: p }, () => new Array(p).fill(0));
    const lambda1 = v1.reduce((acc, val, i) => acc + val * v1.reduce((sum, v, j) => sum + cov[i][j] * v, 0), 0);
    for (let i = 0; i < p; i++) {
        for (let j = 0; j < p; j++) {
            covDeflated[i][j] = cov[i][j] - lambda1 * v1[i] * v1[j];
        }
    }

    let v2 = new Array(p).fill(1 / Math.sqrt(p));
    for (let iter = 0; iter < 20; iter++) {
        let v2Next = new Array(p).fill(0);
        for (let i = 0; i < p; i++) {
            for (let j = 0; j < p; j++) {
                v2Next[i] += covDeflated[i][j] * v2[j];
            }
        }
        let norm = Math.sqrt(v2Next.reduce((a, b) => a + b * b, 0)) || 1;
        v2 = v2Next.map(x => x / norm);
    }

    // Project points onto PC1 and PC2
    return centered.map(row => {
        const x = row.reduce((acc, val, j) => acc + val * v1[j], 0);
        const y = row.reduce((acc, val, j) => acc + val * v2[j], 0);
        return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
    });
}
