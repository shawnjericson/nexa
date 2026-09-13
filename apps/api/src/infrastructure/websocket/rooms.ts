// Every socket is authenticated for one organization and joins exactly these two rooms.

/** All sockets of one user within one organization (every device). */
export function userRoom(organizationId: string, userId: string): string {
  return `org:${organizationId}:user:${userId}`;
}

/** Everyone connected to an organization (presence updates). */
export function organizationRoom(organizationId: string): string {
  return `org:${organizationId}`;
}
