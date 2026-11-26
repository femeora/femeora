import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const contractsRoot = resolve(scriptDirectory, '..');
const inputPath = resolve(
  contractsRoot,
  'deployments/mainnet-tail-fee-migration-schedule.json'
);
const schedule = JSON.parse(readFileSync(inputPath, 'utf8'));

if (schedule.chainId !== 4663 || schedule.network !== 'mainnet') {
  throw new Error('Unexpected Tail Fee migration network');
}
if (!/^0x[0-9a-fA-F]{40}$/.test(schedule.governanceSafe)) {
  throw new Error('Invalid governance Safe');
}
if (!/^0x[0-9a-fA-F]{40}$/.test(schedule.protocolTimelock)) {
  throw new Error('Invalid protocol timelock');
}

function calldataKeys(kind) {
  return Object.keys(schedule)
    .filter(key => key.endsWith(`${kind}Calldata`))
    .sort((left, right) => left.localeCompare(right));
}

function buildBatch(kind) {
  const keys = calldataKeys(kind);
  if (keys.length !== schedule.operationCount) {
    throw new Error(`${kind} operation count mismatch`);
  }
  return {
    version: '1.0',
    chainId: String(schedule.chainId),
    createdAt: Date.now(),
    meta: {
      name: `Femeora Tail Fee — ${kind === 'Schedule' ? 'schedule all' : 'execute all'}`,
      description:
        kind === 'Schedule'
          ? 'Schedules all Tail Fee migration operations through the five-minute protocol timelock.'
          : 'Executes all matured Tail Fee migration operations atomically; reward activation is last.',
      txBuilderVersion: '1.18.0',
      createdFromSafeAddress: schedule.governanceSafe,
      createdFromOwnerAddress: '',
      checksum: '',
    },
    transactions: keys.map(key => ({
      to: schedule.protocolTimelock,
      value: '0',
      data: schedule[key],
      contractMethod: null,
      contractInputsValues: null,
    })),
  };
}

for (const kind of ['Schedule', 'Execute']) {
  const suffix = kind.toLowerCase();
  const outputPath = resolve(
    contractsRoot,
    `deployments/mainnet-tail-fee-safe-${suffix}.json`
  );
  writeFileSync(outputPath, `${JSON.stringify(buildBatch(kind), null, 2)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(`${kind}: ${outputPath}\n`);
}
