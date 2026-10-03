import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

// Generates handoff artifacts only. It does not start services, execute routes or promote the published contract.
const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const published = JSON.parse(read('contracts/openapi.json'));
const spec = structuredClone(published);
const markdown = read('docs/CONTRACT_ZAKA_ZAMANI.md');
const extraTypes = `
type PublicReportStatus = 'verified'|'in_progress'|'resolved';
type ActivityStatus = 'draft'|'registration_open'|'registration_closed'|'in_progress'|'awaiting_result'|'completed'|'on_hold'|'cancelled';
type Page<T> = { items: T[]; nextCursor: string|null };
type SupportInput = { supported: boolean };
type FollowInput = { following: boolean };
type ConsentInput = { channels: ('web'|'instagram')[] };
type EvidenceApprovalInput = { channel: 'web'|'instagram'; approved: boolean; renditionId: string|null; reason: string };
type Redaction = { x: number; y: number; width: number; height: number };
type EvidenceRenditionInput = { subjectType: ReviewSubjectType; subjectId: string; redactions: Redaction[] };
type ReviewInput = { subjectType: ReviewSubjectType; subjectId: string; subjectRevision: number };
type ActivityCommandInput = { action: 'publish'|'close_registration'|'start'|'hold'|'resume'|'cancel'|'request_result'; reason: string|null };
type CoordinatorAcceptanceInput = { accepted: boolean; publishDisplayName: boolean };
type MembershipInput = { participating: boolean };
type MembershipDecisionInput = { status: 'accepted'|'waitlisted'|'rejected'|'cancelled'; reason: string };
type AttendanceInput = { attendance: 'unknown'|'present'|'absent' };
type ScheduleAcknowledgementInput = { scheduleRevision: number; confirmed: boolean };
type CoordinatorCandidate = { id: string; displayName: string };
type MeasurementInput = NonNullable<ActivityResultInput['measurement']>;
type MeasurementDecisionInput = { action: 'verify'|'reject'; reason: string };
type MeasurementCorrectionInput = { valueKg: number; reason: string; evidenceMediaIds: string[] };
type NotificationReadInput = { read: boolean };
type InstagramCreateInput = { reportId: string; mediaId: string; caption: string; altText: string; kind: 'initial'|'resolution'; milestoneId: string|null; replacesPostId: string|null };
type InstagramEditInput = { caption: string; altText: string };
type InstagramApproveInput = { contentRevision: number; sourceRevision: number; renditionId: string };
type ReasonInput = { reason: string };
type EmptyInput = {};
type ManualConfirmationInput = { evidenceMediaIds: string[]; explanation: string };
type PublicationSettingsInput = { source: 'reports'; onlyVerified: true; format: 'feed'; timezone: 'Asia/Jakarta'; draftGeneration: 'automatic'|'manual'; publishMode: 'approval_required'; captionTemplate: string; hashtags: string };
type AuthorizationResponseData = { authorizationUrl: string; expiresAt: string };
type DisconnectInput = { acknowledgePendingRetractions: boolean };
type WithdrawalInput = { scope: 'all'|'instagram'; reason: string };
type PublicIncidentResult = PublicIncident|CanonicalRedirect;
type PublicActivityDetail = PublicActivity|ActivityNotice;
type PublicIncidentTimelinePage = Page<PublicTimelineEvent>;
type FollowedIncidentPage = Page<FollowedIncident>;
type CommunityUpdatePage = Page<CommunityUpdate>;
type EvidenceRenditionPage = Page<EvidenceRendition>;
type ReviewRunPage = Page<ReviewRun>;
type ReviewQueuePage = Page<ReviewQueueItem>;
type PublicActivityPage = Page<PublicActivity>;
type MyActivityPage = Page<MyActivity>;
type ManagedActivityPage = Page<ManagedActivity>;
type CoordinatorCandidatePage = Page<CoordinatorCandidate>;
type ManagedMembershipPage = Page<ManagedMembership>;
type PublicActivityResultPage = Page<PublicActivityResult>;
type ImpactMeasurementPage = Page<ImpactMeasurement>;
type NotificationPage = Page<Notification>;
`;
const blocks = [...markdown.matchAll(/```ts\s*\n([\s\S]*?)```/g)].map(match => match[1]);
const source = ts.createSourceFile('r1-types.ts', extraTypes + '\n' + blocks.join('\n'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const aliases = new Map(source.statements.filter(ts.isTypeAliasDeclaration).map(node => [node.name.text, node]));
const schemas = spec.components.schemas;
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const closedObject = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const nonNull = schema => {
  if (!schema.anyOf) return schema;
  const branches = schema.anyOf.filter(s => s.type !== 'null');
  return branches.length === 1 ? branches[0] : { anyOf: branches };
};
const dereference = schema => schema.$ref ? dereference(schemas[schema.$ref.split('/').at(-1)]) : schema;
function convert(node, bindings = new Map()) {
  if (ts.isParenthesizedTypeNode(node)) return convert(node.type, bindings);
  if (ts.isUnionTypeNode(node)) {
    const children = node.types.map(child => convert(child, bindings));
    if (children.every(child => Object.hasOwn(child, 'const'))) return { type: typeof children[0].const, enum: children.map(child => child.const) };
    return { anyOf: children };
  }
  if (ts.isIntersectionTypeNode(node)) {
    const parts = node.types.map(child => dereference(convert(child, bindings)));
    if (!parts.every(part => part.type === 'object')) throw new Error('Unsupported non-object intersection: ' + node.getText(source));
    return closedObject(Object.assign({}, ...parts.map(part => part.properties)), [...new Set(parts.flatMap(part => part.required ?? []))]);
  }
  if (ts.isLiteralTypeNode(node)) {
    if (node.literal.kind === ts.SyntaxKind.NullKeyword) return { type: 'null' };
    if (ts.isStringLiteral(node.literal)) return { type: 'string', const: node.literal.text };
    if (node.literal.kind === ts.SyntaxKind.TrueKeyword || node.literal.kind === ts.SyntaxKind.FalseKeyword) return { type: 'boolean', const: node.literal.kind === ts.SyntaxKind.TrueKeyword };
    if (ts.isNumericLiteral(node.literal)) return { type: 'number', const: Number(node.literal.text) };
  }
  if (ts.isArrayTypeNode(node)) return { type: 'array', items: convert(node.elementType, bindings) };
  if (ts.isTypeLiteralNode(node)) {
    const properties = {}, required = [];
    for (const member of node.members) {
      if (!ts.isPropertySignature(member) || !member.type) throw new Error('Unsupported object member');
      const name = member.name.text;
      properties[name] = convert(member.type, bindings);
      if (!member.questionToken) required.push(name);
    }
    return closedObject(properties, required);
  }
  if (ts.isIndexedAccessTypeNode(node)) {
    const target = dereference(convert(node.objectType, bindings));
    const index = convert(node.indexType, bindings).const;
    if (!target.properties?.[index]) throw new Error('Unknown indexed field: ' + node.getText(source));
    return structuredClone(target.properties[index]);
  }
  if (ts.isTypeReferenceNode(node)) {
    const name = node.typeName.getText(source);
    if (bindings.has(name)) return bindings.get(name);
    if (name === 'NonNullable') return nonNull(convert(node.typeArguments[0], bindings));
    if (name === 'Record') {
      const keys = dereference(convert(node.typeArguments[0], bindings));
      const value = convert(node.typeArguments[1], bindings);
      if (keys.enum || Object.hasOwn(keys, 'const')) return closedObject(Object.fromEntries((keys.enum ?? [keys.const]).map(key => [key, value])));
      if (keys.type === 'string') return { type: 'object', additionalProperties: value };
      throw new Error('Unsupported record keys');
    }
    const alias = aliases.get(name);
    if (alias?.typeParameters?.length) {
      const next = new Map(bindings);
      alias.typeParameters.forEach((parameter, i) => next.set(parameter.name.text, convert(node.typeArguments[i], bindings)));
      return convert(alias.type, next);
    }
    if (!alias && !schemas[name]) throw new Error('Unknown type: ' + name);
    ensureAlias(name);
    return ref(name);
  }
  if (node.kind === ts.SyntaxKind.StringKeyword) return { type: 'string' };
  if (node.kind === ts.SyntaxKind.NumberKeyword) return { type: 'number' };
  if (node.kind === ts.SyntaxKind.BooleanKeyword) return { type: 'boolean' };
  throw new Error('Unsupported TypeScript type: ' + node.getText(source));
}
const building = new Set();
function ensureAlias(name) {
  const alias = aliases.get(name);
  if (!alias || alias.typeParameters?.length || schemas[name]) return;
  if (building.has(name)) throw new Error('Cyclic alias: ' + name);
  building.add(name);
  schemas[name] = convert(alias.type);
  building.delete(name);
}
for (const name of aliases.keys()) ensureAlias(name);

function schemaBranch(schema, kind) {
  const value = dereference(schema);
  return value.type === kind ? value : value.anyOf?.map(dereference).find(child => child.type === kind);
}
function refine(type, field, change) {
  const object = schemaBranch(schemas[type], 'object');
  if (!object?.properties[field]) throw new Error(`Unknown refinement ${type}.${field}`);
  const original = object.properties[field];
  const target = original.anyOf ? original.anyOf.find(child => child.type !== 'null') : original;
  Object.assign(target, change);
}
const lengths = {
  CommunityUpdateInput: { description: [10, 1000] }, CommunityUpdateDecision: { reason: [5, 1000], publicSummary: [1, 500] },
  ActivityInput: { title: [5, 150], description: [20, 2000], accessibilityNotes: [0, 1000], wasteHandoverPlan: [0, 1000] },
  ActivityResultInput: { description: [20, 2000] }, ActivityResultDecision: { reason: [5, 1000], publicSummary: [1, 500] },
  MeasurementInput: { sourceReference: [1, 150] }, MeasurementDecisionInput: { reason: [5, 1000] }, MeasurementCorrectionInput: { reason: [5, 1000] },
  EvidenceApprovalInput: { reason: [5, 1000] }, InstagramCreateInput: { caption: [1, 2200], altText: [1, 1000] }, InstagramEditInput: { caption: [1, 2200], altText: [1, 1000] },
  ReasonInput: { reason: [5, 1000] }, WithdrawalInput: { reason: [5, 1000] }, ManualConfirmationInput: { explanation: [20, 1000] },
  MembershipDecisionInput: { reason: [5, 1000] }, ActivityCommandInput: { reason: [5, 1000] },
  PublicationSettingsInput: { captionTemplate: [0, 1800], hashtags: [0, 400] }, PublicationSettings: { captionTemplate: [0, 1800], hashtags: [0, 400] },
};
for (const [type, fields] of Object.entries(lengths)) for (const [field, [minLength, maxLength]] of Object.entries(fields)) refine(type, field, { minLength, maxLength });
refine('CommunityUpdateInput', 'mediaIds', { maxItems: 3, uniqueItems: true });
for (const type of ['ConsentInput', 'MediaConsents', 'EvidencePublicationInput']) refine(type, 'channels', { maxItems: 2, uniqueItems: true });
refine('EvidencePublicationInput', 'channels', { minItems: 1 });
for (const type of ['CommunityUpdateDecision', 'ActivityResultDecision']) {
  refine(type, 'requestedEvidence', { maxItems: 3, items: { type: 'string', minLength: 1, maxLength: 300 } });
  refine(type, 'publicEvidenceApprovals', { maxItems: type === 'CommunityUpdateDecision' ? 3 : 6 });
}
refine('ActivityInput', 'capacity', { type: 'integer', minimum: 1, maximum: 200 });
refine('PublicActivity', 'capacity', { type: 'integer', minimum: 1, maximum: 200 });
refine('ActivityInput', 'equipment', { maxItems: 15, items: { type: 'string', minLength: 1, maxLength: 200 } });
const meeting = schemaBranch(schemas.ActivityInput.properties.meetingPoint, 'object');
Object.assign(meeting.properties.instructions, { minLength: 1, maxLength: 1000 });
for (const [name, minimum, maximum] of [['latitude', -90, 90], ['longitude', -180, 180]]) Object.assign(schemaBranch(meeting.properties[name], 'number'), { minimum, maximum });
for (const [field, minItems] of [['beforeMediaIds', 0], ['beforePublicEvidenceIds', 0], ['afterMediaIds', 1]]) refine('ActivityResultInput', field, { minItems, maxItems: 3, uniqueItems: true });
for (const type of ['MeasurementInput', 'MeasurementCorrectionInput', 'ImpactMeasurement']) refine(type, 'valueKg', { minimum: 0, maximum: 100000, multipleOf: 0.001 });
for (const type of ['MeasurementInput', 'MeasurementCorrectionInput', 'ManualConfirmationInput']) refine(type, 'evidenceMediaIds', { minItems: 1, maxItems: 3, uniqueItems: true });
refine('EvidenceRenditionInput', 'redactions', { maxItems: 20 });
for (const field of ['x', 'y']) refine('Redaction', field, { minimum: 0, maximum: 1 });
for (const field of ['width', 'height']) refine('Redaction', field, { exclusiveMinimum: 0, maximum: 1 });
schemas.CommunityUpdateDecision['x-domain-rules'] = ['approve: publicSummary non-null; request_evidence: requestedEvidence 1–3; approve/reject: requestedEvidence empty; reject/request_evidence: publicSummary null and approvals empty'];
schemas.ActivityResultDecision['x-domain-rules'] = ['approve: verifiedOutcome and publicSummary non-null; complete requires current approved after evidence; reject/request_evidence: verifiedOutcome/publicSummary null and approvals empty'];
schemas.ActivityInput['x-domain-rules'] = ['startsAt < endsAt; registrationClosesAt <= startsAt; coordinates paired; reportId immutable; publish validates source, accepted coordinator, schedule and handover plan'];
schemas.ActivityResultInput['x-domain-rules'] = ['1–3 combined beforeMediaIds/beforePublicEvidenceIds; before and after IDs disjoint; observedAt not future and not before activity startsAt'];
schemas.EvidenceApprovalInput['x-domain-rules'] = ['renditionId required non-null when approved=true; current relationship, ready rendition and active channel consent required'];
schemas.InstagramCreateInput['x-domain-rules'] = ['initial requires milestoneId=null; resolution requires approved milestone on this source; replacement points to latest cancelled/retracted generation'];
schemas.Redaction['x-domain-rules'] = ['x+width <= 1; y+height <= 1'];
schemas.ActivityCommandInput['x-domain-rules'] = ['hold/resume/cancel require reason 5–1000; other actions permit null'];

// Infer stable scalar formats in the new types, keeping category/H3 identifiers as taxonomy strings.
function enrich(schema, field = '') {
  if (!schema || schema.$ref) return;
  if (schema.type === 'string') {
    if ((field === 'id' || /Id$/.test(field)) && !['categoryId', 'cellId'].includes(field)) schema.format = 'uuid';
    if (/At$/.test(field) || ['from', 'to', 'asOf'].includes(field)) schema.format = 'date-time';
    if (['url', 'authorizationUrl', 'permalink'].includes(field)) schema.format = 'uri';
    if (['canonicalPath', 'targetPath'].includes(field)) schema.pattern = '^/';
    if (field === 'snapshotHash') { schema.pattern = '^[0-9a-f]{64}$'; schema.minLength = 64; schema.maxLength = 64; }
    if (field === 'cellId') schema.pattern = '^[0-9a-f]{15}$';
  }
  if (schema.type === 'number') {
    if (/revision$/i.test(field) || ['generation', 'scheduleRevision', 'attemptCount'].includes(field)) { schema.type = 'integer'; schema.minimum = field === 'attemptCount' ? 0 : 1; }
    else if (/Count$/.test(field) || ['total', 'availableSeats', 'supportCount', 'acceptedCount', 'resolvedIncidents', 'approvedActivities', 'volunteerAttendances', 'uniqueVolunteers', 'approvedResults', 'resultsWithVerifiedWeight'].includes(field)) { schema.type = 'integer'; schema.minimum = 0; }
    else if (['valueKg', 'collected', 'handedOver', 'recycled', 'medianResolutionHours'].includes(field)) schema.minimum = 0;
  }
  if (schema.items) { enrich(schema.items, /Ids$/.test(field) ? 'id' : field); }
  for (const [name, child] of Object.entries(schema.properties ?? {})) enrich(child, name);
  for (const child of schema.anyOf ?? []) enrich(child, field);
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') enrich(schema.additionalProperties, field);
}
for (const name of aliases.keys()) if (schemas[name]) enrich(schemas[name]);
// The anonymous measurement in result input shares the same validation as standalone measurement.
const nestedMeasurement = schemaBranch(schemas.ActivityResultInput.properties.measurement, 'object');
Object.assign(nestedMeasurement, structuredClone(dereference(schemas.MeasurementInput)));
const capabilityKeys = ['canCreateDraft', 'canPublish', 'canRetract', 'canConnect', 'canAutomate'];
schemas.InstagramOverview.properties.capabilityReasons = closedObject(Object.fromEntries(capabilityKeys.map(name => [name, { anyOf: [{ type: 'string' }, { type: 'null' }] }])));
schemas.ReviewRun.properties.requiresHumanReview = { type: 'boolean', const: true };
schemas.PublicIncident.properties.categoryId = { anyOf: [ref('CategoryId'), { type: 'null' }] };
for (const name of schemas.PublicationStatus.enum) schemas.InstagramOverview.properties.stats.properties.byStatus.properties[name] = { type: 'integer', minimum: 0 };
schemas.InstagramOverview['x-domain-rules'] = ['stats.byStatus includes all eight states; stats.total equals their sum; capability fields represent server readiness, not merely credential presence'];
schemas.ActionPermission['x-domain-rules'] = ['allowed=true requires reasonCode=null; denied actions carry a safe reasonCode'];

function tableCells(line) {
  let inCode = false, value = '', cells = [];
  for (const character of line.slice(1, -1)) {
    if (character === '`') inCode = !inCode;
    if (character === '|' && !inCode) { cells.push(value.trim()); value = ''; } else value += character;
  }
  cells.push(value.trim()); return cells;
}
const rows = markdown.split('\n').filter(line => /^\| (GET|POST|PUT|PATCH|DELETE) `\//.test(line)).map(line => {
  const [route, permission, request, response] = tableCells(line);
  const match = /^(GET|POST|PUT|PATCH|DELETE) `([^`]+)`$/.exec(route);
  return { method: match[1].toLowerCase(), path: match[2], permission, request, response };
});
rows.push(
  { method: 'put', path: '/activities/{id}/coordinator-acceptance', permission: 'V, calon koordinator, IM', request: 'CoordinatorAcceptanceInput', response: '200 ManagedActivity' },
  { method: 'put', path: '/activities/{id}/schedule-acknowledgement', permission: 'U, accepted member', request: 'ScheduleAcknowledgementInput', response: '200 Membership' },
  { method: 'get', path: '/publication-assets/{id}', permission: 'signed poster delivery', request: 'token', response: '302 signed approved poster' },
);
const requestByRoute = {
  'put /public/incidents/{id}/support': 'SupportInput', 'put /public/incidents/{id}/follow': 'FollowInput',
  'put /media/{mediaId}/consents': 'ConsentInput', 'put /admin/reports/{reportId}/media/{mediaId}/approvals': 'EvidenceApprovalInput',
  'post /admin/media/{mediaId}/renditions': 'EvidenceRenditionInput', 'post /admin/reviews': 'ReviewInput',
  'post /activities/{id}/commands': 'ActivityCommandInput', 'put /activities/{id}/membership': 'MembershipInput',
  'patch /activities/{id}/memberships/{membershipId}': 'MembershipDecisionInput', 'put /activities/{id}/memberships/{membershipId}/attendance': 'AttendanceInput',
  'put /activities/{id}/coordinator-acceptance': 'CoordinatorAcceptanceInput', 'put /activities/{id}/schedule-acknowledgement': 'ScheduleAcknowledgementInput',
  'post /admin/measurements/{id}/decisions': 'MeasurementDecisionInput', 'patch /admin/measurements/{id}': 'MeasurementCorrectionInput',
  'post /activities/{id}/measurements': 'MeasurementInput', 'put /users/me/notifications/{id}/read': 'NotificationReadInput',
  'post /admin/instagram/posts': 'InstagramCreateInput', 'patch /admin/instagram/posts/{id}': 'InstagramEditInput',
  'post /admin/instagram/posts/{id}/approve': 'InstagramApproveInput', 'post /admin/instagram/posts/{id}/publish': 'EmptyInput',
  'post /admin/instagram/posts/{id}/cancel': 'ReasonInput', 'post /admin/instagram/posts/{id}/retract': 'ReasonInput',
  'post /admin/instagram/operations/{id}/retry': 'EmptyInput', 'post /admin/instagram/operations/{id}/manual-confirmation': 'ManualConfirmationInput',
  'put /admin/instagram/settings': 'PublicationSettingsInput', 'post /admin/instagram/account/disconnect': 'DisconnectInput',
  'post /admin/reports/{id}/withdraw': 'WithdrawalInput', 'post /admin/reports/{id}/restore-publication': 'WithdrawalInput',
};
const pageTypes = {
  'PublicTimelineEvent': 'PublicIncidentTimelinePage', 'FollowedIncident': 'FollowedIncidentPage', 'CommunityUpdate': 'CommunityUpdatePage', 'EvidenceRendition': 'EvidenceRenditionPage',
  'ReviewRun': 'ReviewRunPage', 'ReviewQueueItem': 'ReviewQueuePage', 'PublicActivity': 'PublicActivityPage', 'MyActivity': 'MyActivityPage',
  'ManagedActivity': 'ManagedActivityPage', 'ManagedMembership': 'ManagedMembershipPage', 'PublicActivityResult': 'PublicActivityResultPage', 'ImpactMeasurement': 'ImpactMeasurementPage', 'Notification': 'NotificationPage',
};
const controllerFiles = ['apps/api/src/community/community.controller.ts', 'apps/api/src/evidence/evidence.controller.ts', 'apps/api/src/activities/activities.controller.ts', 'apps/api/src/publications/publications.controller.ts'];
const handlers = [];
function decorators(node) { return ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : []; }
function calledDecorator(node, name) { return decorators(node).map(d => d.expression).find(d => ts.isCallExpression(d) && d.expression.getText() === name); }
for (const file of controllerFiles) {
  const code = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const declaration of code.statements.filter(ts.isClassDeclaration)) {
    const controller = calledDecorator(declaration, 'Controller'); if (!controller) continue;
    const prefix = controller.arguments[0]?.text ?? '';
    for (const method of declaration.members.filter(ts.isMethodDeclaration)) {
      const route = decorators(method).map(d => d.expression).find(d => ts.isCallExpression(d) && ['Get', 'Post', 'Put', 'Patch', 'Delete'].includes(d.expression.getText()));
      if (!route) continue;
      const verb = route.expression.getText().toLowerCase();
      const fullPath = '/' + [prefix, route.arguments[0]?.text ?? ''].filter(Boolean).join('/').replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '{$1}');
      const params = method.parameters.flatMap(parameter => decorators(parameter).map(d => d.expression)).filter(ts.isCallExpression);
      const headerNames = params.filter(p => p.expression.getText() === 'Headers').map(p => p.arguments[0]?.text?.toLowerCase());
      handlers.push({ method: verb, path: fullPath, file, handler: declaration.name.text + '.' + method.name.getText(code), successStatus: Number(calledDecorator(method, 'HttpCode')?.arguments[0]?.text ?? (verb === 'post' ? 201 : 200)), headers: headerNames });
    }
  }
}
const normalizePath = value => value.replace(/\{[^}]+\}/g, '{}');
const matchHandler = row => handlers.find(handler => handler.method === row.method && normalizePath(handler.path) === normalizePath(row.path));
const header = (name, schema, description) => ({ name, in: 'header', required: true, schema, description });
const pageParameters = [{ name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } }, { name: 'cursor', in: 'query', required: false, schema: { type: 'string', maxLength: 1024 }, description: 'Opaque signed cursor bound to filters. Preserve verbatim; null nextCursor ends pagination.' }];
const query = (name, schema, required = false) => ({ name, in: 'query', required, schema });
const uuidSchema = { type: 'string', format: 'uuid' };
const dateSchema = { type: 'string', format: 'date-time' };
const responseHeaders = { 'X-Contract-Version': { $ref: '#/components/headers/ContractVersion' }, 'Cache-Control': { schema: { type: 'string', const: 'no-store' } } };
const errorDescriptions = { 400: 'Invalid body, header, query or cursor', 401: 'Active session required', 403: 'Role, relationship, email verification or CSRF denied', 404: 'Missing resource or inaccessible private resource', 409: 'Revision, idempotency, transition or source precondition conflict', 410: 'Previously public incident withdrawn; no historic content returned', 422: 'Evidence, consent, rendition or measurement invalid', 429: 'Rate limited; respect Retry-After', 500: 'Unexpected server error', 503: 'Feature disabled or dependency unavailable' };
function responseType(row) {
  if (row.response.includes('302')) return null;
  if (row.path === '/public/incidents/{id}') return 'PublicIncidentResult';
  if (row.path === '/activities/{id}') return 'PublicActivityDetail';
  if (row.path === '/admin/activity-coordinator-candidates') return 'CoordinatorCandidatePage';
  if (row.path === '/admin/instagram/account/authorization') return 'AuthorizationResponseData';
  if (row.response.includes('{ url, expiresAt }')) return 'MediaUrl';
  const quoted = [...row.response.matchAll(/`([^`]+)`/g)].map(match => match[1]);
  const name = quoted[0] ?? row.response.replace(/^\d+\s+/, '').split(' ')[0];
  if (name.startsWith('Page<')) { const item = name.slice(5, -1); if (!pageTypes[item]) throw new Error('Unknown page type: ' + item); return pageTypes[item]; }
  if (!schemas[name]) throw new Error('Unknown response: ' + JSON.stringify(row));
  return name;
}
const operationInventory = [];
for (const row of rows) {
  const handler = matchHandler(row); if (!handler) throw new Error('Missing route declaration: ' + row.method + ' ' + row.path);
  const status = Number(row.response.slice(0, 3));
  if (status !== 302 && status !== handler.successStatus) throw new Error('HTTP status differs: ' + handler.handler);
  const isPublic = row.permission === 'P' || row.path.startsWith('/publication-assets/');
  const parameters = [...row.path.matchAll(/\{([^}]+)\}/g)].map(match => ({ name: match[1], in: 'path', required: true, schema: uuidSchema }));
  if (/limit\/cursor/.test(row.request)) parameters.push(...structuredClone(pageParameters));
  if (row.method !== 'get') parameters.push(header('X-CSRF-Token', { type: 'string' }, 'Signed token from GET /auth/csrf, matching SAP CSRF cookie.'));
  if (handler.headers.includes('idempotency-key')) parameters.push(header('Idempotency-Key', uuidSchema, 'One UUID per human intent. Retry identical body/revision using the same key.'));
  if (handler.headers.includes('if-match')) parameters.push(header('If-Match', { type: 'string', pattern: '^[1-9][0-9]*$' }, 'Current resource revision as a positive integer string without quotes.'));
  if (row.path === '/admin/review-queue') parameters.push(query('type', { type: 'string', enum: ['all', 'report', 'community_update', 'activity_result'], default: 'all' }));
  if (row.path === '/admin/reviews' && row.method === 'get' || row.path === '/admin/media/{mediaId}/renditions' && row.method === 'get') parameters.push(query('subjectType', ref('ReviewSubjectType'), true), query('subjectId', uuidSchema, true));
  if (row.path === '/users/me/community-updates') parameters.push(query('status', { type: 'string', enum: ['submitted', 'needs_evidence', 'approved', 'rejected'] }));
  if (row.path === '/activities' || row.path === '/impact/summary') parameters.push(query('cellId', { type: 'string', pattern: '^[0-9a-f]{15}$' }), query('from', dateSchema, row.path.startsWith('/impact')), query('to', dateSchema, row.path.startsWith('/impact')));
  if (row.path === '/activities') parameters.push(query('availableOnly', { type: 'boolean', default: false }));
  if (row.path === '/admin/activities') parameters.push(query('status', ref('ActivityStatus')), query('reportId', uuidSchema));
  if (row.path === '/admin/activity-coordinator-candidates') parameters.push(query('search', { type: 'string', minLength: 3, maxLength: 100 }, true));
  if (row.path === '/activities/{id}/memberships') parameters.push(query('status', { type: 'string', enum: ['requested', 'accepted', 'waitlisted', 'rejected', 'cancelled'] }));
  if (row.path === '/users/me/notifications') parameters.push(query('unreadOnly', { type: 'boolean', default: false }));
  if (row.path === '/admin/instagram/posts' && row.method === 'get') parameters.push(query('status', { type: 'string', enum: ['all', ...schemas.PublicationStatus.enum], default: 'all' }), query('search', { type: 'string', maxLength: 150 }), query('period', { type: 'string', enum: ['all', '7d', '30d'], default: 'all' }));
  if (row.path.endsWith('/account/callback')) parameters.push(query('code', { type: 'string' }, true), query('state', { type: 'string' }, true));
  if (row.path.startsWith('/publication-assets/')) parameters.push(query('token', { type: 'string' }, true));
  const op = { operationId: 'r1' + handler.handler.replace(/(^|\.)([a-z])/gi, (_, dot, c) => c.toUpperCase()), summary: handler.handler, tags: [row.path.includes('instagram') || row.path.includes('publication') ? 'r1-publications' : row.path.includes('activities') || row.path.includes('measurements') || row.path.includes('impact') ? 'r1-activities' : row.path.includes('media') ? 'r1-evidence' : 'r1-community'], security: isPublic ? [] : [{ sessionCookie: [], ...(row.method === 'get' ? {} : { csrfHeader: [] }) }], parameters, responses: {}, 'x-contract-stage': 'draft', 'x-runtime-readiness': 'unverified', 'x-authorization-policy': row.permission, 'x-implementation-handler': handler.handler, 'x-implementation-file': handler.file };
  if (row.permission.startsWith('A')) op['x-required-role'] = 'admin';
  if (row.permission.startsWith('V')) op['x-email-verified'] = true;
  const type = responseType(row);
  if (type) {
    const name = type + 'R1Response';
    schemas[name] ??= closedObject({ data: ref(type), meta: ref('Meta') });
    op.responses[status] = { description: status === 202 ? 'Accepted durable intent; not proof of completion' : 'Success', headers: responseHeaders, content: { 'application/json': { schema: ref(name) } } };
  } else op.responses[302] = { description: row.path.startsWith('/publication-assets') ? 'Redirect to approved short-lived poster only; never raw evidence' : 'Redirect to allowlisted dashboard connection result; no JSON envelope or credentials', headers: { ...responseHeaders, Location: { required: true, schema: { type: 'string' } } } };
  for (const [code, description] of Object.entries(errorDescriptions)) op.responses[code] = { description, headers: { ...responseHeaders, ...(code === '429' ? { 'Retry-After': { schema: { type: 'integer', minimum: 1 } } } : {}) }, content: { 'application/json': { schema: ref('ErrorEnvelope') } } };
  if (row.method !== 'get') {
    const typeName = requestByRoute[row.method + ' ' + row.path] ?? [...row.request.matchAll(/`([^`]+)`/g)].map(match => match[1]).find(name => schemas[name]);
    if (!typeName) throw new Error('Missing explicit request schema: ' + row.method + ' ' + row.path);
    op.requestBody = { required: typeName !== 'EmptyInput', content: { 'application/json': { schema: ref(typeName) } } };
  }
  spec.paths[row.path] ??= {};
  spec.paths[row.path][row.method] = op;
  operationInventory.push({ method: row.method.toUpperCase(), path: row.path, handler: handler.handler, source: handler.file, successStatus: status, schemaState: 'draft', handlerState: 'implemented', runtimeState: 'not_verified' });
}
// Existing operations gain only the R1 request delta in this draft copy.
schemas.DecisionInput.properties.resolutionEvidenceIds = { type: 'array', items: uuidSchema, minItems: 1, maxItems: 3, uniqueItems: true };
schemas.DecisionInput.properties.publicEvidenceApprovals = { type: 'array', items: ref('EvidencePublicationInput'), maxItems: 3 };
schemas.DecisionInput['x-domain-rules'] = ['resolved requires exactly one evidence path; verified→resolved only approved resolution evidence; every claim current, same source, non-revoked and not older than latest accepted observation'];
const purposes = ['scan', 'report', 'resolution', 'avatar', 'community', 'activity_evidence'];
if (schemas.Media.properties.purpose) schemas.Media.properties.purpose.enum = purposes;
const upload = spec.paths['/media'].post.requestBody.content['multipart/form-data'].schema;
if (upload.properties?.purpose) upload.properties.purpose.enum = purposes;
spec.info.version = '1.2.0';
spec.info.description = 'DRAFT R1 target 1.2.0: community, human review, volunteer activities, evidence/impact and Instagram operations. Copied baseline 1.1.0 is preserved. Source handlers are implemented, but database/provider/runtime behaviour has not been verified and feature flags default disabled. Not the published runtime contract.';
spec['x-contract-stage'] = 'draft';
spec['x-published-contract-version'] = published.info.version;
spec['x-current-runtime-header-version'] = published.info.version;
spec['x-target-contract-version'] = '1.2.0';
spec['x-promotion-required'] = ['Schema/handler review', 'Authorized runtime and contract verification', 'Migration rehearsal', 'Generated frontend types and adapter synchronization', 'Coordinated published schema/runtime header promotion'];
spec['x-domain-reference'] = 'docs/CONTRACT_ZAKA_ZAMANI.md';

