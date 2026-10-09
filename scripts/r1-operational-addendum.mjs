// SAP operations are staged in the R1 draft until the published contract is promoted.
export function addOperationalRoutes(spec) {
  const json = { type: 'object', additionalProperties: true };
  const page = { type: 'object', properties: { items: { type: 'array', items: json }, nextCursor: { anyOf: [{ type: 'string' }, { type: 'null' }] } }, required: ['items', 'nextCursor'] };
  const data = schema => ({ type: 'object', properties: { data: schema }, required: ['data'] });
  const response = schema => ({ description: 'Success', content: { 'application/json': { schema: data(schema) } } });
  const param = (name, where = 'path', schema = { type: 'string' }) => ({ name, in: where, required: where === 'path', schema });
  const id = param('id', 'path', { type: 'string', format: 'uuid' });
  const cellId = param('cellId', 'path', { type: 'string', pattern: '^[0-9a-f]{15}$' });
  const pagination = [param('limit', 'query', { type: 'integer', minimum: 1, maximum: 50 }), param('cursor', 'query')];
  const body = schema => ({ required: true, content: { 'application/json': { schema } } });
  const mutateHeaders = [param('idempotency-key', 'header', { type: 'string', format: 'uuid' })];
  const revisionHeaders = [param('if-match', 'header', { type: 'integer', minimum: 1 })];
  const str = { type: 'string' };
  const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
  const closed = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
  const role = { type: 'string', enum: ['user', 'admin'] };
  const status = { type: 'string', enum: ['submitted', 'verified', 'in_progress', 'resolved', 'rejected', 'duplicate'] };
  const bool = { type: 'boolean' };
  const uuid = { type: 'string', format: 'uuid' };
  const date = { type: 'string', format: 'date-time' };
  const route = (method, path, name, access, parameters = [], requestBody, schema = json, contentType = 'application/json') => {
    const operation = {
      operationId: name, summary: name, tags: ['r1-operations'],
      security: access === 'public' ? [] : [{ sessionCookie: [], ...(method === 'get' ? {} : { csrfHeader: [] }) }],
      parameters,
      responses: { '200': contentType === 'text/csv' ? { description: 'CSV export', content: { 'text/csv': { schema: { type: 'string' } } } } : response(schema) },
      'x-contract-stage': 'draft', 'x-runtime-readiness': 'implemented-locally-unverified-in-production',
      'x-authorization-policy': access,
    };
    if (requestBody) operation.requestBody = body(requestBody);
    spec.paths[path] ??= {};
    spec.paths[path][method] = operation;
  };
  route('get', '/admin/users', 'listOperationalUsers', 'admin', [...pagination, param('search', 'query')], undefined, page);
  route('put', '/admin/users/{id}/role', 'changeOperationalUserRole', 'admin recent reauthentication', [id, ...mutateHeaders], closed({ role, expectedRole: role, reason: str }));
  route('get', '/admin/report-operations', 'listOperationalReports', 'admin', [...pagination, param('status', 'query', status), param('assigneeId', 'query', uuid), param('overdue', 'query', bool)], undefined, page);
  route('put', '/admin/reports/{id}/assignment', 'setReportAssignment', 'admin', [id, ...revisionHeaders, ...mutateHeaders], closed({ assigneeId: nullable(uuid), dueAt: nullable(date), note: str }));
  route('post', '/admin/reports/{id}/evidence-requests', 'requestReporterEvidence', 'admin', [id, ...mutateHeaders], closed({ message: str }));
  route('get', '/admin/reports/pending-map', 'listPendingReportsMap', 'admin', [], undefined, closed({ items: { type: 'array', items: json }, truncated: bool }));
  route('get', '/admin/reports/export.csv', 'exportOperationalReports', 'admin', [param('status', 'query', status)], undefined, json, 'text/csv');
  route('get', '/admin/area-localities', 'listAdminLocalities', 'admin', [param('search', 'query')], undefined, closed({ items: { type: 'array', items: json } }));
  route('put', '/admin/areas/{cellId}/locality', 'setAdminLocality', 'admin', [cellId, ...mutateHeaders], closed({ kelurahan: str, kecamatan: str, city: str }));
  route('get', '/users/me/report-notification-preferences', 'getReportNotificationPreferences', 'session', [], undefined, closed({ emailEnabled: bool }));
  route('put', '/users/me/report-notification-preferences', 'setReportNotificationPreferences', 'verified session', [], closed({ emailEnabled: bool }), closed({ emailEnabled: bool }));
  route('get', '/users/me/report-assignments', 'listMyReportAssignments', 'session', [...pagination, param('status', 'query', status), param('overdue', 'query', bool)], undefined, page);
  route('put', '/users/me/report-assignments/{id}/progress', 'updateMyReportAssignment', 'verified assigned user', [id, ...revisionHeaders, ...mutateHeaders], closed({ progress: { type: 'string', enum: ['accepted', 'working', 'done'] }, note: str }));
  route('get', '/areas/{cellId}/locality', 'getAreaLocality', 'public', [cellId]);
  route('get', '/area-localities', 'listPublicLocalities', 'public', [param('cells', 'query')], undefined, closed({ items: { type: 'array', items: json } }));
}
