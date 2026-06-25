// @json 컬럼 sanitizer — DB 원시값을 안전한 string[]로 정규화.
export function sanitizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}
