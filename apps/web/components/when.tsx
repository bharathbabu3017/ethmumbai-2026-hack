"use client";

import { when } from "@/lib/format";

/** A date and time in the viewer's own timezone, which the server can't know. */
export function When({ at }: { at: Date | string }) {
  return <time dateTime={new Date(at).toISOString()} suppressHydrationWarning>{when(at)}</time>;
}
