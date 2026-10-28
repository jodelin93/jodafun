import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { GuestAuthService } from './guest-auth.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [GuestAuthService],
})
export class AuthModule {}
