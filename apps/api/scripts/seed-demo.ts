/**
 * Fills an organization with believable demo content, so an empty NEXA has something to show.
 *
 *   pnpm --filter @nexa/api seed:demo -- --org nexa --yes
 *   pnpm --filter @nexa/api seed:demo -- --org nexa --yes --reset   # replace what it made before
 *
 * A demo that must not touch a real workspace gets an organization of its own, which is the
 * safest way to run this at all - nothing it writes can reach anyone else's tenant:
 *
 *   pnpm --filter @nexa/api seed:demo -- --org demo --create --name "NEXA Demo"  *     --owner you@example.com --yes
 *
 * Everything it creates is recognisable and reversible: demo people all have an e-mail at
 * DEMO_DOMAIN, and --reset removes exactly those people and everything they wrote. It never
 * touches anyone else's content, and it refuses to run without --yes so nobody seeds a real
 * workspace by reflex.
 *
 * Demo accounts get a random password unless SEED_PASSWORD is set; they exist to be seen in the
 * directory, the feed and the conversations, not to be signed in to.
 */
import { randomBytes } from 'node:crypto';
import { hash } from 'bcryptjs';
import { SYSTEM_ROLES } from '../src/modules/organization';
// The application's own client: it reads DATABASE_URL and the TLS settings the same way the
// server does, so seeding a remote database needs no connection handling of its own.
import { prisma } from '../src/infrastructure/database/prisma';

const DEMO_DOMAIN = 'demo.nexa.local';
/** Demo visitors ("try the demo"); --reset clears them along with the invented people. */
const GUEST_DOMAIN = 'guest.nexa.local';
/**
 * Pictures are served by the web app (apps/web/public/demo), so they need no storage, no third
 * party and no network at seed time. The paths are relative, which is what the web app renders.
 * Avatars: DiceBear "Notionists" by Zoish, CC0 1.0. Post images: drawn for these posts.
 */
const avatarOf = (username: string) => `/demo/avatars/${username}.svg`;
const postImage = (name: string) => `/demo/posts/${name}.svg`;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);

/** Deterministic pseudo-randomness: the same seed run twice reads the same, which helps review. */
let state = 42;
const random = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

const PEOPLE = [
  { username: 'an.nguyen', name: 'Nguyễn Hoài An', bio: 'Trưởng nhóm sản phẩm.', dept: 'san-pham' },
  {
    username: 'binh.tran',
    name: 'Trần Thanh Bình',
    bio: 'Backend, hay trực đêm.',
    dept: 'ky-thuat',
  },
  { username: 'chi.le', name: 'Lê Khánh Chi', bio: 'Thiết kế giao diện.', dept: 'san-pham' },
  {
    username: 'dung.pham',
    name: 'Phạm Tiến Dũng',
    bio: 'Hạ tầng và triển khai.',
    dept: 'ky-thuat',
  },
  { username: 'ha.vo', name: 'Võ Thu Hà', bio: 'Tuyển dụng và đào tạo.', dept: 'nhan-su' },
  {
    username: 'khanh.do',
    name: 'Đỗ Quốc Khánh',
    bio: 'Kinh doanh khu vực phía Nam.',
    dept: 'kinh-doanh',
  },
  {
    username: 'linh.bui',
    name: 'Bùi Mỹ Linh',
    bio: 'Nội dung và truyền thông.',
    dept: 'kinh-doanh',
  },
  {
    username: 'minh.hoang',
    name: 'Hoàng Nhật Minh',
    bio: 'Hỗ trợ khách hàng.',
    dept: 'kinh-doanh',
  },
] as const;

const DEPARTMENTS = [
  { slug: 'ky-thuat', name: 'Kỹ thuật', description: 'Xây dựng và vận hành sản phẩm.' },
  { slug: 'san-pham', name: 'Sản phẩm', description: 'Định hướng, thiết kế và trải nghiệm.' },
  { slug: 'kinh-doanh', name: 'Kinh doanh', description: 'Khách hàng, thị trường và doanh thu.' },
  { slug: 'nhan-su', name: 'Nhân sự', description: 'Con người, tuyển dụng và văn hoá.' },
];

