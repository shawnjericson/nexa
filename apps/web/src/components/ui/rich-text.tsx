import { Fragment } from 'react';
import { cn } from '@/lib/cn';

// http(s) links, without trailing punctuation that usually ends the sentence.
const LINK = /(https?:\/\/[^\s<]+[^\s<.,;:!?"')\]])/g;

/**
 * User content is plain text: line breaks are kept and web links become clickable, but nothing is
 * ever rendered as HTML (spec §17: content sanitization).
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(LINK);
  return (
    <p className={cn('break-words whitespace-pre-wrap', className)}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-accent underline-offset-2 hover:underline"
          >
            {part}
          </a>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </p>
  );
}
