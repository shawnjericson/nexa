'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UploadedFile } from '@/lib/types';
import { MAX_ATTACHMENTS, UploadError, uploadFile, type UploadFailure } from './upload';

export interface PendingAttachment {
  key: string;
  file: File;
  status: 'uploading' | 'ready' | 'failed';
  progress: number;
  /** Local preview for images, before and after the upload. */
  previewUrl: string | null;
  uploaded?: UploadedFile;
  failure?: UploadFailure;
}

/** Files attached in a composer: each uploads on its own, and failures stay visible (§15). */
export function useAttachmentUploads() {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const controllers = useRef(new Map<string, AbortController>());

  const patch = useCallback((key: string, change: Partial<PendingAttachment>) => {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...change } : item)),
    );
  }, []);

  const add = useCallback(
    (files: Iterable<File>, onTooMany?: () => void) => {
      const incoming = [...files];
      setItems((current) => {
        const room = MAX_ATTACHMENTS - current.length;
        if (incoming.length > room) onTooMany?.();
        const accepted = incoming.slice(0, Math.max(0, room)).map((file) => ({
          key: `${file.name}-${file.size}-${crypto.randomUUID()}`,
          file,
          status: 'uploading' as const,
          progress: 0,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        }));

        for (const item of accepted) {
          const controller = new AbortController();
          controllers.current.set(item.key, controller);
          uploadFile(item.file, (progress) => patch(item.key, { progress }), controller.signal)
            .then((uploaded) => patch(item.key, { status: 'ready', progress: 1, uploaded }))
            .catch((error: unknown) => {
              if (error instanceof DOMException && error.name === 'AbortError') return;
              patch(item.key, {
                status: 'failed',
                failure: error instanceof UploadError ? error.reason : 'failed',
              });
            })
            .finally(() => controllers.current.delete(item.key));
        }
        return [...current, ...accepted];
      });
    },
    [patch],
  );

  const remove = useCallback((key: string) => {
    controllers.current.get(key)?.abort();
    setItems((current) => {
      const item = current.find((candidate) => candidate.key === key);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((candidate) => candidate.key !== key);
    });
  }, []);

  const reset = useCallback(() => {
    for (const controller of controllers.current.values()) controller.abort();
    setItems((current) => {
      for (const item of current) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
  }, []);

  // Stop uploads and free previews when the composer goes away.
  useEffect(() => () => reset(), [reset]);

  return {
    items,
    add,
    remove,
    reset,
    uploading: items.some((item) => item.status === 'uploading'),
    failed: items.some((item) => item.status === 'failed'),
    readyIds: items.flatMap((item) => (item.uploaded ? [item.uploaded.id] : [])),
  };
}
