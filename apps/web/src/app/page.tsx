import {
  Bell,
  Building2,
  Code2,
  MessagesSquare,
  Newspaper,
  Search,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { AuthArtwork } from '@/components/brand/auth-artwork';
import { Logo } from '@/components/brand/logo';
import { LanguageSwitch } from '@/components/shell/language-switch';
import { getTranslator } from '@/i18n/server';

const FEATURES = [
  { icon: MessagesSquare, title: 'landing.featureChat', text: 'landing.featureChatText' },
  { icon: Newspaper, title: 'landing.featureFeed', text: 'landing.featureFeedText' },
  { icon: Users, title: 'landing.featurePeople', text: 'landing.featurePeopleText' },
  { icon: Search, title: 'landing.featureSearch', text: 'landing.featureSearchText' },
  { icon: ShieldCheck, title: 'landing.featureAdmin', text: 'landing.featureAdminText' },
  { icon: Bell, title: 'landing.featureNotifications', text: 'landing.featureNotificationsText' },
] as const satisfies readonly { icon: LucideIcon; title: string; text: string }[];

const ENGINEERING = [
  ['landing.engTenancy', 'landing.engTenancyText'],
  ['landing.engMessages', 'landing.engMessagesText'],
  ['landing.engSessions', 'landing.engSessionsText'],
  ['landing.engOauth', 'landing.engOauthText'],
  ['landing.engSearch', 'landing.engSearchText'],
  ['landing.engDelivery', 'landing.engDeliveryText'],
] as const;

const STACK = [
  'TypeScript',
  'Node.js',
  'Express 5',
  'PostgreSQL 18',
  'Prisma 7',
  'Redis',
  'Socket.IO',
  'MongoDB',
  'Next.js 16',
  'React 19',
  'Tailwind CSS 4',
  'Cloudflare R2',
  'GitHub Actions',
];

/** Plain form POST: "try the demo" creates an account, so it must never be a followable link. */
function TryDemo({ label, hint }: { label: string; hint: string }) {
  return (
    <form action="/api/session/demo" method="post" className="flex flex-col items-start gap-2">
      <button
        type="submit"
        className="inline-flex h-11 items-center rounded-lg bg-[#7fe4cf] px-6 text-sm font-semibold text-[#04211e] transition-colors hover:bg-white"
      >
        {label}
      </button>
      <span className="text-xs text-white/70">{hint}</span>
    </form>
  );
}

/**
 * The front door (/). Someone deciding whether NEXA is worth their time should understand it in
 * a minute and be able to use it in one click, without an account - not meet a sign-in form.
 * Signed-in visitors never see it: the proxy sends them to /home.
 */
export default async function Landing({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { t } = await getTranslator();
  const { demo } = await searchParams;
  const notice =
    demo === 'busy'
      ? t('landing.demoBusy')
      : demo === 'unavailable'
        ? t('landing.demoUnavailable')
        : null;
  // Shown only when set, so a private repository never becomes a dead link.
  const repoUrl = process.env.REPO_URL;

  return (
    <div className="min-h-dvh bg-background text-fg">
      <section className="relative overflow-hidden">
        <AuthArtwork />
        <div className="relative mx-auto flex max-w-6xl flex-col px-5 pb-20 md:px-8 md:pb-28">
          <header className="flex items-center justify-between gap-3 py-5">
            <Logo className="text-white" />
            <nav className="flex items-center gap-1 sm:gap-2">
              {/* On a phone there is room for the two ways in; the language moves to the footer. */}
              <span className="hidden sm:inline-flex [&_button]:text-white/80 [&_button:hover]:text-white">
                <LanguageSwitch />
              </span>
              <Link
                href="/login"
                className="rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-white/85 hover:text-white"
              >
                {t('landing.signIn')}
              </Link>
              <Link
                href="/register"
                className="rounded-md border border-white/25 px-3 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-white/10"
              >
                {t('landing.signUp')}
              </Link>
            </nav>
          </header>

          <div className="mt-14 max-w-2xl md:mt-24">
            <p className="text-xs font-semibold tracking-[0.18em] text-[#7fe4cf] uppercase">
              {t('landing.eyebrow')}
            </p>
            <h1 className="mt-4 text-4xl leading-[1.12] font-semibold tracking-tight text-white md:text-5xl">
              {t('landing.title')}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/75">
              {t('landing.subtitle')}
            </p>
            <div className="mt-8">
              <TryDemo label={t('landing.tryDemo')} hint={t('landing.tryDemoHint')} />
            </div>
            {notice && (
              <p
                role="status"
                className="mt-5 max-w-xl rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm text-white"
              >
                {notice}
              </p>
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-5 md:px-8">
        <section aria-labelledby="landing-features" className="py-16 md:py-20">
          <h2 id="landing-features" className="text-title font-semibold tracking-tight">
            {t('landing.featuresTitle')}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="rounded-xl border border-border bg-surface p-5">
                <feature.icon className="size-5 text-accent" aria-hidden />
                <h3 className="mt-3 text-sm font-semibold">{t(feature.title)}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{t(feature.text)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="landing-engineering"
          className="border-t border-border py-16 md:py-20"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <h2 id="landing-engineering" className="text-title font-semibold tracking-tight">
                {t('landing.engineeringTitle')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {t('landing.engineeringSubtitle')}
              </p>
            </div>
            {repoUrl && (
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:border-accent/50"
              >
                <Code2 className="size-4" aria-hidden />
                {t('landing.sourceCode')}
              </a>
            )}
          </div>
          <dl className="mt-8 grid gap-x-10 gap-y-7 md:grid-cols-2">
            {ENGINEERING.map(([title, text]) => (
              <div key={title} className="border-l-2 border-accent/40 pl-4">
                <dt className="text-sm font-semibold">{t(title)}</dt>
                <dd className="mt-1 text-sm leading-6 text-muted">{t(text)}</dd>
              </div>
            ))}
          </dl>

          <h3 className="mt-12 text-[11px] font-semibold tracking-wider text-muted uppercase">
            {t('landing.stackTitle')}
          </h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {STACK.map((item) => (
              <li
                key={item}
                className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-fg"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-muted md:px-8">
          <span className="inline-flex items-center gap-2">
            <Building2 className="size-3.5" aria-hidden />
            {t('landing.footer')}
          </span>
          <span className="flex items-center gap-4">
            <LanguageSwitch />
            <Link href="/login" className="hover:text-fg">
              {t('landing.signIn')}
            </Link>
            <Link href="/register" className="hover:text-fg">
              {t('landing.signUp')}
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
