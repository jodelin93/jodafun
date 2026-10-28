import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
    usePlural: false, // Use singular table names (users, not Users)
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Disable for MVP, enable later
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day (update session every day)
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  socialProviders: {
    // Add social providers later if needed
  },
});

export type Session = typeof auth.$Infer.Session;
