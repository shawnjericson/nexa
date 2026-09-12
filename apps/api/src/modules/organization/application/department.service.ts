import { slugify } from '../../../shared/utils/slug';
import type { OrganizationActor } from '../domain/organization-context';
import { OrganizationErrors } from '../domain/organization-errors';
import type {
  Department,
  DepartmentChanges,
  DepartmentRepository,
  MembershipRepository,
} from '../domain/ports';

/**
 * Deleting a department simply removes everyone from it; there is no fallback department
 * (risk register 6: "Department deleted").
 */
export class DepartmentService {
  constructor(
    private readonly deps: { departments: DepartmentRepository; members: MembershipRepository },
  ) {}

  list(actor: OrganizationActor): Promise<Department[]> {
    return this.deps.departments.list(actor.organization.organizationId);
  }

  async get(actor: OrganizationActor, id: string): Promise<Department> {
    const department = await this.deps.departments.findById(actor.organization.organizationId, id);
    if (!department) throw OrganizationErrors.departmentNotFound();
    return department;
  }

  create(
    actor: OrganizationActor,
    input: { name: string; description?: string | null },
  ): Promise<Department> {
    return this.deps.departments.create({
      organizationId: actor.organization.organizationId,
      name: input.name,
      slug: slugOf(input.name),
      description: input.description ?? null,
    });
  }

  async update(
    actor: OrganizationActor,
    id: string,
    input: { name?: string; description?: string | null },
  ): Promise<Department> {
    const changes: DepartmentChanges = {
      ...(input.name !== undefined && { name: input.name, slug: slugOf(input.name) }),
      ...(input.description !== undefined && { description: input.description }),
    };
    const department = await this.deps.departments.update(
      actor.organization.organizationId,
      id,
      changes,
    );
    if (!department) throw OrganizationErrors.departmentNotFound();
    return department;
  }

  async delete(actor: OrganizationActor, id: string): Promise<void> {
    const deleted = await this.deps.departments.delete(actor.organization.organizationId, id);
    if (!deleted) throw OrganizationErrors.departmentNotFound();
  }

  async listMemberIds(actor: OrganizationActor, id: string): Promise<string[]> {
    await this.get(actor, id);
    return this.deps.departments.listMemberIds(actor.organization.organizationId, id);
  }

  async addMember(actor: OrganizationActor, id: string, userId: string): Promise<void> {
    const organizationId = actor.organization.organizationId;
    await this.get(actor, id);
    if (!(await this.deps.members.findMember(organizationId, userId))) {
      throw OrganizationErrors.memberNotFound();
    }
    await this.deps.departments.addMember(organizationId, id, userId);
  }

  async removeMember(actor: OrganizationActor, id: string, userId: string): Promise<void> {
    await this.get(actor, id);
    await this.deps.departments.removeMember(actor.organization.organizationId, id, userId);
  }
}

function slugOf(name: string): string {
  const slug = slugify(name);
  if (!slug) throw OrganizationErrors.invalidDepartmentName();
  return slug;
}
