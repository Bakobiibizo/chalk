export const LESSON_STORAGE_VERSION = 1;
export const LESSON_EXPORT_VERSION = 1;

/**
 * @typedef {string | number} LessonIdentifier
 *
 * @typedef {'pen' | 'eraser'} LessonPracticeTool
 *
 * @typedef {object} LessonPracticePoint
 * @property {number} x
 * @property {number} y
 * @property {number} pressure
 *
 * @typedef {object} LessonPracticeStroke
 * @property {LessonPracticeTool} tool
 * @property {LessonPracticePoint[]} points
 * @property {number} [canvasHeight]
 * @property {string} [color]
 * @property {number} [size]
 *
 * @typedef {'planned' | 'active' | 'completed'} LessonGraphNodeStatus
 *
 * @typedef {object} LessonGraphNode
 * @property {string} id
 * @property {string} title
 * @property {string} obligation
 * @property {string[]} teaches
 * @property {LessonGraphNodeStatus} status
 *
 * @typedef {object} LessonGraphEdge
 * @property {string} from
 * @property {string} to
 * @property {string} relation
 *
 * @typedef {object} LessonGraph
 * @property {string} title
 * @property {string} contract
 * @property {LessonGraphNode[]} nodes
 * @property {LessonGraphEdge[]} edges
 *
 * @typedef {object} Lesson
 * @property {LessonIdentifier} id
 * @property {boolean} completed
 * @property {string} title
 * @property {string} topic
 * @property {string} summary
 * @property {string} explanation
 * @property {string} example
 * @property {string} practice
 * @property {string} hint
 * @property {string} level
 * @property {LessonPracticeStroke[]} practiceStrokes
 * @property {LessonGraph} [lessonGraph]
 * @property {LessonIdentifier | null} [graphNodeId]
 * @property {number} [minutes]
 * @property {number} [practiceCanvasHeight]
 * @property {string} [createdAt]
 * @property {string} [practiceUpdatedAt]
 * @property {string} [importedAt]
 *
 * @typedef {Pick<
 *   Lesson,
 *   'title' | 'topic' | 'summary' | 'explanation' | 'example' | 'practice' | 'hint'
 * > & {
 *   lessonGraph?: LessonGraph,
 *   graphNodeId?: LessonIdentifier | null,
 * }} GeneratedLesson
 *
 * @typedef {object} LessonPayloadIssue
 * @property {string} code
 * @property {readonly (string | number)[]} path
 * @property {string} message
 */

const SUPPORTED_EXPORT_VERSIONS = new Set([LESSON_EXPORT_VERSION]);
const PRACTICE_TOOLS = new Set(['pen', 'eraser']);
const GRAPH_NODE_STATUSES = new Set(['planned', 'active', 'completed']);
/** @type {readonly ('title' | 'topic' | 'summary' | 'explanation' | 'example' | 'practice' | 'hint' | 'level')[]} */
const REQUIRED_LESSON_TEXT_FIELDS = [
  'title',
  'topic',
  'summary',
  'explanation',
  'example',
  'practice',
  'hint',
  'level',
];

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
 * @returns {Readonly<LessonPayloadIssue>}
 */
function issue(code, path, message) {
  return Object.freeze({
    code,
    path: Object.freeze([...path]),
    message,
  });
}

export class LessonPayloadValidationError extends TypeError {
  /**
   * @param {string} source
   * @param {readonly LessonPayloadIssue[]} issues
   */
  constructor(source, issues) {
    const firstIssue = issues[0];
    const suffix = issues.length > 1 ? ` (${issues.length} issues)` : '';
    super(
      `Invalid ${source} payload at ${formatPath(firstIssue?.path || [])}: ${
        firstIssue?.message || 'The payload is invalid.'
      }${suffix}`,
    );
    this.name = 'LessonPayloadValidationError';
    this.code = 'LESSON_PAYLOAD_INVALID';
    this.source = source;
    this.issues = Object.freeze([...issues]);
  }
}

