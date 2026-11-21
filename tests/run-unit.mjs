// Runs the unit tests in a US time zone (so date maths crosses daylight saving), the same on
// Windows, macOS and Linux. `npm run test:unit`.
import { spawnSync } from 'node:child_process';

const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', 'tests/unit/*.test.mjs', 'recipes/test/parse.test.js'],
  { stdio: 'inherit', env: { ...process.env, TZ: 'America/Los_Angeles' } });
process.exit(r.status ?? 1);
