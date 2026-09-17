/**
 * Guests are the accounts behind "try the demo": created with one click, placed in the demo
 * organization, and never meant to outlive the visit. They are told apart by the e-mail domain,
 * which nobody can register with - it isn't a real domain - so no column or migration is needed.
 */
export const GUEST_EMAIL_DOMAIN = 'guest.nexa.local';

export function isGuestEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);
}
