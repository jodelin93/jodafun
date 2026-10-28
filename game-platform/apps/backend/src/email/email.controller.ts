import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { EmailService } from './email.service';

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('send-test')
  @HttpCode(HttpStatus.OK)
  async sendTestEmail(@Body() body: { to: string; userName: string }) {
    const { to, userName } = body;
    await this.emailService.sendWelcomeEmail(to, userName);
    return {
      success: true,
      message: 'Welcome email sent successfully',
    };
  }

  @Post('send-game-invitation')
  @HttpCode(HttpStatus.OK)
  async sendGameInvitation(
    @Body() body: { to: string; inviterName: string; gameId: string; gameName: string },
  ) {
    const { to, inviterName, gameId, gameName } = body;
    await this.emailService.sendGameInvitation(to, inviterName, gameId, gameName);
    return {
      success: true,
      message: 'Game invitation sent successfully',
    };
  }

  @Post('send-verification')
  @HttpCode(HttpStatus.OK)
  async sendVerificationEmail(
    @Body() body: { to: string; token: string; userName: string },
  ) {
    const { to, token, userName } = body;
    await this.emailService.sendEmailVerification(to, token, userName);
    return {
      success: true,
      message: 'Verification email sent successfully',
    };
  }

  @Post('send-password-reset')
  @HttpCode(HttpStatus.OK)
  async sendPasswordResetEmail(
    @Body() body: { to: string; token: string; userName: string },
  ) {
    const { to, token, userName } = body;
    await this.emailService.sendPasswordResetEmail(to, token, userName);
    return {
      success: true,
      message: 'Password reset email sent successfully',
    };
  }
}
