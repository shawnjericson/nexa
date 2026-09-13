import { isApiError } from '@nexa/api-client';
import type { Translator } from '@/i18n/translate';

/** A safe, translated message for any failure (spec §12: normalize API errors into UI states). */
export function describeError(error: unknown, t: Translator): string {
  if (isApiError(error)) {
    return (
      t.tryT(`errors.codes.${error.code}`) ??
      (error.status >= 500 ? t.t('errors.generic') : error.message)
    );
  }
  if (error instanceof TypeError) return t.t('errors.network');
  return t.t('errors.generic');
}

/** Validation issues keyed by request field (`body.email` -> `email`). */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error)) return {};
  return Object.fromEntries(
    error.fieldIssues.map((issue) => [issue.field.replace(/^body\./, ''), issue.message]),
  );
}
