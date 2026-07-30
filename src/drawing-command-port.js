/**
 * @typedef {(...arguments_: unknown[]) => unknown} DrawingCommand
 *
 * @typedef {object} DrawingCommandDependencies
 * @property {{saveDrawing: DrawingCommand, loadDrawing: DrawingCommand}} drawingSessionCoordinator
 * @property {{redraw: DrawingCommand}} sketchCanvasController
 *
 * @typedef {object} DrawingCommands
 * @property {DrawingCommand} saveDrawing
 * @property {DrawingCommand} loadDrawing
 * @property {DrawingCommand} redraw
 *
 * @typedef {object} DrawingCommandPort
 * @property {Readonly<DrawingCommands>} commands
 * @property {(dependencies: unknown) => void} connect
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @returns {DrawingCommandPort} */
export function createDrawingCommandPort() {
  /** @type {Readonly<DrawingCommandDependencies> | null} */
  let dependencies = null;

  /**
   * @param {unknown} owner
   * @param {string} method
   * @param {string} label
   */
  function requireMethod(owner, method, label) {
    if (!isRecord(owner) || typeof owner[method] !== 'function') {
      throw new Error(`Drawing commands require ${label}.${method}().`);
    }
  }

  /** @returns {Readonly<DrawingCommandDependencies>} */
  function requireDependencies() {
    if (!dependencies) {
      throw new Error('Drawing commands must be connected before use.');
    }
    return dependencies;
  }

  const commands = Object.freeze({
    /** @param {unknown[]} args */
    saveDrawing(...args) {
      return requireDependencies().drawingSessionCoordinator.saveDrawing(...args);
    },
    /** @param {unknown[]} args */
    loadDrawing(...args) {
      return requireDependencies().drawingSessionCoordinator.loadDrawing(...args);
    },
    /** @param {unknown[]} args */
    redraw(...args) {
      return requireDependencies().sketchCanvasController.redraw(...args);
    },
  });

  return {
    commands,
    /**
     * @param {unknown} nextDependencies
     */
    connect(nextDependencies) {
      if (dependencies) {
        throw new Error('Drawing commands are already connected.');
      }
      const candidate = isRecord(nextDependencies) ? nextDependencies : {};
      requireMethod(
        candidate.drawingSessionCoordinator,
        'saveDrawing',
        'drawingSessionCoordinator',
      );
      requireMethod(
        candidate.drawingSessionCoordinator,
        'loadDrawing',
        'drawingSessionCoordinator',
      );
      requireMethod(candidate.sketchCanvasController, 'redraw', 'sketchCanvasController');
      dependencies = Object.freeze(/** @type {DrawingCommandDependencies} */ (nextDependencies));
    },
  };
}
