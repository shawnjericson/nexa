/** Only same-site paths, so a crafted ?next= link can't send people to another site. */
export function safeNextPath(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : '/home';
}
