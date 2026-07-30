/**
 * @template Stroke
 * @param {Stroke[]} strokes
 * @param {Stroke[] | null} [redoStrokes]
 * @returns {Stroke | null}
 */
export function undoStroke(strokes, redoStrokes = null) {
  const stroke = strokes.pop();
  if (stroke && redoStrokes) redoStrokes.push(stroke);
  return stroke ?? null;
}

/**
 * @template Stroke
 * @param {readonly Stroke[]} strokes
 * @param {readonly number[]} selectedIndices
 * @returns {Stroke[] | null}
 */
export function removeSelectedStrokes(strokes, selectedIndices) {
  const indices = new Set(selectedIndices);
  if (!indices.size) return null;
  return strokes.filter((_, index) => !indices.has(index));
}
