# Architecture Decision Records

ADR-001 to ADR-008 come from the NEXA v1 Architecture Specification (`docs/specs/`).
Every significant change to the architecture gets a new ADR here instead of silently changing the design.

| ADR                                                  | Decision                                                                      | Status                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 001                                                  | Modular monolith for v1                                                       | Accepted (spec)                                               |
| 002                                                  | PostgreSQL as the primary source of truth (PostgreSQL 18 on the VPS)          | Accepted (spec)                                               |
| 003                                                  | Multi-tenant organization / membership model                                  | Accepted (spec)                                               |
| 004                                                  | Short-lived JWT access tokens + rotating refresh tokens                       | Accepted (spec)                                               |
| 005                                                  | WebSocket for realtime communication                                          | Accepted (spec)                                               |
| 006                                                  | Redis for presence / cache / pub-sub / rate limiting                          | Accepted (spec); Redis 8 on the VPS over TLS, ACL user `nexa` |
| 007                                                  | Domain events for cross-module reactions                                      | Accepted (spec)                                               |
| 008                                                  | API versioning under `/api/v1`                                                | Accepted (spec)                                               |
| [009](009-mongodb-for-audit-and-event-log.md)        | MongoDB only for audit and event logs, never for business data                | Accepted                                                      |
| [010](010-exam-compatibility-layer.md)               | Exam compatibility routes and a unified error contract                        | Accepted                                                      |
| [011](011-shared-vps-databases.md)                   | Development uses the shared databases on the VPS                              | Accepted                                                      |
| [012](012-per-organization-roles-and-onboarding.md)  | Per-organization roles, composite FK, default-organization onboarding         | Accepted                                                      |
| [013](013-content-lifecycle-and-moderation.md)       | Organization context, soft delete, moderation rules, keyset pagination        | Accepted                                                      |
| [014](014-role-hierarchy-invitations-departments.md) | Role hierarchy, last-owner guard, invitations, departments, reactions         | Accepted                                                      |
| [015](015-chat-and-realtime.md)                      | Chat model, server-assigned seq, idempotent sends, per-user fan-out, presence | Accepted                                                      |
