import type { Metadata } from 'next';
import { getTranslator } from '@/i18n/server';
import { SignInForm } from '@/features/auth/sign-in-form';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t('auth.signIn') };
}

export default function LoginPage() {
  return <SignInForm />;
}
