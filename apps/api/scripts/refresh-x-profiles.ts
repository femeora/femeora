import { prisma } from '@fomeora/database';
import { loadApiEnvironment } from '@fomeora/env';

import { refreshXProfiles } from '../src/core/x/profile-refresh.js';

async function main() {
  const environment = loadApiEnvironment();
  if (!environment.X_APP_BEARER_TOKEN) {
    throw new Error('X_APP_BEARER_TOKEN is required for the scheduled profile refresh');
  }
  const result = await refreshXProfiles({
    prisma,
    bearerToken: environment.X_APP_BEARER_TOKEN,
  });
  process.stdout.write(
    `X profile refresh complete: requests=${result.requests} selected=${result.selected} updated=${result.updated} conflicts=${result.conflicts}\n`,
  );
}

main()
  .catch(() => {
    process.stderr.write('X profile refresh failed; inspect redacted platform diagnostics.\n');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