const POSTS = [
  {
    by: 'an.nguyen',
    image: 'launch',
    type: 'ANNOUNCEMENT' as const,
    minutes: 60 * 20,
    content:
      'NEXA đã chạy chính thức từ hôm nay.\n\nMọi trao đổi công việc, thông báo và tài liệu từ giờ đều nằm ở đây thay vì tản mát qua nhiều nhóm chat. Anh chị dành vài phút cập nhật ảnh đại diện và phòng ban của mình giúp em nhé.',
    comments: [
      { by: 'ha.vo', text: 'Bên nhân sự đã chuyển toàn bộ biểu mẫu lên đây rồi ạ.' },
      { by: 'dung.pham', text: 'Ai không đăng nhập được thì nhắn em, em xử lý trong ngày.' },
    ],
  },
  {
    by: 'chi.le',
    image: 'homepage-design',
    minutes: 60 * 9,
    content:
      'Bản thiết kế mới của màn hình trang chủ đã xong vòng hai. Em gọn lại phần đầu trang và đưa hội thoại đang dở lên trên, ai góp ý gì thì để lại bình luận giúp em ạ.',
    comments: [
      { by: 'an.nguyen', text: 'Nhìn thoáng hơn hẳn bản trước. Giữ nguyên hướng này nhé.' },
      { by: 'binh.tran', text: 'Phần danh sách hội thoại em ghép API xong trong tuần này.' },
    ],
  },
  {
    by: 'dung.pham',
    image: 'deploy-pipeline',
    minutes: 60 * 5,
    content:
      'Hệ thống đã chuyển sang triển khai tự động: đẩy code lên nhánh chính là tự kiểm thử rồi tự lên máy chủ. Thời gian phát hành một thay đổi giảm từ khoảng 20 phút xuống dưới 4 phút.',
    comments: [{ by: 'khanh.do', text: 'Nghe là thấy nhẹ cả người.' }],
  },
  {
    by: 'ha.vo',
    image: 'workshop',
    minutes: 60 * 3,
    content:
      'Tuần sau công ty có buổi chia sẻ nội bộ về cách viết tài liệu kỹ thuật cho người không chuyên. Anh chị quan tâm thì thả tim vào bài này để em chốt số lượng ạ.',
    comments: [],
  },
  {
    by: 'linh.bui',
    image: 'readers-chart',
    minutes: 95,
    content:
      'Bài viết giới thiệu sản phẩm đã lên trang chủ. Số người đọc trong 6 giờ đầu gấp đôi bài gần nhất, phần lớn đến từ nguồn giới thiệu chứ không phải quảng cáo.',
    comments: [{ by: 'minh.hoang', text: 'Khách hỏi về sản phẩm sáng nay cũng tăng rõ.' }],
  },
  {
    by: 'minh.hoang',
    image: 'feedback-chart',
    minutes: 25,
    content:
      'Tổng hợp phản hồi khách hàng tháng này: khen nhiều nhất là tốc độ phản hồi, phàn nàn nhiều nhất vẫn là phần xuất báo cáo. Em để chi tiết trong kênh kinh doanh.',
    comments: [],
  },
];

