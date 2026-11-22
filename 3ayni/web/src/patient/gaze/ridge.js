// Ridge regression (linear least squares with an L2 penalty), small enough to
// fit in the browser in a few milliseconds. Features are standardised first so
// one penalty strength suits all of them; the intercept is never penalised.

/**
 * @param {number[][]} X  samples x features
 * @param {number[]} y    target per sample
 * @param {number} lambda penalty strength (on standardised features)
 * @returns {{ predict: (features: number[]) => number, weights: number[], mean: number[], scale: number[] }}
 */
export function fitRidge(X, y, lambda = 1) {
  const n = X.length;
  if (n === 0 || n !== y.length) throw new Error('fitRidge: X and y must be non-empty and the same length');
  const d = X[0].length;

  const mean = new Array(d).fill(0);
  const scale = new Array(d).fill(0);
  for (const row of X) row.forEach((v, j) => (mean[j] += v / n));
  for (const row of X) row.forEach((v, j) => (scale[j] += (v - mean[j]) ** 2 / n));
  for (let j = 0; j < d; j++) scale[j] = Math.sqrt(scale[j]) || 1;

  // Design matrix with a leading column of ones for the intercept.
  const Z = X.map((row) => [1, ...row.map((v, j) => (v - mean[j]) / scale[j])]);
  const p = d + 1;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < p; r++) {
      b[r] += Z[i][r] * y[i];
      for (let c = 0; c < p; c++) A[r][c] += Z[i][r] * Z[i][c];
    }
  }
  for (let j = 1; j < p; j++) A[j][j] += lambda;

  const weights = solve(A, b);
  const predict = (features) => {
    let value = weights[0];
    for (let j = 0; j < d; j++) value += weights[j + 1] * ((features[j] - mean[j]) / scale[j]);
    return value;
  };
  return { predict, weights, mean, scale };
}

/** Solves A x = b by Gaussian elimination with partial pivoting. */
export function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) throw new Error('solve: matrix is singular');
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c];
    x[r] = sum / M[r][r];
  }
  return x;
}
