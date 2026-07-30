/**
 * @typedef {import('./lesson-payload-contract.js').GeneratedLesson} GeneratedLesson
 * @typedef {import('./lesson-payload-contract.js').LessonGraph} LessonGraph
 * @typedef {import('./lesson-payload-contract.js').LessonGraphNode} LessonGraphNode
 * @typedef {import('./lesson-payload-contract.js').LessonGraphNodeStatus} LessonGraphNodeStatus
 *
 * @typedef {Pick<
 *   import('./lesson-payload-contract.js').Lesson,
 *   'title' | 'summary' | 'lessonGraph'
 * > & {lessonGraph: LessonGraph}} StoredGraphLesson
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} graph
 * @param {string} [fallbackTitle]
 * @returns {LessonGraph | null}
 */
export function normalizeLessonGraph(graph, fallbackTitle) {
  if (!isRecord(graph) || !Array.isArray(graph.nodes)) return null;
  /** @type {unknown[]} */
  const rawNodes = graph.nodes;
  const nodes = rawNodes.map((node, index) => {
    const nodeRecord = isRecord(node) ? node : {};
    const rawTeaches = Array.isArray(nodeRecord.teaches)
      ? /** @type {unknown[]} */ (nodeRecord.teaches)
      : [];
    return {
      id: String(nodeRecord.id || `lesson-${index + 1}`)
        .replace(/[^a-z0-9_-]+/gi, '-')
        .toLowerCase(),
      title: String(nodeRecord.title || `Lesson ${index + 1}`),
      obligation: String(nodeRecord.obligation || nodeRecord.description || nodeRecord.title || ''),
      teaches: rawTeaches.map((item) => String(item)),
      status: /** @type {LessonGraphNodeStatus} */ (index === 0 ? 'active' : 'planned'),
    };
  });
  if (!nodes.length) return null;
  const ids = new Set(nodes.map((node) => node.id));
  const rawEdges = Array.isArray(graph.edges) ? /** @type {unknown[]} */ (graph.edges) : [];
  const edges = rawEdges
    .map((edge) => {
      const edgeRecord = isRecord(edge) ? edge : {};
      return {
        from: String(edgeRecord.from || edgeRecord.source || ''),
        to: String(edgeRecord.to || edgeRecord.target || ''),
        relation: String(edgeRecord.relation || 'requires'),
      };
    })
    .filter((edge) => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to);
  return {
    title: String(graph.title || fallbackTitle || 'Lesson plan'),
    contract: String(
      graph.contract || 'Teach the requested subject through dependency-ordered obligations.',
    ),
    nodes,
    edges,
  };
}

/**
 * @param {string} raw
 * @param {((raw: string) => Promise<unknown>) | undefined} [parseModelJson]
 * @returns {Promise<GeneratedLesson>}
 */
export async function parseLessonResponse(raw, parseModelJson) {
  if (typeof parseModelJson !== 'function') throw new Error('Grist JSON parser is not available.');
  const lessonValue = await parseModelJson(raw);
  if (!isRecord(lessonValue)) throw new Error('Codex returned an incomplete lesson.');
  const containerValue = lessonValue.firstLesson || lessonValue.lesson || lessonValue;
  if (!isRecord(containerValue)) throw new Error('Codex returned an incomplete lesson.');
  const required = ['title', 'topic', 'summary', 'explanation', 'example', 'practice', 'hint'];
  if (
    !required.every((key) => typeof containerValue[key] === 'string' && containerValue[key].trim())
  )
    throw new Error('Codex returned an incomplete lesson.');
  /** @type {GeneratedLesson} */
  const normalized = {
    title: /** @type {string} */ (containerValue.title),
    topic: /** @type {string} */ (containerValue.topic),
    summary: /** @type {string} */ (containerValue.summary),
    explanation: /** @type {string} */ (containerValue.explanation),
    example: /** @type {string} */ (containerValue.example),
    practice: /** @type {string} */ (containerValue.practice),
    hint: /** @type {string} */ (containerValue.hint),
  };
  const graph = normalizeLessonGraph(
    lessonValue.lessonGraph || lessonValue.graph,
    normalized.title,
  );
  if (graph) {
    normalized.lessonGraph = graph;
    normalized.graphNodeId = graph.nodes[0]?.id || null;
    normalized.summary = `${normalized.summary}\n\nThis is Lesson 1 of ${graph.nodes.length} in a dependency graph: ${graph.title}`;
  }
  return normalized;
}