const CHANNELS = [
  {
    slug: 'chung',
    name: 'Chung',
    description: 'Nơi mọi người trao đổi những việc không thuộc riêng nhóm nào.',
    members: PEOPLE.map((person) => person.username),
    messages: [
      { by: 'an.nguyen', minutes: 300, text: 'Chào cả nhà, kênh này để trao đổi chung nhé.' },
      { by: 'ha.vo', minutes: 290, text: 'Em vừa cập nhật lịch nghỉ lễ vào mục tài liệu ạ.' },
      { by: 'khanh.do', minutes: 240, text: 'Chiều nay phòng họp lớn có ai dùng không ạ?' },
      { by: 'chi.le', minutes: 236, text: 'Bên em dùng tới 3 giờ, sau đó trống nhé anh.' },
      { by: 'khanh.do', minutes: 230, text: 'Vậy em đặt từ 3 rưỡi. Cảm ơn chị.' },
      {
        by: 'linh.bui',
        minutes: 120,
        text: 'Ảnh chụp buổi team building em để trong kênh này luôn nha.',
      },
      { by: 'minh.hoang', minutes: 40, text: 'Nhìn ai cũng tươi ghê 😄' },
    ],
  },
  {
    slug: 'ky-thuat',
    name: 'Kỹ thuật',
    description: 'Triển khai, sự cố và những thứ đang chạy trên máy chủ.',
    members: ['binh.tran', 'dung.pham', 'an.nguyen', 'chi.le'],
    messages: [
      { by: 'dung.pham', minutes: 480, text: 'Đã vá xong lỗi rò kết nối cơ sở dữ liệu đêm qua.' },
      { by: 'binh.tran', minutes: 470, text: 'Biểu đồ bộ nhớ phẳng lại rồi, chuẩn.' },
      {
        by: 'binh.tran',
        minutes: 180,
        text: 'Em đang tách phần tìm kiếm ra khỏi luồng chính, chiều nay có bản thử.',
      },
      { by: 'an.nguyen', minutes: 176, text: 'Nhớ đo thời gian phản hồi trước và sau giúp anh.' },
      {
        by: 'dung.pham',
        minutes: 60,
        text: 'Bản thử đã lên môi trường nháp, mọi người vào thử giúp em.',
      },
    ],
  },
  {
    slug: 'ngau-hung',
    name: 'Ngẫu hứng',
    description: 'Cà phê, ảnh chó mèo và những thứ không liên quan tới công việc.',
    members: ['chi.le', 'linh.bui', 'minh.hoang', 'ha.vo', 'khanh.do'],
    messages: [
      { by: 'linh.bui', minutes: 400, text: 'Quán cà phê mới mở gần văn phòng ngon bất ngờ ☕' },
      { by: 'minh.hoang', minutes: 395, text: 'Trưa nay đi thử không?' },
      { by: 'chi.le', minutes: 390, text: 'Cho em một chân với 🙋' },
      {
        by: 'ha.vo',
        minutes: 30,
        text: 'Ai để quên bình giữ nhiệt ở phòng họp thì qua chỗ em nhận nhé.',
      },
    ],
  },
];

const DIRECTS = [
  {
    between: ['an.nguyen', 'chi.le'] as const,
    messages: [
      {
        by: 'an.nguyen',
        minutes: 200,
        text: 'Chi ơi, bản thiết kế trang chủ em gửi anh xem lại nhé.',
      },
      { by: 'chi.le', minutes: 195, text: 'Vâng anh, em vừa đẩy bản mới lên rồi ạ.' },
      { by: 'an.nguyen', minutes: 190, text: 'Ok, anh xem trong hôm nay.' },
    ],
  },
  {
    between: ['binh.tran', 'dung.pham'] as const,
    messages: [
      { by: 'dung.pham', minutes: 90, text: 'Bản thử đã lên, anh thử giúp em phần tìm kiếm với.' },
      { by: 'binh.tran', minutes: 85, text: 'Đang xem đây. Truy vấn dài vẫn hơi chậm.' },
      { by: 'dung.pham', minutes: 80, text: 'Để em thêm chỉ mục rồi đo lại.' },
    ],
  },
];

/** A direct conversation with whoever owns the workspace, so the home page has something in it. */
const WELCOME = {
  by: 'ha.vo',
  messages: [
    { minutes: 150, text: 'Chào anh, em là Hà bên nhân sự. Anh cần gì cứ nhắn em nhé.' },
    { minutes: 145, text: 'Em vừa thêm anh vào kênh Chung và kênh Kỹ thuật ạ.' },
  ],
};

