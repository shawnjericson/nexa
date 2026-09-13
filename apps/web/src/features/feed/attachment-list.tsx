'use client';

import { Download, FileArchive, FileText, ImageOff } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import type { Attachment } from '@/lib/types';

interface ImageItem {
  key: string;
  url: string;
  name: string;
}

/** An image whose URL may have expired: shows a quiet fallback instead of a broken icon (§13). */
function SafeImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const { t } = useI18n();
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span
        className={cn(
          'flex flex-col items-center justify-center gap-1 bg-surface-subtle text-xs text-muted',
          className,
        )}
      >
        <ImageOff className="size-5" aria-hidden />
        {t('attachments.brokenImage')}
      </span>
    );
  }
  // Presigned URLs from object storage: a plain img (no image optimizer in between).
  return (
    <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} className={className} />
  );
}

function ImageGrid({ images }: { images: ImageItem[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<ImageItem | null>(null);
  const single = images.length === 1;

  return (
    <>
      <div
        className={cn(
          'grid gap-1 overflow-hidden rounded-lg',
          single ? 'grid-cols-1' : 'grid-cols-2',
        )}
      >
        {images.map((image, index) => (
          <button
            key={image.key}
            type="button"
            onClick={() => setOpen(image)}
            aria-label={t('attachments.openImage', { name: image.name })}
            className={cn(
              'overflow-hidden bg-surface-subtle',
              // Three images: the first spans the full width.
              images.length === 3 && index === 0 && 'col-span-2',
            )}
          >
            <SafeImage
              src={image.url}
              alt={image.name}
              className={cn(
                'w-full object-cover transition-opacity hover:opacity-95',
                single ? 'max-h-[28rem]' : 'aspect-[4/3]',
              )}
            />
          </button>
        ))}
      </div>
      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        {open && (
          <DialogContent title={open.name} className="sm:max-w-4xl">
            <SafeImage
              src={open.url}
              alt={open.name}
              className="mx-auto max-h-[75vh] w-auto rounded-md"
            />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function FileRow({ attachment }: { attachment: Attachment }) {
  const { t, locale } = useI18n();
  const Icon = attachment.kind === 'archive' ? FileArchive : FileText;
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:bg-surface-subtle"
      aria-label={t('attachments.download', { name: attachment.filename })}
    >
      <Icon className="size-5 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{attachment.filename}</span>
        <span className="block text-xs text-muted">{formatBytes(attachment.size, locale)}</span>
      </span>
      <Download className="size-4 shrink-0 text-muted group-hover:text-fg" aria-hidden />
    </a>
  );
}

/** Images in a grid, videos inline, other files as download rows. */
export function AttachmentList({
  attachments,
  imageUrl,
}: {
  attachments: Attachment[];
  /** The exam contract's image_url, shown like an attached image. */
  imageUrl?: string | null;
}) {
  const images: ImageItem[] = [
    ...(imageUrl ? [{ key: imageUrl, url: imageUrl, name: imageUrl.split('/').pop() ?? '' }] : []),
    ...attachments
      .filter((attachment) => attachment.kind === 'image')
      .map((attachment) => ({
        key: attachment.id,
        url: attachment.url,
        name: attachment.filename,
      })),
  ];
  const videos = attachments.filter((attachment) => attachment.kind === 'video');
  const files = attachments.filter(
    (attachment) => attachment.kind === 'document' || attachment.kind === 'archive',
  );
  if (images.length + videos.length + files.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {images.length > 0 && <ImageGrid images={images} />}
      {videos.map((video) => (
        <video
          key={video.id}
          src={video.url}
          controls
          preload="metadata"
          className="max-h-96 w-full rounded-lg bg-black"
        />
      ))}
      {files.map((file) => (
        <FileRow key={file.id} attachment={file} />
      ))}
    </div>
  );
}
