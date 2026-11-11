/* undo for a host: the models it had and has undone, in order. The host makes it, holds it and decides what goes in;
   render() never sees it. `limit` caps how many steps back are kept. */
export function history(model, limit = 100) {
  const past = [], future = []; let now = model;
  return {
    get model() { return now; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    push(m) { past.push(now); if (past.length > limit) past.shift(); future.length = 0; return (now = m); },
    undo() { if (past.length) { future.push(now); now = past.pop(); } return now; },
    redo() { if (future.length) { past.push(now); now = future.pop(); } return now; },
  };
}
