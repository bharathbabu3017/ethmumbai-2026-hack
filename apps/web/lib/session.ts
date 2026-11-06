import { findWallet } from "@flashmob/db";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "./db";

const COOKIE = "flashmob_session";

function secret() {
  if (!process.env.SESSION_SECRET) throw new Error("Set SESSION_SECRET");
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

const MINI_APP_SECONDS = 12 * 3600;
const WEB_SECONDS = 7 * 24 * 3600;

/** A Mini App session can act on a server-held wallet, so it lasts less time than a web one. */
export async function startSession(address: string, miniApp = false) {
  const seconds = miniApp ? MINI_APP_SECONDS : WEB_SECONDS;
  const token = await new SignJWT({ address }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(`${seconds}s`).sign(secret());
  const production = process.env.NODE_ENV === "production";
  // Telegram's web client shows Mini Apps in a frame, which needs SameSite=None.
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: miniApp && production ? "none" : "lax", secure: production, path: "/", maxAge: seconds });
}

export const endSession = async () => (await cookies()).delete(COOKIE);

/** The user is looked up from the wallet each time, because linking Telegram can change it. */
export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const wallet = await findWallet(db(), String(payload.address));
    return wallet ? { address: wallet.address, userId: wallet.userId, walletId: wallet.id, walletType: wallet.type } : null;
  } catch {
    return null;
  }
}

/** Blocks requests from other sites, since a Mini App cookie is sent cross-site. */
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  return !!origin && new URL(origin).host === req.headers.get("host") && req.headers.get("content-type")?.startsWith("application/json");
}

export const unauthorized = () => NextResponse.json({ error: "Sign in first" }, { status: 401 });
