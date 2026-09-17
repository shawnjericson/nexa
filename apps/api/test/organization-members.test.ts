import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { bearer, registerAndLogin } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';

const app = createApp({ prisma });

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

type MemberBody = {
  user: { id: string; display_name: string };
  departments: Array<{ id: string; name: string }>;
};

/**
 * The directory of an organization of thousands: searched, filtered and sorted by the API, one
 * page at a time, rather than sent whole for the browser to sift.
 */
describe('GET /organizations/:id/members', () => {
  async function company() {
    // The first to register owns the organization; the others join it, in this order.
    const owner = await registerAndLogin(app, { display_name: 'Trần Owner' });
    const anh = await registerAndLogin(app, { display_name: 'Nguyễn Văn Ánh' });
    const binh = await registerAndLogin(app, { display_name: 'Lê Thanh Bình' });
    const chi = await registerAndLogin(app, { display_name: 'Đặng Khánh Chi' });
    const organizationId = (
      await prisma.organization.findUniqueOrThrow({ where: { slug: 'nexa-test' } })
    ).id;
    const token = owner.accessToken;
    const department = await request(app)
      .post(`/api/v1/organizations/${organizationId}/departments`)
      .set(bearer(token))
      .send({ name: 'Kỹ thuật' });
    await request(app)
      .put(
        `/api/v1/organizations/${organizationId}/departments/${department.body.data.id}/members/${anh.user.id}`,
      )
      .set(bearer(token));
    const list = (query: Record<string, string | number>) =>
      request(app)
        .get(`/api/v1/organizations/${organizationId}/members`)
        .query(query)
        .set(bearer(anh.accessToken));
    return {
      organizationId,
      token,
      departmentId: department.body.data.id,
      owner,
      anh,
      binh,
      chi,
      list,
    };
  }

  const names = (res: request.Response) =>
    (res.body.data as MemberBody[]).map((member) => member.user.display_name);

  it('searches names without accents, by word prefixes, and counts only what matched', async () => {
    const { list } = await company();

    const nguyen = await list({ q: 'nguyen anh' });
    const prefix = await list({ q: 'kha' });
    const nothing = await list({ q: 'zzz' });
    const punctuation = await list({ q: '!!!' });

    expect(names(nguyen)).toEqual(['Nguyễn Văn Ánh']);
    expect(nguyen.body.pagination).toMatchObject({ total: 1, has_next: false });
    expect(names(prefix)).toEqual(['Đặng Khánh Chi']);
    expect(nothing.body).toMatchObject({ data: [], pagination: { total: 0 } });
    // Nothing to search for is not a search: everyone.
    expect(punctuation.body.pagination.total).toBe(4);
  });

  it('filters by department, or by being in none, and says which departments people are in', async () => {
    const { list, departmentId } = await company();

    const inDepartment = await list({ department_id: departmentId });
    const inNone = await list({ department_id: 'none', sort: 'name' });

    expect(names(inDepartment)).toEqual(['Nguyễn Văn Ánh']);
    expect(inDepartment.body.data[0].departments).toEqual([{ id: departmentId, name: 'Kỹ thuật' }]);
    expect(names(inNone)).toEqual(['Đặng Khánh Chi', 'Lê Thanh Bình', 'Trần Owner']);
    expect((inNone.body.data as MemberBody[]).every((m) => m.departments.length === 0)).toBe(true);
  });

  it('sorts by joining date either way, or by name, and pages through', async () => {
    const { list } = await company();

    const joined = await list({});
    const newest = await list({ sort: 'newest', limit: 2 });
    const byName = await list({ sort: 'name', limit: 2, page: 2 });

    expect(names(joined)).toEqual([
      'Trần Owner',
      'Nguyễn Văn Ánh',
      'Lê Thanh Bình',
      'Đặng Khánh Chi',
    ]);
    expect(names(newest)).toEqual(['Đặng Khánh Chi', 'Lê Thanh Bình']);
    expect(newest.body.pagination).toMatchObject({ total: 4, has_next: true });
    // Without accents: Dang, Le, Nguyen, Tran.
    expect(names(byName)).toEqual(['Nguyễn Văn Ánh', 'Trần Owner']);
  });

  it('rejects filters it does not understand', async () => {
    const { list } = await company();

    const sort = await list({ sort: 'salary' });
    const department = await list({ department_id: 'engineering' });

    expect(sort.status).toBe(400);
    expect(department.status).toBe(400);
  });
});

describe('GET /organizations/:id/members/:userId', () => {
  it('returns one member with role and departments, and 404 for anyone else', async () => {
    const owner = await registerAndLogin(app);
    const alice = await registerAndLogin(app);
    const organizationId = (
      await prisma.organization.findUniqueOrThrow({ where: { slug: 'nexa-test' } })
    ).id;
    const stranger = await prisma.user.create({
      data: {
        email: 'stranger@nexa.test',
        username: 'stranger',
        displayName: 'Stranger',
        passwordHash: '!',
      },
    });

    const member = await request(app)
      .get(`/api/v1/organizations/${organizationId}/members/${alice.user.id}`)
      .set(bearer(owner.accessToken));
    const missing = await request(app)
      .get(`/api/v1/organizations/${organizationId}/members/${stranger.id}`)
      .set(bearer(owner.accessToken));

    expect(member.status).toBe(200);
    expect(member.body.data).toMatchObject({
      user: { id: alice.user.id },
      role: 'MEMBER',
      status: 'ACTIVE',
      departments: [],
    });
    expect(missing.status).toBe(404);
  });
});
