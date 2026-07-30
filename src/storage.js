const DIAGNOSTIC_CODES = Object.freeze({
  read: 'STORAGE_READ_FAILED',
  parse: 'STORAGE_PARSE_FAILED',
  write: 'STORAGE_WRITE_FAILED',
});

/**
 * @typedef {keyof typeof DIAGNOSTIC_CODES} StorageOperation
 *
 * @typedef {object} StorageDiagnostic
 * @property {string} code
 * @property {string} boundary
 * @property {StorageOperation} operation
 * @property {string} key
 * @property {string} message
 * @property {unknown} error
 *
 * @typedef {object} JsonStorage
 * @property {(key: string) => string | null} getItem
 * @property {(key: string, value: string) => void} setItem
 */

/** @param {StorageDiagnostic} diagnostic */
export function logStorageDiagnostic(diagnostic) {
  console.error(`[${diagnostic.code}] ${diagnostic.message}`, diagnostic.error);
}

/**
 * @param {{
 *   boundary: string,
 *   operation: StorageOperation,
 *   key: string,
 *   error: unknown,
 *   onDiagnostic?: (diagnostic: StorageDiagnostic) => void,
 * }} options
 * @returns {Readonly<StorageDiagnostic>}
 */
export function reportStorageFailure({
  boundary,
  operation,
  key,
  error,
  onDiagnostic = logStorageDiagnostic,
}) {
  const diagnostic = Object.freeze({
    code: DIAGNOSTIC_CODES[operation] ?? 'STORAGE_OPERATION_FAILED',
    boundary,
    operation,
    key,
    message: `${boundary} could not ${operation} "${key}".`,
    error,
  });
  onDiagnostic(diagnostic);
  return diagnostic;
}

/**
 * @template Value
 * @param {string} key
 * @param {Value} fallback
 * @param {{
 *   storage?: Pick<JsonStorage, 'getItem'>,
 *   boundary?: string,
 *   onDiagnostic?: (diagnostic: StorageDiagnostic) => void,
 * }} [options]
 * @returns {Value | unknown}
 */
export function loadJson(
  key,
  fallback,
  {
    storage = globalThis.localStorage,
    boundary = 'shared storage',
    onDiagnostic = logStorageDiagnostic,
  } = {},
) {
  let serialized;
  try {
    serialized = storage.getItem(key);
  } catch (error) {
    reportStorageFailure({ boundary, operation: 'read', key, error, onDiagnostic });
    throw error;
  }

  if (serialized === null) return fallback;

  try {
    return JSON.parse(serialized);
  } catch (error) {
    reportStorageFailure({ boundary, operation: 'parse', key, error, onDiagnostic });
    throw error;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {{
 *   storage?: Pick<JsonStorage, 'setItem'>,
 *   boundary?: string,
 *   onDiagnostic?: (diagnostic: StorageDiagnostic) => void,
 * }} [options]
 * @returns {true}
 */
export function saveJson(
  key,
  value,
  {
    storage = globalThis.localStorage,
    boundary = 'shared storage',
    onDiagnostic = logStorageDiagnostic,
  } = {},
) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    reportStorageFailure({ boundary, operation: 'write', key, error, onDiagnostic });
    throw error;
  }
}

/**
 * @param {string} filename
 * @param {unknown} data
 */
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/**
 * @param {unknown} name
 * @returns {string}
 */
export function slugifyName(name) {
  return (
    String(name || 'chalk')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'chalk'
  );
}

/**
 * @param {File | null | undefined} file
 * @param {(payload: unknown) => void} handler
 * @returns {Promise<void>}
 */
export async function readJsonFile(file, handler) {
  if (!file) return;
  handler(JSON.parse(await file.text()));
}
