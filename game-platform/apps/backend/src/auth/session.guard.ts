import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveSessionUser } from './session';

// Rejects requests without a valid session cookie and exposes the user as req.sessionUser
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await resolveSessionUser(this.prisma, req.headers.cookie);
    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }
    req.sessionUser = user;
    return true;
  }
}
