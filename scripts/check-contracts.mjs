import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const openapi = JSON.parse(await readFile(new URL('../contracts/openapi.json', import.meta.url)));
const fixtures = JSON.parse(await readFile(new URL('../contracts/fixtures.json', import.meta.url)));

// --- Structural checks (unchanged) ---
if (openapi.openapi !== '3.1.0') throw new Error(`Expected OpenAPI 3.1.0, got ${openapi.openapi}`);
if (openapi.info?.version !== '1.1.0') throw new Error(`Expected contract 1.1.0, got ${openapi.info?.version}`);
if (fixtures.contractVersion !== openapi.info.version) throw new Error('Fixture and OpenAPI versions differ');

// Index operations by operationId so fixtures can be matched to their schemas.
const operations = new Map();
for (const [path, pathItem] of Object.entries(openapi.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (operation && typeof operation === 'object' && operation.operationId) {
      operations.set(operation.operationId, { path, method, operation });
    }
  }
}
if (operations.size !== [...operations.keys()].length) throw new Error('Duplicate operationId found');

// --- Schema validation of fixtures against the contract (AJV, draft 2020-12) ---
// OpenAPI 3.1 schemas are JSON Schema 2020-12. Register the whole document so
// intra-document $refs (#/components/schemas/...) resolve, then validate each
// fixture's response/request payload against the operation's declared schema.
const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addSchema(openapi, 'openapi.json');

function refPathOfResponse(op, status) {
  const response = op.responses?.[String(status)];
  const schema = response?.content?.['application/json']?.schema;
  if (!schema?.$ref) return null;
  return schema.$ref.replace(/^#\//, '');
}

function refPathOfRequest(op) {
  const schema = op.requestBody?.content?.['application/json']?.schema;
  if (!schema?.$ref) return null;
  return schema.$ref.replace(/^#\//, '');
}

const errors = [];
let responseChecks = 0;
let requestChecks = 0;

for (const test of fixtures.cases) {
  const entry = operations.get(test.operationId);
  if (!entry) {
    errors.push(`${test.name}: operationId "${test.operationId}" not found in contract`);
    continue;
  }
  const { operation } = entry;

  const responseRef = refPathOfResponse(operation, test.httpStatus);
  if (!responseRef) {
    errors.push(`${test.name}: no application/json schema for ${test.operationId} ${test.httpStatus}`);
  } else {
    const validate = ajv.compile({ $ref: `openapi.json#/${responseRef}` });
    if (!validate(test.response)) {
      responseChecks++;
      errors.push(`${test.name}: response does not match ${responseRef.split('/').pop()}\n    ${ajv.errorsText(validate.errors, { separator: '\n    ' })}`);
    } else {
      responseChecks++;
    }
  }

  if (test.request !== undefined) {
    const requestRef = refPathOfRequest(operation);
    if (!requestRef) {
      errors.push(`${test.name}: fixture has request body but ${test.operationId} declares none`);
    } else {
      const validate = ajv.compile({ $ref: `openapi.json#/${requestRef}` });
      requestChecks++;
      if (!validate(test.request)) {
        errors.push(`${test.name}: request does not match ${requestRef.split('/').pop()}\n    ${ajv.errorsText(validate.errors, { separator: '\n    ' })}`);
      }
    }
  }
}

if (errors.length) {
  console.error(`Contract validation FAILED (${errors.length} problem(s)):`);
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`Contract OK: ${Object.keys(openapi.paths).length} paths, ${operations.size} operations, ${fixtures.cases.length} fixtures validated (${responseChecks} responses, ${requestChecks} requests)`);
