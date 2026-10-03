import { fail } from './extension.store.js';
export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'VALIDATION_ERROR');
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).some(k => !keys.includes(k))) fail(400, 'VALIDATION_ERROR', 'Field tidak dikenal.');
  return obj;
}
export function text(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string') fail(400, 'VALIDATION_ERROR');
  const normalized = value.normalize('NFC').trim();
  if ([...normalized].length < min || [...normalized].length > max) fail(400, 'VALIDATION_ERROR');
  return normalized;
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) fail(400, 'VALIDATION_ERROR');
  return value.toLowerCase();
}
export function bool(value: unknown): boolean { if (typeof value !== 'boolean') fail(400,'VALIDATION_ERROR'); return value; }
export function enumeration<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) fail(400,'VALIDATION_ERROR'); return value as T;
}
export function integer(value: unknown, min=1, max=Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail(400,'VALIDATION_ERROR'); return value;
}
export function revision(header: unknown): number {
  if (typeof header !== 'string' || !/^[1-9]\d*$/.test(header)) fail(400,'VALIDATION_ERROR','If-Match revision diperlukan.');
  return integer(Number(header));
}
export function date(value: unknown, futureAllowed=false): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail(400,'VALIDATION_ERROR');
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (month! < 1 || month! > 12 || day! < 1 || day! > new Date(Date.UTC(year!, month!, 0)).getUTCDate()) fail(400,'VALIDATION_ERROR');
  if (!futureAllowed && Date.parse(value)>Date.now()) fail(400,'VALIDATION_ERROR'); return new Date(value).toISOString();
}
export function ids(value: unknown, min=0,max=3): string[] {
  if (!Array.isArray(value) || value.length<min || value.length>max) fail(400,'VALIDATION_ERROR');
  const result=value.map(uuid); if (new Set(result).size!==result.length) fail(400,'VALIDATION_ERROR'); return result;
}
export function strings(value: unknown,min=0,max=3,itemMax=300): string[] {
  if (!Array.isArray(value) || value.length<min || value.length>max) fail(400,'VALIDATION_ERROR'); return value.map(v=>text(v,1,itemMax));
}
export function checkRevision(actual: number, expected: number): void { if (actual!==expected) fail(409,'REVISION_CONFLICT'); }
