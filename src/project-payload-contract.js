export const PROJECT_STORAGE_VERSION = 1;
export const PROJECT_EXPORT_VERSION = 2;

/**
 * @typedef {string | number} ProjectIdentifier
 *
 * @typedef {object} ProjectPoint
 * @property {number} x
 * @property {number} y
 * @property {number} pressure
 *
 * @typedef {'pen' | 'eraser'} ProjectStrokeTool
 *
 * @typedef {object} ProjectStroke
 * @property {ProjectStrokeTool} tool
 * @property {ProjectPoint[]} points
 * @property {string} [color]
 * @property {number} [size]
 * @property {number} [canvasHeight]
 *
 * @typedef {object} ProjectCard
 * @property {string} expression
 * @property {string} result
 * @property {string} [latex]
 * @property {ProjectIdentifier} [id]
 * @property {number} [x]
 * @property {number} [y]
 *
 * @typedef {'user' | 'assistant'} ProjectCoachMessageRole
 *
 * @typedef {object} ProjectCoachMessage
 * @property {ProjectCoachMessageRole} role
 * @property {string} text
 * @property {string} [createdAt]
 *
 * @typedef {object} ProjectCoachThread
 * @property {ProjectIdentifier} id
 * @property {string} title
 * @property {ProjectCoachMessage[]} messages
 * @property {string | null} codexThreadId
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 *
 * @typedef {object} ProjectPage
 * @property {ProjectIdentifier} id
 * @property {string} title
 * @property {ProjectStroke[]} strokes
 * @property {ProjectCard[]} cards
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 *
 * @typedef {object} Project
 * @property {ProjectIdentifier} id
 * @property {string} title
 * @property {ProjectPage[]} pages
 * @property {ProjectIdentifier | null} activePageId
 * @property {ProjectCoachMessage[]} coachMessages
 * @property {ProjectCoachThread[]} coachThreads
 * @property {ProjectIdentifier | null} activeCoachThreadId
 * @property {string | null} codexThreadId
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 * @property {string} [importedAt]
 *
 * @typedef {object} ProjectState
 * @property {Project[]} sessions
 * @property {ProjectIdentifier | null} activeId
 *
 * @typedef {object} ProjectPayloadIssue
 * @property {string} code
 * @property {readonly (string | number)[]} path
 * @property {string} message
 *
 * @typedef {(number: number, overrides?: Partial<ProjectPage>) => ProjectPage} CreateProjectPage
 */

const SUPPORTED_EXPORT_VERSIONS = new Set([1, PROJECT_EXPORT_VERSION]);
const COACH_MESSAGE_ROLES = new Set(['user', 'assistant']);
const STROKE_TOOLS = new Set(['pen', 'eraser']);

/**
 * @param {readonly (string | number)[]} path
 * @returns {string}
 */
function formatPath(path) {
  let formatted = '$';
  for (const segment of path) {
    formatted =
      typeof segment === 'number' ? `${formatted}[${segment}]` : `${formatted}.${segment}`;
  }
  return formatted;
}

/**
 * @param {string} code
 * @param {readonly (string | number)[]} path
 * @param {string} message
 * @returns {Readonly<ProjectPayloadIssue>}
 */
function issue(code, path, message) {
  return Object.freeze({
    code,
    path: Object.freeze([...path]),
    message,
  });
}

export class ProjectPayloadValidationError extends TypeError {
  /**
   * @param {string} source
   * @param {readonly ProjectPayloadIssue[]} issues
   */
  constructor(source, issues) {
    const firstIssue = issues[0];
    const suffix = issues.length > 1 ? ` (${issues.length} issues)` : '';
    super(
      `Invalid ${source} payload at ${formatPath(firstIssue?.path || [])}: ${
        firstIssue?.message || 'The payload is invalid.'
      }${suffix}`,
    );
    this.name = 'ProjectPayloadValidationError';
    this.code = 'PROJECT_PAYLOAD_INVALID';
    this.source = source;
    this.issues = Object.freeze([...issues]);
  }
}

class ProjectPayloadReader {
  /** @param {string} source */
  constructor(source) {
    this.source = source;
    /** @type {ProjectPayloadIssue[]} */
    this.issues = [];
  }