class LessonPayloadReader {
  /** @param {string} source */
  constructor(source) {
    this.source = source;
    /** @type {LessonPayloadIssue[]} */
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
      throw new LessonPayloadValidationError(this.source, this.issues);
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
 * @param {LessonPayloadReader} reader
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
 * @param {LessonPayloadReader} reader
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
 * @param {LessonPayloadReader} reader
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
 * @param {LessonPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {{defaultValue?: string, required?: boolean}} [options]
 * @returns {string | undefined}
 */
function readNonEmptyString(reader, value, path, { defaultValue, required = false } = {}) {
  const text = readString(reader, value, path, { defaultValue, required });
  if (text === undefined || text === null) return defaultValue;
  if (text.trim()) return text;
  reader.add('empty_string', path, 'Expected a non-empty string.');
  return defaultValue;
}

/**
 * @param {LessonPayloadReader} reader
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
 * @param {LessonPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @returns {number | undefined}
 */
function readPositiveNumber(reader, value, path) {
  if (value === undefined) return undefined;
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  return readFiniteNumber(reader, number, path, { minimum: Number.MIN_VALUE });
}

/**
 * @param {LessonPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {{defaultValue?: boolean, required?: boolean}} [options]
 * @returns {boolean | undefined}
 */
function readBoolean(reader, value, path, { defaultValue, required = false } = {}) {
  if (value === undefined && !required) return defaultValue;
  if (typeof value === 'boolean') return value;
  reader.add(value === undefined ? 'missing_value' : 'invalid_type', path, 'Expected a boolean.');
  return defaultValue;
}

/**
 * @param {unknown} value
 * @returns {value is LessonIdentifier}
 */
function isIdentifier(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length > 0;
  return false;
}

/**
 * @param {LessonPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {{
 *   defaultValue?: LessonIdentifier | null,
 *   nullable?: boolean,
 *   required?: boolean,
 * }} [options]
 * @returns {LessonIdentifier | null | undefined}
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
 * @param {LessonPayloadReader} reader
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
 * @template Value
 * @param {Value | null | undefined | false} value
 * @returns {value is Value}
 */
function isPresent(value) {
  return value !== null && value !== undefined && value !== false;
}

/**
 * @param {LessonPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @returns {LessonPracticePoint | null}
 */
function parsePracticePoint(reader, value, path) {
  const point = readRecord(reader, value, path);
  if (!point) return null;

  return {
    x: readFiniteNumber(reader, point.x, [...path, 'x'], { required: true }) ?? 0,
    y: readFiniteNumber(reader, point.y, [...path, 'y'], { required: true }) ?? 0,
    pressure:
      readFiniteNumber(reader, point.pressure, [...path, 'pressure'], {
        defaultValue: 0.55,
        minimum: 0,
        maximum: 1,
      }) ?? 0.55,
  };
}

/**
 * @param {LessonPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @returns {LessonPracticeStroke | null}
 */
function parsePracticeStroke(reader, value, path) {
  const stroke = readRecord(reader, value, path);
  if (!stroke) return null;

  const tool = readString(reader, stroke.tool, [...path, 'tool'], {
    defaultValue: 'pen',
  });
  if (tool !== undefined && tool !== null && !PRACTICE_TOOLS.has(tool)) {
    reader.add('invalid_value', [...path, 'tool'], 'Expected "pen" or "eraser".');
  }
  const points = readArray(reader, stroke.points, [...path, 'points'], {
    required: true,
  }).map((point, index) => parsePracticePoint(reader, point, [...path, 'points', index]));
  /** @type {LessonPracticeStroke} */
  const normalized = {
    tool: tool === 'eraser' ? 'eraser' : 'pen',
    points: points.filter(isPresent),
  };
  assignOptional(
    normalized,
    'canvasHeight',
    readPositiveNumber(reader, stroke.canvasHeight, [...path, 'canvasHeight']),
  );
  assignOptional(
    normalized,
    'color',
    readString(reader, stroke.color, [...path, 'color']) ?? undefined,
  );
  assignOptional(normalized, 'size', readPositiveNumber(reader, stroke.size, [...path, 'size']));
  return normalized;
}

/**
 * @param {LessonPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @returns {LessonGraphNode | null}
 */
function parseGraphNode(reader, value, path) {
  const node = readRecord(reader, value, path);
  if (!node) return null;

  const status = readString(reader, node.status, [...path, 'status'], {
    defaultValue: 'planned',
  });
  if (status !== undefined && status !== null && !GRAPH_NODE_STATUSES.has(status)) {
    reader.add(
      'invalid_value',
      [...path, 'status'],
      'Expected "planned", "active", or "completed".',
    );
  }
  const teaches = readArray(reader, node.teaches, [...path, 'teaches']).map((item, index) =>
    readNonEmptyString(reader, item, [...path, 'teaches', index], { required: true }),
  );
  return {
    id: readNonEmptyString(reader, node.id, [...path, 'id'], { required: true }) ?? '',
    title: readNonEmptyString(reader, node.title, [...path, 'title'], { required: true }) ?? '',
    obligation:
      readNonEmptyString(reader, node.obligation, [...path, 'obligation'], {
        required: true,
      }) ?? '',
    teaches: teaches.filter(isPresent),
    status: status === 'active' || status === 'completed' ? status : 'planned',
  };
}

/**
 * @template {{id: LessonIdentifier} | null} Value
 * @param {LessonPayloadReader} reader
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
 * @param {LessonPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @param {ReadonlySet<string>} nodeIds
 * @returns {LessonGraphEdge | null}
 */
function parseGraphEdge(reader, value, path, nodeIds) {
  const edge = readRecord(reader, value, path);
  if (!edge) return null;

  const from = readNonEmptyString(reader, edge.from, [...path, 'from'], { required: true });
  const to = readNonEmptyString(reader, edge.to, [...path, 'to'], { required: true });
  if (from !== undefined && !nodeIds.has(from)) {
    reader.add('unknown_reference', [...path, 'from'], 'Expected an existing graph node id.');
  }
  if (to !== undefined && !nodeIds.has(to)) {
    reader.add('unknown_reference', [...path, 'to'], 'Expected an existing graph node id.');
  }
  if (from !== undefined && from === to) {
    reader.add('self_reference', [...path, 'to'], 'A graph edge cannot reference one node twice.');
  }
  return {
    from: from ?? '',
    to: to ?? '',
    relation:
      readNonEmptyString(reader, edge.relation, [...path, 'relation'], {
        defaultValue: 'requires',
      }) ?? 'requires',
  };
}

/**
 * @param {LessonPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @returns {LessonGraph | null}
 */
function parseLessonGraph(reader, value, path) {
  if (value === undefined || value === null) return null;
  const graph = readRecord(reader, value, path);
  if (!graph) return null;

  const nodes = readArray(reader, graph.nodes, [...path, 'nodes'], {
    required: true,
  })
    .map((node, index) => parseGraphNode(reader, node, [...path, 'nodes', index]))
    .filter(isPresent);
  if (!nodes.length) {
    reader.add('empty_collection', [...path, 'nodes'], 'Expected at least one graph node.');
  }
  addDuplicateIdentifierIssues(reader, nodes, [...path, 'nodes']);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = readArray(reader, graph.edges, [...path, 'edges'])
    .map((edge, index) => parseGraphEdge(reader, edge, [...path, 'edges', index], nodeIds))
    .filter(isPresent);

  return {
    title: readNonEmptyString(reader, graph.title, [...path, 'title'], { required: true }) ?? '',
    contract:
      readNonEmptyString(reader, graph.contract, [...path, 'contract'], {
        required: true,
      }) ?? '',
    nodes,
    edges,
  };
}

/**
 * @param {LessonPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @returns {Lesson | null}
 */
function parseLesson(reader, value, path) {
  const lesson = readRecord(reader, value, path);
  if (!lesson) return null;

  /** @type {Lesson} */
  const normalized = {
    id: readIdentifier(reader, lesson.id, [...path, 'id'], { required: true }) ?? '',
    completed:
      readBoolean(reader, lesson.completed, [...path, 'completed'], {
        defaultValue: false,
      }) ?? false,
    title: '',
    topic: '',
    summary: '',
    explanation: '',
    example: '',
    practice: '',
    hint: '',
    level: '',
    practiceStrokes: [],
  };
  for (const field of REQUIRED_LESSON_TEXT_FIELDS) {
    normalized[field] =
      readNonEmptyString(reader, lesson[field], [...path, field], {
        required: true,
      }) ?? '';
  }

  const practiceStrokes = readArray(reader, lesson.practiceStrokes, [
    ...path,
    'practiceStrokes',
  ]).map((stroke, index) =>
    parsePracticeStroke(reader, stroke, [...path, 'practiceStrokes', index]),
  );
  normalized.practiceStrokes = practiceStrokes.filter(isPresent);
  const lessonGraph = parseLessonGraph(reader, lesson.lessonGraph, [...path, 'lessonGraph']);
  if (lessonGraph) normalized.lessonGraph = lessonGraph;

  const graphNodeId = readIdentifier(reader, lesson.graphNodeId, [...path, 'graphNodeId'], {
    defaultValue: lessonGraph?.nodes[0]?.id,
    nullable: true,
  });
  if (
    graphNodeId !== undefined &&
    graphNodeId !== null &&
    lessonGraph &&
    !lessonGraph.nodes.some((node) => node.id === graphNodeId)
  ) {
    reader.add(
      'unknown_reference',
      [...path, 'graphNodeId'],
      'Expected an existing lesson graph node id.',
    );
  }
  assignOptional(normalized, 'graphNodeId', graphNodeId);
  assignOptional(
    normalized,
    'minutes',
    readPositiveNumber(reader, lesson.minutes, [...path, 'minutes']),
  );
  assignOptional(
    normalized,
    'practiceCanvasHeight',
    readPositiveNumber(reader, lesson.practiceCanvasHeight, [...path, 'practiceCanvasHeight']),
  );
  assignOptional(
    normalized,
    'createdAt',
    readTimestamp(reader, lesson.createdAt, [...path, 'createdAt']) ?? undefined,
  );
  assignOptional(
    normalized,
    'practiceUpdatedAt',
    readTimestamp(reader, lesson.practiceUpdatedAt, [...path, 'practiceUpdatedAt']) ?? undefined,
  );
  assignOptional(
    normalized,
    'importedAt',
    readTimestamp(reader, lesson.importedAt, [...path, 'importedAt']) ?? undefined,
  );
  return normalized;
}

/**
 * @param {LessonPayloadReader} reader
 * @param {unknown} value
 * @param {readonly (string | number)[]} path
 * @returns {Lesson[]}
 */
function parseLessonCollection(reader, value, path) {
  const lessons = readArray(reader, value, path, { required: true })
    .map((lesson, index) => parseLesson(reader, lesson, [...path, index]))
    .filter(isPresent);
  addDuplicateIdentifierIssues(reader, lessons, path);
  return lessons;
}

/**
 * @param {LessonPayloadReader} reader
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
      `Supported lesson export version is ${LESSON_EXPORT_VERSION}.`,
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
export function parseLessonJson(serialized, source) {
  try {
    return JSON.parse(serialized);
  } catch {
    throw new LessonPayloadValidationError(source, [
      issue('invalid_json', [], 'Expected valid JSON.'),
    ]);
  }
}

/**
 * @param {unknown} payload
 * @returns {Lesson[]}
 */
export function parsePersistedLessonPayload(payload) {
  const reader = new LessonPayloadReader(`lesson storage v${LESSON_STORAGE_VERSION}`);
  const lessons = parseLessonCollection(reader, payload, []);
  return reader.finish(lessons);
}

/**
 * @param {unknown} lesson
 * @returns {Lesson}
 */
export function parseLessonInput(lesson) {
  const reader = new LessonPayloadReader('lesson input');
  const normalized = parseLesson(reader, lesson, []);
  return /** @type {Lesson} */ (/** @type {unknown} */ (reader.finish(normalized)));
}

/**
 * @param {unknown} payload
 * @returns {Lesson[]}
 */
export function parseLessonExportPayload(payload) {
  const reader = new LessonPayloadReader('lesson import');
  const envelope = readRecord(reader, payload, []);
  if (!envelope) {
    reader.finish(null);
    return [];
  }

  if (envelope.kind !== 'chalk.lessons') {
    reader.add('invalid_kind', ['kind'], 'Expected "chalk.lessons".');
  }
  requireVersion(reader, envelope.version, ['version']);
  if (envelope.exportedAt !== undefined) {
    readTimestamp(reader, envelope.exportedAt, ['exportedAt'], { required: true });
  }
  const lessons = parseLessonCollection(reader, envelope.lessons, ['lessons']);
  return reader.finish(lessons);
}

/**
 * @param {unknown} lessons
 * @returns {Lesson[]}
 */
export function parseLessonsForExport(lessons) {
  const reader = new LessonPayloadReader(`lesson export v${LESSON_EXPORT_VERSION}`);
  const normalized = parseLessonCollection(reader, lessons, ['lessons']);
  return reader.finish(normalized);
}
