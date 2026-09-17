/** Mirrors the API's guest domain: accounts behind "try the demo" (identity/domain/guest.ts). */
export const GUEST_EMAIL_DOMAIN = 'guest.nexa.local';

export function isGuestEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`));
}