  /**
   * @param {string} code
   * @param {readonly (string | number)[]} path
   * @param {string} message
   */
  add(code, path, message) {
    this.issues.push(issue(code, path, message));
  }

  /**
   * @template Value
   * @param {Value} value
   * @returns {Value}
   */
  finish(value) {
    if (this.issues.length) {
      throw new ProjectPayloadValidationError(this.source, this.issues);
    }
    return value;
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {ProjectPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @returns {Record<string, unknown> | null}
 */
function readRecord(reader, value, path) {
  if (isRecord(value)) return value;
  reader.add('invalid_type', path, 'Expected an object.');
  return null;
}

/**
 * @param {ProjectPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {{defaultValue?: unknown[], required?: boolean}} [options]
 * @returns {unknown[]}
 */
function readArray(reader, value, path, { defaultValue, required = false } = {}) {
  if (value === undefined && !required) return defaultValue ?? [];
  if (Array.isArray(value)) return value;
  reader.add(value === undefined ? 'missing_value' : 'invalid_type', path, 'Expected an array.');
  return [];
}

/**
 * @param {ProjectPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {{defaultValue?: string | null, nullable?: boolean, required?: boolean}} [options]
 * @returns {string | null | undefined}
 */
function readString(
  reader,
  value,
  path,
  { defaultValue, nullable = false, required = false } = {},
) {
  if (value === null && nullable) return null;
  if (value === undefined && !required) return defaultValue;
  if (typeof value === 'string') return value;
  reader.add(
    value === undefined ? 'missing_value' : 'invalid_type',
    path,
    nullable ? 'Expected a string or null.' : 'Expected a string.',
  );
  return defaultValue;
}

/**
 * @param {ProjectPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {{defaultValue?: number, minimum?: number, maximum?: number, required?: boolean}} [options]
 * @returns {number | undefined}
 */
function readFiniteNumber(
  reader,
  value,
  path,
  { defaultValue, minimum, maximum, required = false } = {},
) {
  if (value === undefined && !required) return defaultValue;
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (minimum === undefined || value >= minimum) &&
    (maximum === undefined || value <= maximum)
  ) {
    return value;
  }
  const range =
    minimum !== undefined || maximum !== undefined
      ? ` in the range ${minimum ?? '-Infinity'} to ${maximum ?? 'Infinity'}`
      : '';
  reader.add(
    value === undefined ? 'missing_value' : 'invalid_type',
    path,
    `Expected a finite number${range}.`,
  );
  return defaultValue;
}

/**
 * @param {unknown} value
 * @returns {value is ProjectIdentifier}
 */
function isIdentifier(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length > 0;
  return false;
}

/**
 * @template Value
 * @param {Value | null | undefined | false} value
 * @returns {value is Value}
 */
function isPresent(value) {
  return value !== null && value !== undefined && value !== false;
}

/**
 * @param {ProjectPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {{defaultValue?: ProjectIdentifier | null, nullable?: boolean, required?: boolean}} [options]
 * @returns {ProjectIdentifier | null | undefined}
 */
function readIdentifier(
  reader,
  value,
  path,
  { defaultValue, nullable = false, required = false } = {},
) {
  if (value === null && nullable) return null;
  if (value === undefined && !required) return defaultValue;
  if (isIdentifier(value)) return value;
  reader.add(
    value === undefined ? 'missing_value' : 'invalid_identifier',
    path,
    nullable
      ? 'Expected a non-empty string, finite number, or null.'
      : 'Expected a non-empty string or finite number.',
  );
  return defaultValue;
}

/**
 * @param {ProjectPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {{defaultValue?: string | null, nullable?: boolean, required?: boolean}} [options]
 * @returns {string | null | undefined}
 */
function readTimestamp(
  reader,
  value,
  path,
  { defaultValue, nullable = false, required = false } = {},
) {
  const timestamp = readString(reader, value, path, { defaultValue, nullable, required });
  if (timestamp === undefined || timestamp === null) return timestamp;
  if (!Number.isNaN(Date.parse(timestamp))) return timestamp;
  reader.add('invalid_timestamp', path, 'Expected a parseable date-time string.');
  return defaultValue;
}

/**
 * @template {object} Target
 * @template {keyof Target} Key
 * @param {Target} target
 * @param {Key} key
 * @param {Target[Key] | undefined} value
 */
function assignOptional(target, key, value) {
  if (value !== undefined) target[key] = value;
}

/**
 * @param {ProjectPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @returns {ProjectPoint | null}
 */
function parsePoint(reader, value, path) {
  const point = readRecord(reader, value, path);
  if (!point) return null;

  /** @type {ProjectPoint} */
  const normalized = {
    x: readFiniteNumber(reader, point.x, [...path, 'x'], { required: true }) ?? 0,
    y: readFiniteNumber(reader, point.y, [...path, 'y'], { required: true }) ?? 0,
    pressure:
      readFiniteNumber(reader, point.pressure, [...path, 'pressure'], {
        defaultValue: 0.55,
        minimum: 0,
        maximum: 1,
      }) ?? 0.55,
  };
  return normalized;
}

/**
 * @param {ProjectPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {{strict: boolean}} options
 * @returns {ProjectStroke | null}
 */
function parseStroke(reader, value, path, { strict }) {
  const stroke = readRecord(reader, value, path);
  if (!stroke) return null;

  const tool = readString(reader, stroke.tool, [...path, 'tool'], {
    defaultValue: 'pen',
    required: strict,
  });
  if (tool !== undefined && tool !== null && !STROKE_TOOLS.has(tool)) {
    reader.add('invalid_value', [...path, 'tool'], 'Expected "pen" or "eraser".');
  }

  const points = readArray(reader, stroke.points, [...path, 'points'], {
    required: true,
  }).map((point, index) => parsePoint(reader, point, [...path, 'points', index]));
  /** @type {ProjectStroke} */
  const normalized = {
    tool: tool === 'eraser' ? 'eraser' : 'pen',
    points: points.filter(isPresent),
  };
  assignOptional(
    normalized,
    'color',
    readString(reader, stroke.color, [...path, 'color']) ?? undefined,
  );
  assignOptional(
    normalized,
    'size',
    readFiniteNumber(reader, stroke.size, [...path, 'size'], { minimum: 0 }),
  );
  assignOptional(
    normalized,
    'canvasHeight',
    readFiniteNumber(reader, stroke.canvasHeight, [...path, 'canvasHeight'], { minimum: 0 }),
  );
  return normalized;
}

/**
 * @param {ProjectPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {{strict: boolean}} options
 * @returns {ProjectCard | null}
 */
function parseCard(reader, value, path, { strict }) {
  const card = readRecord(reader, value, path);
  if (!card) return null;

  const legacyExpression = readString(reader, card.latex, [...path, 'latex']);
  const expression = readString(reader, card.expression, [...path, 'expression'], {
    defaultValue: legacyExpression ?? '',
    required: strict && legacyExpression === undefined,
  });
  /** @type {ProjectCard} */
  const normalized = {
    expression: expression ?? '',
    result:
      readString(reader, card.result, [...path, 'result'], {
        defaultValue: '',
        required: strict,
      }) ?? '',
  };
  assignOptional(normalized, 'latex', legacyExpression ?? undefined);
  assignOptional(normalized, 'id', readIdentifier(reader, card.id, [...path, 'id']) ?? undefined);
  assignOptional(normalized, 'x', readFiniteNumber(reader, card.x, [...path, 'x']));
  assignOptional(normalized, 'y', readFiniteNumber(reader, card.y, [...path, 'y']));
  return normalized;
}

/**
 * @param {ProjectPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {{strict: boolean}} options
 * @returns {ProjectCoachMessage | null}
 */
function parseCoachMessage(reader, value, path, { strict }) {
  const message = readRecord(reader, value, path);
  if (!message) return null;

  const role = readString(reader, message.role, [...path, 'role'], {
    defaultValue: 'user',
    required: strict,
  });
  if (role !== undefined && role !== null && !COACH_MESSAGE_ROLES.has(role)) {
    reader.add('invalid_value', [...path, 'role'], 'Expected "user" or "assistant".');
  }

  /** @type {ProjectCoachMessage} */
  const normalized = {
    role: role === 'assistant' ? 'assistant' : 'user',
    text:
      readString(reader, message.text, [...path, 'text'], {
        defaultValue: '',
        required: true,
      }) ?? '',
  };
  assignOptional(
    normalized,
    'createdAt',
    readTimestamp(reader, message.createdAt, [...path, 'createdAt'], {
      required: strict,
    }) ?? undefined,
  );
  return normalized;
}

/**
 * @param {ProjectPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {{strict: boolean}} options
 * @returns {ProjectCoachThread | null}
 */
function parseCoachThread(reader, value, path, { strict }) {
  const thread = readRecord(reader, value, path);
  if (!thread) return null;

  const messages = readArray(reader, thread.messages, [...path, 'messages'], {
    required: strict,
  }).map((message, index) =>
    parseCoachMessage(reader, message, [...path, 'messages', index], { strict }),
  );
  /** @type {ProjectCoachThread} */
  const normalized = {
    id: readIdentifier(reader, thread.id, [...path, 'id'], { required: true }) ?? '',
    title:
      readString(reader, thread.title, [...path, 'title'], {
        defaultValue: 'New chat',
        required: strict,
      }) ?? 'New chat',
    messages: messages.filter(isPresent),
    codexThreadId:
      readString(reader, thread.codexThreadId, [...path, 'codexThreadId'], {
        defaultValue: null,
        nullable: true,
      }) ?? null,
  };
  assignOptional(
    normalized,
    'createdAt',
    readTimestamp(reader, thread.createdAt, [...path, 'createdAt'], {
      required: strict,
    }) ?? undefined,
  );
  assignOptional(
    normalized,
    'updatedAt',
    readTimestamp(reader, thread.updatedAt, [...path, 'updatedAt'], {
      required: strict,
    }) ?? undefined,
  );
  return normalized;
}

/**
 * @param {ProjectPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {{strict: boolean}} options
 * @returns {ProjectPage | null}
 */
function parsePage(reader, value, path, { strict }) {
  const page = readRecord(reader, value, path);
  if (!page) return null;

  const strokes = readArray(reader, page.strokes, [...path, 'strokes'], {
    required: strict,
  }).map((stroke, index) => parseStroke(reader, stroke, [...path, 'strokes', index], { strict }));
  const cards = readArray(reader, page.cards, [...path, 'cards'], {
    required: strict,
  }).map((card, index) => parseCard(reader, card, [...path, 'cards', index], { strict }));
  /** @type {ProjectPage} */
  const normalized = {
    id: readIdentifier(reader, page.id, [...path, 'id'], { required: true }) ?? '',
    title:
      readString(reader, page.title, [...path, 'title'], {
        defaultValue: 'Page',
        required: strict,
      }) ?? 'Page',
    strokes: strokes.filter(isPresent),
    cards: cards.filter(isPresent),
  };
  assignOptional(
    normalized,
    'createdAt',
    readTimestamp(reader, page.createdAt, [...path, 'createdAt'], {
      required: strict,
    }) ?? undefined,
  );
  assignOptional(
    normalized,
    'updatedAt',
    readTimestamp(reader, page.updatedAt, [...path, 'updatedAt'], {
      required: strict,
    }) ?? undefined,
  );
  return normalized;
}

/**
 * @template {{id: ProjectIdentifier} | null} Value
 * @param {ProjectPayloadReader} reader
 * @param {readonly Value[]} values
 * @param {readonly (string | number)[]} path
 */
function addDuplicateIdentifierIssues(reader, values, path) {
  const firstIndices = new Map();
  values.forEach((value, index) => {
    if (!value || !isIdentifier(value.id)) return;
    const key = `${typeof value.id}:${value.id}`;
    const firstIndex = firstIndices.get(key);
    if (firstIndex === undefined) {
      firstIndices.set(key, index);
      return;
    }
    reader.add(
      'duplicate_identifier',
      [...path, index, 'id'],
      `Identifier duplicates ${formatPath([...path, firstIndex, 'id'])}.`,
    );
  });
}

/**
 * @param {ProjectPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {{
 *   version: number,
 *   createPage: CreateProjectPage,
 *   allowLegacySinglePage?: boolean,
 * }} options
 * @returns {Project | null}
 */
function parseProject(reader, value, path, { version, createPage, allowLegacySinglePage = false }) {
  const project = readRecord(reader, value, path);
  if (!project) return null;
  const strict = version >= PROJECT_EXPORT_VERSION;

  let rawPages = project.pages;
  if (rawPages === undefined && allowLegacySinglePage) {
    const pageTitle =
      typeof project.title === 'string' && project.title !== 'Untitled page'
        ? project.title
        : 'Page 1';
    rawPages = [
      createPage(
        1,
        /** @type {Partial<ProjectPage>} */ (
          /** @type {unknown} */ ({
            title: pageTitle,
            strokes: project.strokes ?? [],
            cards: project.cards ?? [],
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          })
        ),
      ),
    ];
  }

  const pages = readArray(reader, rawPages, [...path, 'pages'], {
    required: true,
  }).map((page, index) => parsePage(reader, page, [...path, 'pages', index], { strict }));
  const normalizedPages = pages.filter(isPresent);
  if (!normalizedPages.length) {
    reader.add('empty_collection', [...path, 'pages'], 'Expected at least one page.');
  }
  addDuplicateIdentifierIssues(reader, normalizedPages, [...path, 'pages']);

  const coachMessages = readArray(reader, project.coachMessages, [...path, 'coachMessages'], {
    required: strict,
  }).map((message, index) =>
    parseCoachMessage(reader, message, [...path, 'coachMessages', index], { strict: false }),
  );
  const coachThreads = readArray(reader, project.coachThreads, [...path, 'coachThreads'], {
    required: strict,
  }).map((thread, index) =>
    parseCoachThread(reader, thread, [...path, 'coachThreads', index], { strict }),
  );
  const normalizedThreads = coachThreads.filter(isPresent);
  addDuplicateIdentifierIssues(reader, normalizedThreads, [...path, 'coachThreads']);

  let title =
    readString(reader, project.title, [...path, 'title'], {
      defaultValue: 'Untitled project',
      required: strict,
    }) ?? 'Untitled project';
  if (allowLegacySinglePage && title === 'Untitled page') title = 'Untitled project';

  /** @type {Project} */
  const normalized = {
    id: readIdentifier(reader, project.id, [...path, 'id'], { required: true }) ?? '',
    title,
    pages: normalizedPages,
    activePageId:
      readIdentifier(reader, project.activePageId, [...path, 'activePageId'], {
        defaultValue: normalizedPages[0]?.id ?? null,
        nullable: true,
        required: strict,
      }) ?? null,
    coachMessages: coachMessages.filter(isPresent),
    coachThreads: normalizedThreads,
    activeCoachThreadId:
      readIdentifier(reader, project.activeCoachThreadId, [...path, 'activeCoachThreadId'], {
        defaultValue: normalizedThreads[0]?.id ?? null,
        nullable: true,
      }) ?? null,
    codexThreadId:
      readString(reader, project.codexThreadId, [...path, 'codexThreadId'], {
        defaultValue: null,
        nullable: true,
      }) ?? null,
  };
  assignOptional(
    normalized,
    'createdAt',
    readTimestamp(reader, project.createdAt, [...path, 'createdAt'], {
      required: strict,
    }) ?? undefined,
  );
  assignOptional(
    normalized,
    'updatedAt',
    readTimestamp(reader, project.updatedAt, [...path, 'updatedAt'], {
      required: strict,
    }) ?? undefined,
  );
  assignOptional(
    normalized,
    'importedAt',
    readTimestamp(reader, project.importedAt, [...path, 'importedAt']) ?? undefined,
  );

  if (
    normalizedPages.length &&
    !normalizedPages.some((page) => page.id === normalized.activePageId)
  ) {
    normalized.activePageId = normalizedPages[0]?.id ?? null;
  }
  if (
    normalizedThreads.length &&
    !normalizedThreads.some((thread) => thread.id === normalized.activeCoachThreadId)
  ) {
    normalized.activeCoachThreadId = normalizedThreads[0]?.id ?? null;
  }
  return normalized;
}

/**
 * @param {ProjectPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @returns {number | null}
 */
function requireVersion(reader, value, path) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    reader.add(
      value === undefined ? 'missing_version' : 'invalid_version',
      path,
      'Expected an integer payload version.',
    );
    return null;
  }
  if (!SUPPORTED_EXPORT_VERSIONS.has(value)) {
    reader.add(
      'unsupported_version',
      path,
      `Supported project export versions are ${[...SUPPORTED_EXPORT_VERSIONS].join(' and ')}.`,
    );
    return null;
  }
  return value;
}

