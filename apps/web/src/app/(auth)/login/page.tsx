import type { Metadata } from 'next';
import { getTranslator } from '@/i18n/server';
import { SignInForm } from '@/features/auth/sign-in-form';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('auth.signIn') };
}

export default function LoginPage() {
  // Google sign-in runs on this server (ADR-020), so the client id decides whether to offer it.
  return <SignInForm googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID)} />;
}
