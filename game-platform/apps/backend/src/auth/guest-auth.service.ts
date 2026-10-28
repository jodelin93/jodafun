import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

@Injectable()
export class GuestAuthService {
  constructor(private prisma: PrismaService) {}

  async createGuestUser() {
    // Generate a unique guest identifier
    const guestId = randomBytes(16).toString('hex');
    const guestEmail = `guest_${guestId}@guest.local`;
    const guestName = `Guest ${guestId.substring(0, 8)}`;

    // Create a guest user in the database
    const user = await this.prisma.user.create({
      data: {
        email: guestEmail,
        name: guestName,
        emailVerified: false,
        image: null,
      },
    });

    // Create a session for the guest user
    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        token: sessionToken,
        expiresAt,
        ipAddress: '',
        userAgent: '',
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      session: {
        token: session.token,
        expiresAt: session.expiresAt.toISOString(),
      },
    };
  }

  async convertGuestToPermament(userId: string, email: string, password: string) {
    // Find the user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user is a guest
    if (!user.email || !user.email.includes('@guest.local')) {
      throw new BadRequestException('User is already a permanent account');
    }

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already in use');
    }

    // Hash password
    const salt = randomBytes(16).toString('hex');
    const hash = (await scryptAsync(password, salt, 64)) as Buffer;
    const hashedPassword = `${salt}:${hash.toString('hex')}`;

    // Update user with new email and password
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email,
        // Note: Better Auth handles password storage differently
        // We'll let Better Auth handle this through its own sign-up flow
      },
    });

    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        emailVerified: updatedUser.emailVerified,
        image: updatedUser.image,
        createdAt: updatedUser.createdAt.toISOString(),
        updatedAt: updatedUser.updatedAt.toISOString(),
      },
    };
  }
}