/**
 * @param {string} serialized
 * @param {string} source
 * @returns {unknown}
 */
export function parseProjectJson(serialized, source) {
  try {
    return JSON.parse(serialized);
  } catch {
    throw new ProjectPayloadValidationError(source, [
      issue('invalid_json', [], 'Expected valid JSON.'),
    ]);
  }
}

/**
 * @param {unknown} payload
 * @param {{createPage: CreateProjectPage}} options
 * @returns {ProjectState}
 */
export function parsePersistedProjectPayload(payload, { createPage }) {
  const reader = new ProjectPayloadReader(`project storage v${PROJECT_STORAGE_VERSION}`);
  const state = readRecord(reader, payload, []);
  if (!state) {
    return /** @type {ProjectState} */ (/** @type {unknown} */ (reader.finish(null)));
  }

  const sessions = readArray(reader, state.sessions, ['sessions'], { required: true }).map(
    (project, index) =>
      parseProject(reader, project, ['sessions', index], {
        version: PROJECT_STORAGE_VERSION,
        createPage,
        allowLegacySinglePage: true,
      }),
  );
  const normalizedSessions = sessions.filter(isPresent);
  addDuplicateIdentifierIssues(reader, normalizedSessions, ['sessions']);
  const activeId = readIdentifier(reader, state.activeId, ['activeId'], {
    defaultValue: normalizedSessions[0]?.id ?? null,
    nullable: true,
  });
  return reader.finish({
    sessions: normalizedSessions,
    activeId: normalizedSessions.some((project) => project.id === activeId)
      ? (activeId ?? null)
      : (normalizedSessions[0]?.id ?? null),
  });
}

