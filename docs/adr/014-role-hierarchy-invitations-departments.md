# ADR-014: Role hierarchy, invitations, departments and reactions

- Status: Accepted
- Date: 2026-09-12

## Context

Phase 3 lets organizations manage themselves: create organizations, change roles, suspend or
remove members, invite people and organize departments. The risk register flags privilege
escalation, the last owner leaving (P0), and invitation expiry and reuse (P1) as the dangerous
cases. It also calls for idempotent likes (7.2).

## Decision

1. **Permission plus rank.** Permissions decide _what_ you may do to members
   (`member.role.update`, `member.remove`, `member.invite`). The role rank
   OWNER > ADMIN > MANAGER > MEMBER decides _to whom_:
   - Only OWNERs may manage peers and grant OWNER.
   - Everybody else may only manage members ranked below them and grant roles below their own.
   - Changing your own role therefore needs to be an OWNER, and suspending yourself is refused.
2. **The last active OWNER is untouchable.** An OWNER cannot be demoted, suspended or removed, and
   cannot leave, while they are the only active OWNER.
   - Every membership change runs in a transaction holding `SELECT ... FOR UPDATE` on the
     organization row, and re-reads the actor's role under that lock.
   - So two owners demoting each other at the same moment end with exactly one owner.
3. **Invitations.**
   - The token is 256-bit and returned once; only its SHA-256 hash is stored.
   - It expires after 7 days and can only be accepted by the invited email address.
   - Acceptance is a conditional update inside the same lock, so it succeeds exactly once.
   - Re-inviting the same email revokes the previous pending invitation.
   - Revoked or expired invitations answer 410; used ones answer 409.
   - Email delivery comes later: for now the inviter shares the token.
4. **Departments.**
   - Slugs are derived from Vietnamese names ("Phòng Kỹ thuật" becomes `phong-ky-thuat`) and are
     unique per organization.
   - `department_members` has composite foreign keys to both `departments` and
     `organization_members`. Only members can be placed in a department, and leaving the
     organization removes department memberships automatically.
   - Deleting a department simply empties it; there is no fallback department.
5. **Role foreign keys use `ON DELETE NO ACTION`.** That constraint is checked at the end of the
   statement, so deleting an organization can cascade through roles, members and invitations.
6. **Reactions.**
   - `UNIQUE(post_id, user_id)` allows one reaction per person, and reacting again replaces the
     type.
   - A race on the first reaction is retried as an update.
   - Posts return per-type counts and the viewer's own reaction.
7. **Membership changes publish domain events**: `organization.member_invited`, `member_joined`,
   `member_updated` and `member_removed`. The audit log (Phase 6) will record them.

## Consequences

- Custom roles will need a rank. Until then, unknown roles rank below MEMBER.
- An organization is never left without someone who can administer it.
