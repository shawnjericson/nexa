-- Fills the "load" organization with a company the size NEXA should cope with, straight in
-- PostgreSQL (generate_series: no round trips, a few minutes for everything). See load/README.md.
--
--   psql "$URL" -v users=20000 -v posts=200000 -v password_hash='$2b$12$...' -f load/seed.sql
--
-- The organization must exist first (registering its first account creates it with its roles).
-- Everything here belongs to it; people have e-mails at load.nexa.local.
\set ON_ERROR_STOP on
\timing on

SELECT id AS org FROM organizations WHERE slug = 'load' \gset
SELECT id AS member_role FROM roles WHERE organization_id = :'org' AND key = 'MEMBER' \gset

-- ── People ─────────────────────────────────────────────────────────────────
\echo people
INSERT INTO users (id, email, username, display_name, password_hash, bio, created_at, updated_at)
SELECT
  uuidv7(),
  format('user%s@load.nexa.local', g),
  format('user%s', g),
  (ARRAY['Nguyễn','Trần','Lê','Phạm','Hoàng','Huỳnh','Võ','Đặng','Bùi','Đỗ','Hồ','Ngô'])[1 + g % 12]
    || ' ' || (ARRAY['Văn','Thị','Minh','Thu','Quốc','Ngọc','Hoài','Thanh','Gia','Bảo'])[1 + (g / 12) % 10]
    || ' ' || (ARRAY['An','Bình','Chi','Dũng','Hà','Khánh','Linh','Minh','Nam','Phương','Quân','Sơn',
                     'Trang','Tuấn','Vy','Yến','Hải','Long','Mai','Nhung'])[1 + (g / 120) % 20],
  :'password_hash',
  (ARRAY['Kỹ sư phần mềm','Thiết kế','Kinh doanh','Nhân sự','Vận hành','Chăm sóc khách hàng'])[1 + g % 6],
  now() - make_interval(mins => g),
  now()
FROM generate_series(1, :users) AS g;

CREATE TEMP TABLE people AS
SELECT row_number() OVER (ORDER BY created_at DESC, id) AS n, id
FROM users WHERE email LIKE '%@load.nexa.local';
CREATE UNIQUE INDEX ON people (n);
ANALYZE people;
SELECT count(*) AS people FROM people \gset

INSERT INTO organization_members (id, organization_id, user_id, role_id, joined_at, created_at, updated_at)
SELECT uuidv7(), :'org', p.id, :'member_role', now() - make_interval(mins => p.n::int), now(), now()
FROM people p;

-- ── Departments: everyone in one of ten ─────────────────────────────────────
\echo departments
INSERT INTO departments (id, organization_id, name, slug, description, created_at, updated_at)
SELECT uuidv7(), :'org', name, slug, 'Phòng ban mẫu cho kiểm thử tải', now(), now()
FROM (VALUES ('Kỹ thuật','ky-thuat'), ('Sản phẩm','san-pham'), ('Thiết kế','thiet-ke'),
             ('Kinh doanh','kinh-doanh'), ('Marketing','marketing'), ('Nhân sự','nhan-su'),
             ('Tài chính','tai-chinh'), ('Vận hành','van-hanh'), ('Pháp chế','phap-che'),
             ('Chăm sóc khách hàng','cham-soc-khach-hang')) AS d(name, slug);

INSERT INTO department_members (department_id, organization_id, user_id, created_at)
SELECT d.id, :'org', p.id, now()
FROM people p
JOIN (SELECT id, row_number() OVER (ORDER BY slug) - 1 AS k FROM departments
      WHERE organization_id = :'org') d ON d.k = p.n % 10;