/**
 * @param {unknown} payload
 * @param {{createPage: CreateProjectPage}} options
 * @returns {Project}
 */
export function parseProjectExportPayload(payload, { createPage }) {
  const reader = new ProjectPayloadReader('project import');
  const envelope = readRecord(reader, payload, []);
  if (!envelope) {
    return /** @type {Project} */ (/** @type {unknown} */ (reader.finish(null)));
  }

  if (envelope.kind !== 'chalk.project') {
    reader.add('invalid_kind', ['kind'], 'Expected "chalk.project".');
  }
  const version = requireVersion(reader, envelope.version, ['version']);
  const project = parseProject(reader, envelope.project, ['project'], {
    version: version ?? PROJECT_EXPORT_VERSION,
    createPage,
    allowLegacySinglePage: version === 1,
  });
  if (envelope.exportedAt !== undefined) {
    readTimestamp(reader, envelope.exportedAt, ['exportedAt'], { required: true });
  }
  return /** @type {Project} */ (/** @type {unknown} */ (reader.finish(project)));
}

/**
 * @param {unknown} project
 * @param {{createPage: CreateProjectPage}} options
 * @returns {Project}
 */
export function parseProjectForExport(project, { createPage }) {
  const reader = new ProjectPayloadReader(`project export v${PROJECT_EXPORT_VERSION}`);
  const normalized = parseProject(reader, project, ['project'], {
    version: PROJECT_EXPORT_VERSION,
    createPage,
  });
  return /** @type {Project} */ (/** @type {unknown} */ (reader.finish(normalized)));
}

/**
 * @param {unknown} payload
 * @returns {ProjectStroke[]}
 */
export function parseLegacyStrokePayload(payload) {
  const reader = new ProjectPayloadReader('legacy stroke storage');
  const strokes = readArray(reader, payload, [], { required: true }).map((stroke, index) =>
    parseStroke(reader, stroke, [index], { strict: false }),
  );
  return reader.finish(strokes.filter(isPresent));
}

/**
 * @param {unknown} payload
 * @returns {ProjectCard[]}
 */
export function parseLegacyCardPayload(payload) {
  const reader = new ProjectPayloadReader('legacy card storage');
  const cards = readArray(reader, payload, [], { required: true }).map((card, index) =>
    parseCard(reader, card, [index], { strict: false }),
  );
  return reader.finish(cards.filter(isPresent));
}
