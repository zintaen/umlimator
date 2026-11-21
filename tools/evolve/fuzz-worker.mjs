// fuzz.mjs's worker thread: loads one target and checks the inputs it is sent, one at a time. It runs in a thread so
// that fuzz.mjs can stop it (Worker.terminate) when an input hangs the reader in a loop that never yields.
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

const { targets } = await import(pathToFileURL(workerData.module));
const target = targets.find(t => t.name === workerData.target);
console.warn = () => {}; // a reader's warnings are not findings
parentPort.on('message', async ({ id, input }) => {
  try {
    await target.check(input, { hangMs: workerData.hangMs });
    parentPort.postMessage({ id, ok: true });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    parentPort.postMessage({ id, ok: false, kind: err.fuzzKind || 'crash', message: String(err.message), stack: String(err.stack || '') });
  }
});
parentPort.postMessage({ ready: true });