const output = path.join(root, 'contracts/r1');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'openapi.json'), JSON.stringify(spec, null, 2) + '\n');
const fileHash = file => crypto.createHash('sha256').update(read(file)).digest('hex');
const manifest = {
  schemaVersion: 'sap-r1-readiness-v1', stage: 'draft', targetVersion: '1.2.0', publishedVersion: published.info.version,
  runtimeHeaderVersion: published.info.version, handlersImplemented: true, runtimeVerified: false, providerVerified: false,
  migrationsApplied: false, fixtures: { synthetic: true, productionData: false, file: 'contracts/r1/fixtures.json' },
  flagDefaults: { SAP_EXTENSION_ENABLED: false, SAP_COMMUNITY_ENABLED: false, SAP_ACTIVITIES_ENABLED: false, SAP_HERMES_ENABLED: false, SAP_INSTAGRAM_ENABLED: false, SAP_INSTAGRAM_PUBLISH_ENABLED: false, META_DELETE_ENABLED: false },
  runtimeFlagState: 'not_inspected', flagsDisabledByDefault: true,
  hashes: { publishedOpenApi: fileHash('contracts/openapi.json'), sharedContract: fileHash('docs/CONTRACT_ZAKA_ZAMANI.md') },
  newOperationCount: operationInventory.length, newOperations: operationInventory,
  promotionRequired: spec['x-promotion-required'],
  limitations: ['Presence of a source handler is not proof of correct runtime behaviour.', 'No tests, live provider calls, database migrations or server route checks were run by this generator.', 'Keep existing published contract and generated web client on 1.1.0 until a coordinated promotion.'],
};
fs.writeFileSync(path.join(output, 'readiness.json'), JSON.stringify(manifest, null, 2) + '\n');

