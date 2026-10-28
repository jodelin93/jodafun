import { PrismaService } from '../prisma/prisma.service';

// better-auth may use the __Secure- prefix in production; guest sessions use the plain name
const SESSION_COOKIE_NAMES = [
  '__Secure-better-auth.session_token',
  'better-auth.session_token',
];

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  isGuest: boolean;
}

function parseCookieHeader(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep the raw value if it is not valid URI encoding
    }
    if (name && !(name in cookies)) cookies[name] = value;
  }
  return cookies;
}

export function isGuestEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith('@guest.local');
}

/**
 * Resolves the logged-in user from a raw Cookie header. Values may be the raw
 * session token (guest sessions) or better-auth's signed "token.signature" form.
 */
export async function resolveSessionUser(
  prisma: PrismaService,
  cookieHeader: string | undefined | null,
): Promise<SessionUser | null> {
  if (!cookieHeader) return null;
  const cookies = parseCookieHeader(cookieHeader);

  const candidates: string[] = [];
  for (const name of SESSION_COOKIE_NAMES) {
    const value = cookies[name];
    if (!value) continue;
    candidates.push(value);
    const dot = value.indexOf('.');
    if (dot > 0) candidates.push(value.slice(0, dot));
  }

  for (const token of candidates) {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (session && session.expiresAt > new Date()) {
      return {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        isGuest: isGuestEmail(session.user.email),
      };
    }
  }
  return null;
}
