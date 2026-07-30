import { nextGraphLessonPrompt, nextGraphNode, parseLessonResponse } from './lesson-ai.js';
import { createRuntimeLessonIdentifier, currentLessonTime } from './lesson-runtime-factories.js';

/**
 * @typedef {import('./lesson-payload-contract.js').Lesson} Lesson
 * @typedef {import('./lesson-payload-contract.js').LessonGraph} LessonGraph
 * @typedef {import('./lesson-payload-contract.js').LessonGraphNode} LessonGraphNode
 * @typedef {import('./lesson-payload-contract.js').LessonIdentifier} LessonIdentifier
 * @typedef {import('./lesson-store.js').LessonStore} LessonStore
 *
 * @typedef {{
 *   run: (prompt: string, threadId: string | null) => Promise<string>,
 *   isActive: boolean,
 * }} LessonCoachService
 *
 * @typedef {object} LessonProgressionOptions
 * @property {LessonStore} store
 * @property {LessonCoachService} coachService
 * @property {(raw: string) => Promise<unknown>} parseModelJson
 * @property {() => LessonIdentifier} [createLessonId]
 * @property {() => string} [createTimestamp]
 *
 * @typedef {{status: 'complete', node: null}} CompletedProgression
 * @typedef {{status: 'busy', node: LessonGraphNode}} BusyProgression
 * @typedef {{
 *   status: 'started',
 *   node: LessonGraphNode,
 *   completion: Promise<GeneratedProgression>,
 * }} StartedProgression
 * @typedef {{
 *   status: 'generated',
 *   node: LessonGraphNode,
 *   lesson: Lesson,
 * }} GeneratedProgression
 * @typedef {CompletedProgression | BusyProgression | StartedProgression} LessonProgression
 */

/**
 * @param {LessonGraph} graph
 * @param {string} nextNodeId
 * @returns {LessonGraph}
 */
function advanceGraph(graph, nextNodeId) {
  const advancedGraph = structuredClone(graph);
  advancedGraph.nodes = advancedGraph.nodes.map((node) => ({
    ...node,
    status:
      node.id === nextNodeId ? 'active' : node.status === 'active' ? 'completed' : node.status,
  }));
  return advancedGraph;
}

export class LessonProgressionService {
  /** @param {LessonProgressionOptions} options */
  constructor({
    store,
    coachService,
    parseModelJson,
    createLessonId = createRuntimeLessonIdentifier,
    createTimestamp = () => currentLessonTime().toISOString(),
  }) {
    this.store = store;
    this.coachService = coachService;
    this.parseModelJson = parseModelJson;
    this.createLessonId = createLessonId;
    this.createTimestamp = createTimestamp;
  }

  /**
   * @param {Lesson} previousLesson
   * @returns {LessonProgression}
   */
  generateNext(previousLesson) {
    const graph = previousLesson.lessonGraph;
    const node = nextGraphNode(graph);
    if (!graph || !node) return { status: 'complete', node: null };
    if (this.coachService.isActive) return { status: 'busy', node };

    return {
      status: 'started',
      node,
      completion: this.#generateAndInsert(previousLesson, graph, node),
    };
  }

  /**
   * @param {Lesson} previousLesson
   * @param {LessonGraph} graph
   * @param {LessonGraphNode} node
   * @returns {Promise<GeneratedProgression>}
   */
  async #generateAndInsert(previousLesson, graph, node) {
    const graphLesson = /** @type {Lesson & {lessonGraph: LessonGraph}} */ (
      /** @type {unknown} */ (previousLesson)
    );
    const response = await this.coachService.run(nextGraphLessonPrompt(graphLesson, node), null);
    const content = await parseLessonResponse(response, this.parseModelJson);
    const lesson = this.store.prepend({
      ...content,
      lessonGraph: advanceGraph(graph, node.id),
      graphNodeId: node.id,
      id: this.createLessonId(),
      level: previousLesson.level,
      minutes: previousLesson.minutes,
      completed: false,
      createdAt: this.createTimestamp(),
    });

    return { status: 'generated', node, lesson };
  }
}
