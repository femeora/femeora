import Link from 'next/link';
import { Fragment } from 'react';

const TOKEN = /([@$][A-Za-z0-9_]+)/g;

/**
 * Renders a user-written caption exactly as typed (line breaks kept), with
 * `$TOKEN` cashtags linked to the pool and `@handle` mentions highlighted (brief 5.5).
 */
export function CaptionText({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKEN).map((part, index) => {
        if (part.startsWith('$') && part.length > 1) {
          return (
            <Link key={index} href="/pools" className="text-signal hover:underline">
              {part}
            </Link>
          );
        }
        if (part.startsWith('@') && part.length > 1) {
          return (
            <span key={index} className="text-signal">
              {part}
            </span>
          );
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}
