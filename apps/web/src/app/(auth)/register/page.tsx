import type { Metadata } from 'next';
import { getTranslator } from '@/i18n/server';
import { SignUpForm } from '@/features/auth/sign-up-form';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('auth.signUp') };
}

export default function RegisterPage() {
  return <SignUpForm googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID)} />;
}
