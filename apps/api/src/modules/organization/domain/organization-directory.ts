/** Public read contract of the Organization module for other modules. */
export interface OrganizationDirectory {
  /** The subset of `userIds` who are ACTIVE members of the organization. */
  findActiveMemberIds(organizationId: string, userIds: readonly string[]): Promise<Set<string>>;
  /** Every ACTIVE member, e.g. to announce something to the whole organization. */
  listActiveMemberIds(organizationId: string): Promise<string[]>;
}