/**
 * @param {string} goal
 * @returns {boolean}
 */
export function isBroadLessonRequest(goal) {
  return (
    goal.length > 700 ||
    /\b(course|curriculum|lesson plan|from first principles|interactively|teach me .*mathematically|complete mathematical specification|stages|dependencies|graph|hierarchical)\b/i.test(
      goal,
    ) ||
    (goal.match(/\n\s*\d+\./g) || []).length >= 4
  );
}

/**
 * @param {string} goal
 * @param {string} level
 * @returns {string}
 */
export function lessonPrompt(goal, level) {
  const broad = isBroadLessonRequest(goal);
  if (broad) {
    return `The learner gave a large learning request. Build a dependency graph of teaching obligations that covers the full request without omitting scope, then produce only the first interactive lesson.\n\nLearner request:\n${goal}\n\nReturn ONLY valid JSON using this exact top-level shape:\n{\n  "lessonGraph": {\n    "title": "",\n    "contract": "one sentence describing what the graph must teach",\n    "nodes": [\n      {"id":"l1", "title":"", "obligation":"what must be taught/resolved", "teaches":["small objective"]}\n    ],\n    "edges": [\n      {"from":"l1", "to":"l2", "relation":"prerequisite"}\n    ]\n  },\n  "firstLesson": {"title":"","topic":"","summary":"","explanation":"","example":"","practice":"","hint":""}\n}\n\nGraph rules: nodes are obligations of what needs to be taught; edges are dependencies that must be resolved before later nodes. Use as many nodes as necessary to represent the complete learner request. The first node must begin where the learner requested and must be teachable immediately. Do not emit the full course text. The firstLesson must teach ONLY the first node in small interactive style, introduce only necessary notation, include a tiny numerical example, and end with one comprehension question in the practice or hint. Escape JSON backslashes. No Markdown fences or commentary outside JSON.`;
  }
  return `Create a focused ${level.toLowerCase()} lesson for this learning goal. Infer an appropriate scope from the learner's request:\n${goal}\n\nReturn ONLY valid JSON with exactly these string fields: {"title":"","topic":"","summary":"","explanation":"","example":"","practice":"","hint":""}. The example must be worked step-by-step. The practice problem must be solvable on a blank page. Put inline mathematical notation inside \\( and \\), and display equations inside $$ delimiters. Escape every JSON backslash correctly. Do not use Markdown code fences or commentary outside JSON.`;
}

/**
 * @param {LessonGraph | null | undefined} graph
 * @returns {number}
 */
export function activeGraphNodeIndex(graph) {
  if (!graph?.nodes?.length) return -1;
  const activeIndex = graph.nodes.findIndex((node) => node.status === 'active');
  return activeIndex >= 0 ? activeIndex : 0;
}

/**
 * @param {LessonGraph | null | undefined} graph
 * @returns {LessonGraphNode | null}
 */
export function nextGraphNode(graph) {
  const index = activeGraphNodeIndex(graph);
  return graph && index >= 0 ? (graph.nodes[index + 1] ?? null) : null;
}

/**
 * @param {StoredGraphLesson} previousLesson
 * @param {LessonGraphNode} node
 * @returns {string}
 */
export function nextGraphLessonPrompt(previousLesson, node) {
  return `Generate the next interactive lesson for this stored lesson graph. Return ONLY compact JSON with exactly these string fields: {"title":"","topic":"","summary":"","explanation":"","example":"","practice":"","hint":""}.

Graph title: ${previousLesson.lessonGraph.title}
Graph contract: ${previousLesson.lessonGraph.contract}
Current next node id: ${node.id}
Current next node title: ${node.title}
Teaching obligation: ${node.obligation}
Objectives: ${(node.teaches || []).join('; ')}

Previous lesson title: ${previousLesson.title}
Previous lesson summary: ${previousLesson.summary}

Teach only this next node. Proceed interactively, introduce only needed notation, include a tiny example, and end with one comprehension question. Escape JSON backslashes. No markdown fences or text outside JSON.`;
}
