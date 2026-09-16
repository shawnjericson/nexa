'use client';

import type { components } from '@nexa/api-client';
import { Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { uploadFile, UploadError } from '@/features/feed/upload';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import { useRemoveAvatar, useSetAvatar } from './queries';

type Me = components['schemas']['Me'];

/** The API's own limit for avatars; checked here too so a big photo fails before it uploads. */
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';

/**
 * The picture is an ordinary upload (ADR-020): it goes straight to object storage, and the API
 * then serves it from a stable address.
 */
export function AvatarField({ me }: { me: Me }) {
  const i18n = useI18n();
  const { t } = i18n;
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const setAvatar = useSetAvatar();
  const remove = useRemoveAvatar();
  const busy = progress !== null || setAvatar.isPending || remove.isPending;

  async function choose(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error(t('settings.avatarTooLarge'));
      return;
    }
    setProgress(0);
    try {
      const uploaded = await uploadFile(file, setProgress);
      await setAvatar.mutateAsync(uploaded.id);
      toast.success(t('settings.avatarSaved'));
    } catch (error) {
      toast.error(
        error instanceof UploadError
          ? t(error.reason === 'too-large' ? 'settings.avatarTooLarge' : 'upload.failed', {
              name: file.name,
            })
          : describeError(error, i18n),
      );
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={me.display_name} src={me.avatar_url} size="xl" />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-fg">{t('settings.avatarLabel')}</p>
        <p className="mt-0.5 text-xs text-muted">
          {progress !== null
            ? t('upload.uploading', { percent: Math.round(progress * 100) })
            : t('settings.avatarHelp')}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void choose(file);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() => input.current?.click()}
          >
            <Upload aria-hidden />
            {me.avatar_url ? t('settings.avatarChange') : t('settings.avatarUpload')}
          </Button>
          {me.avatar_url && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => toast.success(t('settings.avatarRemoved')),
                  onError: (error) => toast.error(describeError(error, i18n)),
                })
              }
            >
              <Trash2 aria-hidden />
              {t('settings.avatarRemove')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
