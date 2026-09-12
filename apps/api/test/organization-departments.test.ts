import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { bearer, registerAndLogin } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { createOrganization, createTeam, moveToNewOrganization } from './helpers/team';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function defaultOrganizationId() {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { slug: 'nexa-test' },
  });
  return organization.id;
}

const deptPath = (orgId: string, suffix = '') =>
  `/api/v1/organizations/${orgId}/departments${suffix}`;

async function createDepartment(token: string, orgId: string, name: string) {
  const res = await request(app).post(deptPath(orgId)).set(bearer(token)).send({ name });
  return res.body.data as { id: string };
}

describe('departments', () => {
  it('lets department managers create departments named in Vietnamese', async () => {
    const { owner, alice } = await createTeam(app);
    const id = await defaultOrganizationId();

    const created = await request(app)
      .post(deptPath(id))
      .set(bearer(owner.accessToken))
      .send({ name: 'Phòng Kỹ thuật', description: 'Engineering' });
    const byMember = await request(app)
      .post(deptPath(id))
      .set(bearer(alice.accessToken))
      .send({ name: 'Marketing' });
    const duplicate = await request(app)
      .post(deptPath(id))
      .set(bearer(owner.accessToken))
      .send({ name: 'phòng kỹ THUẬT' });
    const list = await request(app).get(deptPath(id)).set(bearer(alice.accessToken));

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      name: 'Phòng Kỹ thuật',
      slug: 'phong-ky-thuat',
      description: 'Engineering',
      member_count: 0,
    });
    expect(byMember.status).toBe(403);
    expect(byMember.body.code).toBe('PERMISSION_DENIED');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('DEPARTMENT_EXISTS');
    expect(list.body.data.map((d: { slug: string }) => d.slug)).toEqual(['phong-ky-thuat']);
  });

  it('adds and removes department members idempotently', async () => {
    const { owner, alice } = await createTeam(app);
    const id = await defaultOrganizationId();
    const department = await createDepartment(owner.accessToken, id, 'Sales');
    const memberPath = deptPath(id, `/${department.id}/members/${alice.user.id}`);

    const first = await request(app).put(memberPath).set(bearer(owner.accessToken));
    const again = await request(app).put(memberPath).set(bearer(owner.accessToken));
    const members = await request(app)
      .get(deptPath(id, `/${department.id}/members`))
      .set(bearer(alice.accessToken));
    const listed = await request(app).get(deptPath(id)).set(bearer(alice.accessToken));
    const removed = await request(app).delete(memberPath).set(bearer(owner.accessToken));
    const removedAgain = await request(app).delete(memberPath).set(bearer(owner.accessToken));
    const afterRemoval = await request(app)
      .get(deptPath(id, `/${department.id}/members`))
      .set(bearer(owner.accessToken));

    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(members.body.data).toEqual([
      expect.objectContaining({ id: alice.user.id, username: alice.input.username }),
    ]);
    expect(listed.body.data[0].member_count).toBe(1);
    expect(removed.status).toBe(200);
    expect(removedAgain.status).toBe(200);
    expect(afterRemoval.body.data).toEqual([]);
  });

  it('only places organization members in departments', async () => {
    const { owner } = await createTeam(app);
    const id = await defaultOrganizationId();
    const department = await createDepartment(owner.accessToken, id, 'Operations');
    const outsider = await registerAndLogin(app);
    await moveToNewOrganization(outsider.user.id, 'elsewhere');

    const res = await request(app)
      .put(deptPath(id, `/${department.id}/members/${outsider.user.id}`))
      .set(bearer(owner.accessToken));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MEMBER_NOT_FOUND');
  });

  it('drops department memberships when someone leaves the organization', async () => {
    const { owner, bob } = await createTeam(app);
    const id = await defaultOrganizationId();
    const department = await createDepartment(owner.accessToken, id, 'Support');
    await request(app)
      .put(deptPath(id, `/${department.id}/members/${bob.user.id}`))
      .set(bearer(owner.accessToken));

    await request(app)
      .delete(`/api/v1/organizations/${id}/members/${bob.user.id}`)
      .set(bearer(owner.accessToken));

    expect(await prisma.departmentMember.count({ where: { departmentId: department.id } })).toBe(0);
  });

  it('renames and deletes departments', async () => {
    const { owner } = await createTeam(app);
    const id = await defaultOrganizationId();
    const department = await createDepartment(owner.accessToken, id, 'Phòng Nhân sự');

    const renamed = await request(app)
      .put(deptPath(id, `/${department.id}`))
      .set(bearer(owner.accessToken))
      .send({ name: 'People Team' });
    const removed = await request(app)
      .delete(deptPath(id, `/${department.id}`))
      .set(bearer(owner.accessToken));
    const again = await request(app)
      .delete(deptPath(id, `/${department.id}`))
      .set(bearer(owner.accessToken));

    expect(renamed.body.data).toMatchObject({ name: 'People Team', slug: 'people-team' });
    expect(removed.body.data).toEqual({ id: department.id, deleted: true });
    expect(again.status).toBe(404);
    expect(again.body.code).toBe('DEPARTMENT_NOT_FOUND');
  });

  it('never reaches departments of another organization', async () => {
    const { owner } = await createTeam(app);
    const id = await defaultOrganizationId();
    const foreignOrganization = await createOrganization('foreign-company');
    const foreignDepartment = await prisma.department.create({
      data: { organizationId: foreignOrganization.id, name: 'Secret', slug: 'secret' },
    });

    const res = await request(app)
      .get(deptPath(id, `/${foreignDepartment.id}/members`))
      .set(bearer(owner.accessToken));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('DEPARTMENT_NOT_FOUND');
  });
});
