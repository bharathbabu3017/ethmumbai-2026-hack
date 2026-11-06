import { findWallet } from "@flashmob/db";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "./db";

const COOKIE = "flashmob_session";

function secret() {
  if (!process.env.SESSION_SECRET) throw new Error("Set SESSION_SECRET");
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

export async function startSession(address: string) {
  const token = await new SignJWT({ address }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("7d").sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 24 * 3600 });
}

export const endSession = async () => (await cookies()).delete(COOKIE);

/** The user is looked up from the wallet each time, because linking Telegram can change it. */
export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const wallet = await findWallet(db(), String(payload.address));
    return wallet ? { address: wallet.address, userId: wallet.userId } : null;
  } catch {
    return null;
  }
}

export const unauthorized = () => NextResponse.json({ error: "Sign in first" }, { status: 401 });
