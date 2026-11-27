// Whether the module at `url` (its own module URL) is the script node was started with. The script path node was given keeps the
// symbolic links of the path it was given, while the module's URL has them resolved (a checkout under macOS /tmp or
// /var, a linked workspace folder): compared as they are, a tool run through such a path took itself for a library, did
// nothing and exited 0, so the kill switch said "go on" with STOP set (audit 70). Both are compared as real paths.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isMain(url) {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url)); } catch { return false; }
}