async function main() {
  const slug = arg('org') ?? process.env.DEFAULT_ORG_SLUG ?? 'nexa';
  const rows = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  const database = rows[0]?.name ?? '(unknown)';

  let organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!organization && !has('create')) {
    throw new Error(
      `No organization with slug "${slug}" in database "${database}". Add --create to make one.`,
    );
  }

  console.log(`Database:     ${database}`);
  console.log(
    organization
      ? `Organization: ${organization.name} (${slug})`
      : `Organization: ${arg('name') ?? slug} (${slug}) - will be created`,
  );
  console.log(`Demo people:  ${PEOPLE.length}, at @${DEMO_DOMAIN}`);
  if (!has('yes')) {
    console.log('\nNothing was written. Add --yes to go ahead.');
    return;
  }

  // A demo organization of its own is the safest place for invented people: everything below is
  // scoped to it, so nothing here can appear in a real workspace.
  if (!organization) {
    organization = await prisma.organization.create({
      data: {
        slug,
        name: arg('name') ?? slug,
        roles: {
          create: SYSTEM_ROLES.map((role) => ({
            key: role.key,
            name: role.name,
            isSystem: true,
            permissions: { create: role.permissions.map((permissionKey) => ({ permissionKey })) },
          })),
        },
      },
      select: { id: true, name: true },
    });
    console.log(`Created:      organization "${organization.name}"`);
  }

  if (has('reset')) {
    const demo = await prisma.user.findMany({
      where: {
        OR: [
          { email: { endsWith: `@${DEMO_DOMAIN}` } },
          { email: { endsWith: `@${GUEST_DOMAIN}` } },
        ],
      },
      select: { id: true },
    });
    const ids = demo.map((user) => user.id);
    if (ids.length > 0) {
      // Conversations and posts they created go with them; everyone else's content stays.
      await prisma.message.deleteMany({ where: { senderId: { in: ids } } });
      await prisma.conversation.deleteMany({ where: { createdById: { in: ids } } });
      await prisma.conversationMember.deleteMany({ where: { userId: { in: ids } } });
      await prisma.comment.deleteMany({ where: { authorId: { in: ids } } });
      await prisma.reaction.deleteMany({ where: { userId: { in: ids } } });
      await prisma.post.deleteMany({ where: { authorId: { in: ids } } });
      await prisma.departmentMember.deleteMany({ where: { userId: { in: ids } } });
      await prisma.organizationMember.deleteMany({ where: { userId: { in: ids } } });
      await prisma.notification.deleteMany({
        where: { OR: [{ recipientId: { in: ids } }, { actorId: { in: ids } }] },
      });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    console.log(`Removed ${ids.length} demo people and guests, and their content.`);
  }

  const password = process.env.SEED_PASSWORD ?? randomBytes(24).toString('base64url');
  const passwordHash = await hash(password, Number(process.env.BCRYPT_ROUNDS ?? 12));
  const roleId = async (key: 'OWNER' | 'MEMBER') =>
    (
      await prisma.role.findUniqueOrThrow({
        where: { organizationId_key: { organizationId: organization!.id, key } },
        select: { id: true },
      })
    ).id;
  const memberRole = { id: await roleId('MEMBER') };

  // Someone real has to be able to administer a demo organization, and to look at it at all:
  // an invented person cannot sign in to it.
  const ownerEmail = arg('owner');
  if (ownerEmail) {
    const real = await prisma.user.findUnique({
      where: { email: ownerEmail },
      select: { id: true },
    });
    if (!real) throw new Error(`No account with e-mail "${ownerEmail}"`);
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: real.id } },
      update: { roleId: await roleId('OWNER') },
      create: {
        organizationId: organization.id,
        userId: real.id,
        roleId: await roleId('OWNER'),
      },
    });
    console.log(`Owner:        ${ownerEmail}`);
  }

  // ── People ──────────────────────────────────────────────────────────────
  const ids = new Map<string, string>();
  for (const person of PEOPLE) {
    const email = `${person.username}@${DEMO_DOMAIN}`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { displayName: person.name, bio: person.bio, avatarUrl: avatarOf(person.username) },
      create: {
        email,
        username: person.username,
        displayName: person.name,
        bio: person.bio,
        avatarUrl: avatarOf(person.username),
        passwordHash,
      },
      select: { id: true },
    });
    ids.set(person.username, user.id);
    const existing = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      select: { userId: true },
    });
    if (!existing) {
      await prisma.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          roleId: !ownerEmail && person === PEOPLE[0] ? await roleId('OWNER') : memberRole.id,
          // Spread the joining dates so "new colleagues" is not everyone at once.
          joinedAt: minutesAgo(60 * 24 * Math.floor(1 + random() * 40)),
        },
      });
    }
  }
  const id = (username: string) => ids.get(username) ?? '';
  console.log(`People:       ${ids.size}`);

  // ── Departments ─────────────────────────────────────────────────────────
  for (const department of DEPARTMENTS) {
    const row = await prisma.department.upsert({
      where: { organizationId_slug: { organizationId: organization.id, slug: department.slug } },
      update: { name: department.name, description: department.description },
      create: { organizationId: organization.id, ...department },
      select: { id: true },
    });
    for (const person of PEOPLE.filter((item) => item.dept === department.slug)) {
      await prisma.departmentMember.upsert({
        where: { departmentId_userId: { departmentId: row.id, userId: id(person.username) } },
        update: {},
        create: {
          departmentId: row.id,
          organizationId: organization.id,
          userId: id(person.username),
        },
      });
    }
  }
  console.log(`Departments:  ${DEPARTMENTS.length}`);

  // ── Posts, comments and reactions ───────────────────────────────────────
  const REACTIONS = ['LIKE', 'LOVE', 'HAHA', 'CELEBRATE'] as const;
  // Posts have no natural key to upsert on, so running twice would simply double the feed.
  const alreadyPosted = await prisma.post.count({
    where: { organizationId: organization.id, authorId: { in: [...ids.values()] } },
  });
  let postCount = 0;
  for (const item of alreadyPosted > 0 ? [] : POSTS) {
    const createdAt = minutesAgo(item.minutes);
    const post = await prisma.post.create({
      data: {
        organizationId: organization.id,
        authorId: id(item.by),
        content: item.content,
        imageUrl: postImage(item.image),
        type: item.type ?? 'GENERAL',
        createdAt,
        updatedAt: createdAt,
      },
      select: { id: true },
    });
    postCount += 1;
    for (const [index, entry] of item.comments.entries()) {
      const at = new Date(createdAt.getTime() + (index + 1) * 11 * 60_000);
      await prisma.comment.create({
        data: {
          organizationId: organization.id,
          postId: post.id,
          authorId: id(entry.by),
          content: entry.text,
          createdAt: at,
          updatedAt: at,
        },
      });
    }
    // A handful of reactions, never from the author.
    for (const person of PEOPLE.filter((p) => p.username !== item.by)) {
      if (random() > 0.55) continue;
      await prisma.reaction.create({
        data: {
          organizationId: organization.id,
          postId: post.id,
          userId: id(person.username),
          type: pick(REACTIONS),
        },
      });
    }
  }
  console.log(
    alreadyPosted > 0
      ? `Posts:        ${alreadyPosted} demo posts already there, left alone`
      : `Posts:        ${postCount}`,
  );

  // ── Conversations ───────────────────────────────────────────────────────
  async function fill(
    conversationId: string,
    messages: readonly { by: string; minutes: number; text: string }[],
  ) {
    const ordered = [...messages].sort((a, b) => b.minutes - a.minutes);
    let seq = 0;
    let last = new Date();
    for (const message of ordered) {
      seq += 1;
      last = minutesAgo(message.minutes);
      await prisma.message.create({
        data: {
          organizationId: organization!.id,
          conversationId,
          senderId: id(message.by),
          seq,
          content: message.text,
          createdAt: last,
        },
      });
    }
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageSeq: seq, lastMessageAt: last, lastActivityAt: last },
    });
    // Everyone has read everything except the last message or two, which looks like a real day.
    await prisma.conversationMember.updateMany({
      where: { conversationId },
      data: { lastReadSeq: Math.max(0, seq - 1) },
    });
    return seq;
  }

  for (const channel of CHANNELS) {
    const existing = await prisma.conversation.findUnique({
      where: { organizationId_slug: { organizationId: organization.id, slug: channel.slug } },
      select: { id: true },
    });
    if (existing) {
      console.log(`Channel:      #${channel.slug} already exists, left alone`);
      continue;
    }
    const created = await prisma.conversation.create({
      data: {
        organizationId: organization.id,
        type: 'CHANNEL',
        name: channel.name,
        slug: channel.slug,
        description: channel.description,
        createdById: id(channel.members[0] ?? PEOPLE[0].username),
      },
      select: { id: true },
    });
    await prisma.conversationMember.createMany({
      data: channel.members.map((username, index) => ({
        conversationId: created.id,
        organizationId: organization.id,
        userId: id(username),
        role: index === 0 ? ('OWNER' as const) : ('MEMBER' as const),
      })),
    });
    const count = await fill(created.id, channel.messages);
    console.log(`Channel:      #${channel.slug} (${count} messages)`);
  }

  async function direct(a: string, b: string) {
    const [first, second] = [id(a), id(b)].sort();
    const directKey = `${first}:${second}`;
    const existing = await prisma.conversation.findUnique({
      where: { organizationId_directKey: { organizationId: organization!.id, directKey } },
      select: { id: true },
    });
    if (existing) return null;
    const created = await prisma.conversation.create({
      data: {
        organizationId: organization!.id,
        type: 'DIRECT',
        directKey,
        createdById: id(a),
      },
      select: { id: true },
    });
    await prisma.conversationMember.createMany({
      data: [id(a), id(b)].map((userId) => ({
        conversationId: created.id,
        organizationId: organization!.id,
        userId,
      })),
    });
    return created;
  }

  for (const thread of DIRECTS) {
    const created = await direct(thread.between[0], thread.between[1]);
    if (created) await fill(created.id, thread.messages);
  }
  console.log(`Direct:       ${DIRECTS.length} between demo people`);

  // A message waiting for whoever owns the workspace, so their own home page is not empty.
  const owner = await prisma.organizationMember.findFirst({
    where: {
      organizationId: organization.id,
      role: { key: 'OWNER' },
      user: { email: { not: { endsWith: `@${DEMO_DOMAIN}` } } },
    },
    orderBy: { joinedAt: 'asc' },
    select: { userId: true },
  });
  if (owner) {
    const [first, second] = [id(WELCOME.by), owner.userId].sort();
    const directKey = `${first}:${second}`;
    const existing = await prisma.conversation.findUnique({
      where: { organizationId_directKey: { organizationId: organization.id, directKey } },
      select: { id: true },
    });
    if (!existing) {
      const created = await prisma.conversation.create({
        data: {
          organizationId: organization.id,
          type: 'DIRECT',
          directKey,
          createdById: id(WELCOME.by),
        },
        select: { id: true },
      });
      await prisma.conversationMember.createMany({
        data: [id(WELCOME.by), owner.userId].map((userId) => ({
          conversationId: created.id,
          organizationId: organization.id,
          userId,
        })),
      });
      await fill(
        created.id,
        WELCOME.messages.map((message) => ({ ...message, by: WELCOME.by })),
      );
      // Leave it unread for the owner: that is the point of it.
      await prisma.conversationMember.updateMany({
        where: { conversationId: created.id, userId: owner.userId },
        data: { lastReadSeq: 0 },
      });
      console.log('Welcome:      one unread direct message for the workspace owner');
    }
  }

  if (!process.env.SEED_PASSWORD) {
    console.log('\nDemo accounts have a random password; set SEED_PASSWORD to choose one.');
  }
  console.log('Done.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