-- ── Feed: posts over the last 90 days, a comment and two reactions each ──────
\echo posts
INSERT INTO posts (id, organization_id, author_id, content, type, created_at, updated_at)
SELECT
  uuidv7(), :'org', p.id,
  (ARRAY['Cập nhật tiến độ dự án tuần này: đã xong phần thanh toán, đang kiểm thử trên môi trường nháp.',
         'Chia sẻ tài liệu hướng dẫn quy trình onboarding cho nhân viên mới, mọi người góp ý giúp nhé.',
         'Báo cáo doanh thu quý đã có trong thư mục chung. Tăng trưởng tốt ở khu vực phía Nam.',
         'Tuần sau có buổi đào tạo về bảo mật thông tin, ai tham gia thì thả tim vào bài này.',
         'Hệ thống giám sát cảnh báo độ trễ tăng lúc 3 giờ sáng, đã xử lý xong và viết lại quy trình trực.',
         'Chúc mừng đội thiết kế ra mắt bộ giao diện mới cho ứng dụng di động!',
         'Lịch họp toàn công ty chuyển sang chiều thứ Sáu, phòng họp lớn tầng 5.',
         'Khách hàng phản hồi rất tốt về tính năng tìm kiếm mới, cảm ơn cả nhóm.'])[1 + g % 8]
    || ' #' || g,
  CASE WHEN g % 500 = 0 THEN 'ANNOUNCEMENT'::"PostType" ELSE 'GENERAL'::"PostType" END,
  now() - make_interval(secs => (g::double precision / :posts) * 90 * 86400),
  now()
FROM generate_series(1, :posts) AS g
JOIN people p ON p.n = 1 + (g * 7919) % :people;

CREATE TEMP TABLE post_ids AS
SELECT row_number() OVER (ORDER BY id) AS n, id, created_at FROM posts WHERE organization_id = :'org';
CREATE UNIQUE INDEX ON post_ids (n);

INSERT INTO comments (id, organization_id, post_id, author_id, content, created_at, updated_at)
SELECT uuidv7(), :'org', pi.id, p.id,
       (ARRAY['Tuyệt vời!','Cảm ơn anh chị đã chia sẻ.','Em đã xem, rất hữu ích.','Có tài liệu chi tiết không ạ?'])[1 + pi.n % 4],
       pi.created_at + interval '5 minutes', now()
FROM post_ids pi JOIN people p ON p.n = 1 + (pi.n * 104729) % :people;

INSERT INTO reactions (id, organization_id, post_id, user_id, type, created_at, updated_at)
SELECT uuidv7(), :'org', pi.id, p.id, (ARRAY['LIKE','LOVE','HAHA','CELEBRATE'])[1 + (pi.n + k) % 4]::"ReactionType", now(), now()
FROM post_ids pi
CROSS JOIN generate_series(0, 1) AS k
JOIN people p ON p.n = 1 + (pi.n * 31 + k * 9973) % :people;

-- ── Chat ───────────────────────────────────────────────────────────────────
-- Channels of every size: the whole company, 5,000, 1,000, and 200 teams of 20.
\echo channels
CREATE TEMP TABLE channel_plan (slug text, name text, size int, messages int);
INSERT INTO channel_plan VALUES
  ('toan-cong-ty', 'Toàn công ty', :people, 20000),
  ('kenh-5000', 'Kênh 5.000 người', 5000, 20000),
  ('kenh-1000', 'Kênh 1.000 người', 1000, 20000);
INSERT INTO channel_plan
SELECT format('nhom-%s', t), format('Nhóm %s', t), 20, 500 FROM generate_series(1, 200) AS t;

INSERT INTO conversations (id, organization_id, type, name, slug, description, created_by_id,
                           last_message_seq, last_message_at, last_activity_at, created_at, updated_at)
SELECT uuidv7(), :'org', 'CHANNEL', c.name, c.slug, 'Kênh mẫu cho kiểm thử tải',
       (SELECT id FROM people WHERE n = 1), c.messages, now(), now(), now() - interval '90 days', now()
FROM channel_plan c;

CREATE TEMP TABLE channels AS
SELECT row_number() OVER (ORDER BY c.slug) AS k, v.id, c.size, c.messages
FROM channel_plan c JOIN conversations v ON v.organization_id = :'org' AND v.slug = c.slug;

