import { readFile } from 'node:fs/promises';

const openapi = JSON.parse(await readFile(new URL('../contracts/openapi.json', import.meta.url)));
const fixtures = JSON.parse(await readFile(new URL('../contracts/fixtures.json', import.meta.url)));

if (openapi.openapi !== '3.1.0') throw new Error(`Expected OpenAPI 3.1.0, got ${openapi.openapi}`);
if (openapi.info?.version !== '1.0.0') throw new Error(`Expected contract 1.0.0, got ${openapi.info?.version}`);
if (fixtures.contractVersion !== openapi.info.version) throw new Error('Fixture and OpenAPI versions differ');

const operationIds = [];
for (const pathItem of Object.values(openapi.paths ?? {})) {
  for (const operation of Object.values(pathItem)) {
    if (operation && typeof operation === 'object' && operation.operationId) operationIds.push(operation.operationId);
  }
}
if (new Set(operationIds).size !== operationIds.length) throw new Error('Duplicate operationId found');
console.log(`Contract OK: ${Object.keys(openapi.paths).length} paths, ${operationIds.length} operations, ${fixtures.cases.length} fixtures`);