// Development examples are deterministic, synthetic and carry no live sessions, tokens or private URLs.
const syntheticId = seed => {
  const bytes = crypto.createHash('sha256').update(seed).digest(); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.subarray(0, 16).toString('hex'); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
function example(schema, field = '', trail = '') {
  if (schema.$ref) return example(schemas[schema.$ref.split('/').at(-1)], field, trail);
  if (schema.anyOf) return example(schema.anyOf.find(item => item.type === 'null') ?? schema.anyOf[0], field, trail);
  if (Object.hasOwn(schema, 'const')) return schema.const;
  if (schema.enum) return schema.enum[0];
  if (schema.type === 'object') {
    if (schema.properties?.allowed && schema.properties?.reasonCode) return { allowed: false, reasonCode: 'FEATURE_UNAVAILABLE' };
    return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([name, child]) => [name, example(child, name, trail + '.' + name)]));
  }
  if (schema.type === 'array') return Array.from({ length: schema.minItems ?? 0 }, (_, i) => example(schema.items, field, trail + '.' + i));
  if (schema.type === 'null') return null;
  if (schema.type === 'boolean') return false;
  if (schema.type === 'number' || schema.type === 'integer') return schema.minimum ?? 0;
  if (schema.type === 'string') {
    if (schema.format === 'uuid') return syntheticId(trail);
    if (schema.format === 'date-time') return '2026-10-03T02:15:00.000Z';
    if (schema.format === 'uri') return 'https://assets.example.invalid/synthetic-preview.jpg';
    if (field === 'cellId') return '8928308280fffff';
    if (field === 'snapshotHash') return '0'.repeat(64);
    if (schema.pattern === '^/') return '/synthetic-example';
    const label = 'DATA CONTOH SINTETIS'; return label.slice(0, schema.maxLength ?? label.length).padEnd(schema.minLength ?? 0, 'x');
  }
  throw new Error('Unsupported fixture schema');
}
const samples = Object.fromEntries([...aliases.keys()].filter(name => schemas[name]).map(name => [name, example(schemas[name], '', name)]));
const reportId = syntheticId('scenario.report'), activityId = syntheticId('scenario.activity'), mediaId = syntheticId('scenario.media');
Object.assign(samples.PublicIncident, { id: reportId, title: 'DATA CONTOH: sampah perlu ditangani', summary: 'Contoh laporan sintetis untuk pengembangan antarmuka.', categoryId: 'plastic', supportCount: 7, relatedActivityIds: [activityId], canonicalPath: `/incidents/${reportId}` });
Object.assign(samples.PublicIncident.area, { label: 'Area contoh sintetis' });
Object.assign(samples.CommunityUpdate, { id: syntheticId('scenario.update'), reportId, kind: 'looks_clean', description: 'DATA CONTOH: pengamatan sintetis tanpa foto tambahan.', status: 'submitted', mediaIds: [], correctionField: null, approvedResolutionEvidence: [] });
Object.assign(samples.CommunityUpdateDecision, { action: 'approve', publicSummary: 'DATA CONTOH: pembaruan kondisi sintetis telah ditinjau.', requestedEvidence: [], publicEvidenceApprovals: [] });
Object.assign(samples.ActivityResultInput, { beforeMediaIds: [syntheticId('request.before')], beforePublicEvidenceIds: [], description: 'DATA CONTOH: hasil kegiatan sintetis dengan pengamatan sebagian.' });
Object.assign(samples.ActivityResultDecision, { action: 'approve', verifiedOutcome: 'partial', publicSummary: 'DATA CONTOH: penanganan sebagian; kejadian tetap terbuka.', requestedEvidence: [], publicEvidenceApprovals: [] });
Object.assign(samples.ReviewRun, { id: syntheticId('scenario.review'), subjectType: 'community_update', subjectId: samples.CommunityUpdate.id, reportId, status: 'queued', result: null, errorCode: null, finishedAt: null, modelVersion: 'synthetic-not-configured', policyVersion: 'sap-moderation-r1' });
Object.assign(samples.PublicActivity, { id: activityId, reportId, title: 'DATA CONTOH: kegiatan warga', description: 'Kegiatan sintetis untuk pengembangan tampilan.', coordinatorDisplayName: 'Koordinator SAP', capacity: 10, acceptedCount: 3, availableSeats: 7, registrationOpen: true, canonicalPath: `/activities/${activityId}` });
Object.assign(samples.ImpactSummary, { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z', resolvedIncidents: 2, approvedActivities: 1, volunteerAttendances: 3, uniqueVolunteers: 3, medianResolutionHours: 20, verifiedKg: { collected: 12.5, handedOver: null, recycled: null }, measurementCoverage: { approvedResults: 1, resultsWithVerifiedWeight: 1 } });
Object.assign(samples.InstagramOverview, { account: { username: null, status: 'disconnected' }, capabilities: Object.fromEntries(capabilityKeys.map(name => [name, false])), capabilityReasons: Object.fromEntries(capabilityKeys.map(name => [name, 'FEATURE_UNAVAILABLE'])) });
Object.assign(samples.InstagramPost.source, { reportId, mediaId, title: 'DATA CONTOH: kejadian lingkungan', categoryName: 'Plastik', publicSummary: 'Contoh sintetis untuk preview pengembangan.' });
Object.assign(samples.InstagramPost, { caption: 'DATA CONTOH SINTETIS — bukan laporan atau post nyata.', altText: 'Contoh sintetis poster SAP.', publishedAt: null, retractedAt: null, permalink: null, publishError: null, lastOperationId: null });
samples.InstagramPost.rendition = { id: syntheticId('scenario.rendition'), revision: 1, templateVersion: 'sap-report-feed-v1', status: 'queued', url: null, expiresAt: null };
samples.InstagramPost.approval = { status: 'unapproved', contentRevision: null, sourceRevision: null, renditionId: null, approvedAt: null };
Object.assign(samples.PublicationOperation, { postId: samples.InstagramPost.id, status: 'queued', channels: { sap: 'unaffected', instagram: 'pending' }, errorCode: null, message: 'DATA CONTOH: operasi menunggu worker.', attemptCount: 0, nextRetryAt: null });
const fixtures = { schemaVersion: 'sap-r1-synthetic-fixtures-v1', synthetic: true, productionData: false, targetContractVersion: '1.2.0', runtimeVerified: false,
  warning: 'Development/mock examples only. Never substitute these records after a real API error or show them as live reports.',
  dtoSamples: samples,
  scenarios: {
    publicIncident: { data: samples.PublicIncident, meta: { requestId: syntheticId('request.incident') } },
    communityAwaitingHumanReview: { data: samples.CommunityUpdate, meta: { requestId: syntheticId('request.update') } },
    hermesQueued: { data: samples.ReviewRun, meta: { requestId: syntheticId('request.review') } },
    activityRegistration: { data: samples.PublicActivity, meta: { requestId: syntheticId('request.activity') } },
    evidenceBasedImpact: { data: samples.ImpactSummary, meta: { requestId: syntheticId('request.impact') } },
    instagramModuleDisabled: { error: { code: 'FEATURE_UNAVAILABLE', message: 'Fitur belum diaktifkan.' }, meta: { requestId: syntheticId('request.disabled') } },
    instagramDisconnected: { data: samples.InstagramOverview, meta: { requestId: syntheticId('request.overview') } },
    instagramDraftAwaitingRendition: { data: samples.InstagramPost, meta: { requestId: syntheticId('request.post') } },
    instagramOperationPending: { data: samples.PublicationOperation, meta: { requestId: syntheticId('request.operation') } },
  },
};
fs.writeFileSync(path.join(output, 'fixtures.json'), JSON.stringify(fixtures, null, 2) + '\n');
console.log(`Generated draft ${spec.info.version}: ${operationInventory.length} new operations, ${Object.keys(samples).length} synthetic DTO examples. Published contract unchanged.`);
