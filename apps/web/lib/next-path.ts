/** Only same-site paths, so a crafted link can't send someone elsewhere after login. */
export const safeNext = (next: string | null) => (next && /^\/(?![/\\])/.test(next) ? next : "/home");
