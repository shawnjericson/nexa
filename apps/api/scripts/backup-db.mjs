/**
 * Dumps the database in apps/api/.env to a compressed pg_dump file, checks the file reads back,
 * keeps the last BACKUP_KEEP_DAYS days of them, and - when BACKUP_S3_PREFIX is set - copies each
 * dump to the S3/R2 bucket the API already uses, so a backup survives losing the server.
 *
 * Run nightly from cron on the server (README, "Backups and logs"):
 *
 *   node apps/api/scripts/backup-db.mjs
 *
 * Plain JavaScript on purpose: it needs nothing built, and the password travels to pg_dump in its
 * environment rather than on a command line anyone on the machine can read with `ps`.
 */
import { spawnSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(apiDir, '.env'))) process.loadEnvFile(join(apiDir, '.env'));

const backupDir = process.env.BACKUP_DIR ?? join(homedir(), 'backups', 'nexa');
const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 14);
const s3Prefix = process.env.BACKUP_S3_PREFIX?.trim().replace(/\/+$/, '');

const url = new URL(process.env.DATABASE_URL ?? '');
const database = decodeURIComponent(url.pathname.slice(1));
const pgEnv = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || '5432',
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: database,
  ...(process.env.DATABASE_SSL === 'true' && { PGSSLMODE: 'require' }),
};

function run(command, args) {
  const result = spawnSync(command, args, { env: pgEnv, stdio: ['ignore', 'ignore', 'inherit'] });
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d+Z$/, 'Z');
const name = `${database}-${stamp}.dump`;
const file = join(backupDir, name);

// Written under another name first, so a dump cut short never looks like a finished one.
process.umask(0o077);
run('pg_dump', ['--format=custom', '--compress=9', '--no-owner', `--file=${file}.partial`]);
run('pg_restore', ['--list', `${file}.partial`]);
renameSync(`${file}.partial`, file);
const size = statSync(file).size;

const cutoff = Date.now() - keepDays * 86_400_000;
let removed = 0;
for (const entry of readdirSync(backupDir)) {
  if (!entry.startsWith(`${database}-`) || !entry.endsWith('.dump')) continue;
  const path = join(backupDir, entry);
  if (statSync(path).mtimeMs < cutoff) {
    unlinkSync(path);
    removed++;
  }
}

let copied = '';
if (s3Prefix) {
  if (!process.env.S3_BUCKET) throw new Error('BACKUP_S3_PREFIX is set but S3_BUCKET is not');
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
  });
  const key = `${s3Prefix}/${name}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: createReadStream(file),
      ContentLength: size,
      ContentType: 'application/octet-stream',
    }),
  );
  copied = `, copied to ${key}`;
}

console.log(
  `${new Date().toISOString()} ${name}: ${(size / 1024).toFixed(0)} KB${copied}; removed ${removed} older than ${keepDays} days`,
);
