// Copies each component's stylesheet next to its compiled output.
import { cpSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));
const target = join(source, '../../src/components/react-bits');

for (const entry of readdirSync(source, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  for (const file of readdirSync(join(source, entry.name)).filter(name => name.endsWith('.css'))) {
    cpSync(join(source, entry.name, file), join(target, entry.name, file));
  }
}