-- Members: a run of people per channel that wraps around the list, so the sizes are exact.
INSERT INTO conversation_members (conversation_id, organization_id, user_id, role, last_read_seq, joined_at)
SELECT ch.id, :'org', p.id, 'MEMBER', ch.messages - 3, now() - interval '90 days'
FROM channels ch
JOIN people p ON (p.n - 1 - (ch.k * 97) % :people + :people) % :people < ch.size;

\echo channel messages
INSERT INTO messages (id, organization_id, conversation_id, sender_id, seq, content, created_at)
SELECT uuidv7(), :'org', ch.id, p.id, s,
       (ARRAY['Mọi người xem giúp em bản cập nhật này nhé.','Đã nhận, em xử lý trong chiều nay.',
              'Cuộc họp dời sang 3 giờ chiều ạ.','Link tài liệu em để ở trên.','Ok anh 👍',
              'Có ai rảnh review giúp em không?','Hôm nay deploy lúc 5 giờ nhé.'])[1 + s % 7],
       now() - make_interval(secs => (ch.messages - s) * 60)
FROM channels ch
CROSS JOIN LATERAL generate_series(1, ch.messages) AS s
-- The sender is always one of the channel's members.
JOIN people p ON p.n = 1 + ((ch.k * 97) % :people + (s * 13) % ch.size) % :people;

-- Direct conversations: everyone talks to two colleagues, a dozen messages each.
\echo direct conversations
CREATE TEMP TABLE pairs AS
SELECT DISTINCT LEAST(a.id::text, b.id::text) AS lo, GREATEST(a.id::text, b.id::text) AS hi
FROM people a
CROSS JOIN generate_series(1, 2) AS k
JOIN people b ON b.n = 1 + (a.n + k * 37) % :people
WHERE a.id <> b.id;

INSERT INTO conversations (id, organization_id, type, direct_key, created_by_id, last_message_seq,
                           last_message_at, last_activity_at, created_at, updated_at)
SELECT uuidv7(), :'org', 'DIRECT', lo || ':' || hi, lo::uuid, 12, now(), now(), now() - interval '30 days', now()
FROM pairs;

INSERT INTO conversation_members (conversation_id, organization_id, user_id, last_read_seq, joined_at)
SELECT v.id, :'org', u.user_id::uuid, 11, now() - interval '30 days'
FROM conversations v
CROSS JOIN LATERAL unnest(string_to_array(v.direct_key, ':')) AS u(user_id)
WHERE v.organization_id = :'org' AND v.type = 'DIRECT';

INSERT INTO messages (id, organization_id, conversation_id, sender_id, seq, content, created_at)
SELECT uuidv7(), :'org', v.id, split_part(v.direct_key, ':', 1 + s % 2)::uuid, s,
       (ARRAY['Chào bạn, mình hỏi chút về task hôm qua.','Ừ, bạn cứ nói.','Phần API đã xong chưa?',
              'Xong rồi, đang chờ review.','Cảm ơn nhé!'])[1 + s % 5],
       now() - make_interval(mins => (12 - s) * 30)
FROM conversations v
CROSS JOIN generate_series(1, 12) AS s
WHERE v.organization_id = :'org' AND v.type = 'DIRECT';

\echo analyze
ANALYZE;

SELECT
  (SELECT count(*) FROM organization_members WHERE organization_id = :'org') AS members,
  (SELECT count(*) FROM posts WHERE organization_id = :'org') AS posts,
  (SELECT count(*) FROM comments WHERE organization_id = :'org') AS comments,
  (SELECT count(*) FROM reactions WHERE organization_id = :'org') AS reactions,
  (SELECT count(*) FROM conversations WHERE organization_id = :'org') AS conversations,
  (SELECT count(*) FROM conversation_members WHERE organization_id = :'org') AS conversation_members,
  (SELECT count(*) FROM messages WHERE organization_id = :'org') AS messages,
  pg_size_pretty(pg_database_size(current_database())) AS database_size;
