/**
 * @param {string} expression
 * @param {string} command
 * @param {(value: string) => string} replacer
 * @returns {string}
 */
function replaceLatexGroups(expression, command, replacer) {
  const pattern = new RegExp(`\\\\${command}\\s*\\{([^{}]*)\\}`, 'g');
  let previous;
  do {
    previous = expression;
    expression = expression.replace(pattern, (_, value) => replacer(value));
  } while (expression !== previous);
  return expression;
}

/**
 * @param {string} expression
 * @returns {string}
 */
function replaceLatexFractions(expression) {
  const pattern = /\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g;
  let previous;
  do {
    previous = expression;
    expression = expression.replace(pattern, '(($1)/($2))');
  } while (expression !== previous);
  return expression;
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeExpression(raw) {
  let expression = raw
    .trim()
    .replace(/\$|\\\[|\\\]|\\\(|\\\)/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\(?:times|cdot|ast)/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\pm/g, '+')
    .replace(/\\pi/g, 'Math.PI')
    .replace(/\\ln/g, 'ln')
    .replace(/\\log/g, 'log')
    .replace(/π/g, 'Math.PI')
    .replace(/[×x]/g, '*')
    .replace(/÷/g, '/');

  expression = replaceLatexFractions(expression);
  expression = replaceLatexGroups(expression, 'sqrt', (value) => `Math.sqrt(${value})`);
  expression = replaceLatexFractions(expression);
  expression = expression
    .replace(/√\s*\(([^()]*)\)/g, 'Math.sqrt($1)')
    .replace(/√\s*([\d.]+)/g, 'Math.sqrt($1)')
    .replace(/\bpi\b/gi, 'Math.PI')
    .replace(/\be\b/g, 'Math.E')
    .replace(/(?<![\w.])ln\s*\(/gi, 'Math.log(')
    .replace(/(?<![\w.])log\s*\(/gi, 'Math.log10(')
    .replace(/(?<![\w.])sqrt\s*\(/gi, 'Math.sqrt(')
    .replace(
      /(?<![\w.])(sin|cos|tan|asin|acos|atan|abs|exp)\s*\(/gi,
      (_, name) => `Math.${name.toLowerCase()}(`,
    )
    .replace(/\^\s*\{([^{}]+)\}/g, '**($1)')
    .replace(/\^/g, '**')
    .replace(/[{}]/g, (character) => (character === '{' ? '(' : ')'))
    .replace(/(\d|\))(?=Math\.(?:PI|E|sqrt|log|log10|sin|cos|tan|asin|acos|atan|abs|exp))/g, '$1*')
    .replace(/(?<![A-Za-z0-9])(\d+|\))(?=\()/g, '$1*')
    .replace(/(Math\.(?:PI|E)|\))(?=\d|Math\.|\()/g, '$1*')
    .replace(/\s+/g, '');
  return expression;
}

/**
 * @param {string} raw
 * @param {{angleMode?: 'RAD' | 'DEG'}} [options]
 * @returns {string}
 */
export function calculateExpression(raw, { angleMode = 'RAD' } = {}) {
  const expression = normalizeExpression(raw);
  if (!expression) throw new Error('Enter an expression first.');
  if (
    /[a-zA-Z\\]/.test(
      expression.replace(/Math\.(?:PI|E|sqrt|log|log10|sin|cos|tan|asin|acos|atan|abs|exp)/g, ''),
    )
  ) {
    throw new Error('This calculator supports numeric LaTeX expressions, not variables yet.');
  }
  if (!/^[\d+\-*/().,MathPIEsqrtlogincotaabexp]+$/.test(expression)) {
    throw new Error('Use supported scientific functions, numbers, and operators only.');
  }
  const evaluatedExpression =
    angleMode === 'DEG'
      ? expression.replace(/Math\.(sin|cos|tan)\s*\(([^()]*)\)/g, 'Math.$1((($2)*Math.PI)/180)')
      : expression;
  /** @type {unknown} */
  let result;
  try {
    result = Function(`"use strict"; return (${evaluatedExpression})`)();
  } catch {
    throw new Error('That expression could not be parsed. Check its grouping.');
  }
  if (typeof result !== 'number' || !Number.isFinite(result))
    throw new Error('That expression has no finite result.');
  return Math.abs(result) >= 1e10
    ? result.toExponential(6)
    : Number(result.toPrecision(12)).toLocaleString('en-US', { maximumFractionDigits: 10 });
}
