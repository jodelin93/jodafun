import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;
  private fromEmail: string;
  private frontendUrl: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    this.resend = new Resend(apiKey);
    this.fromEmail = this.configService.get<string>('FROM_EMAIL') || 'noreply@jodafun.app';
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  }

  async sendWelcomeEmail(to: string, userName: string) {
    try {
      const { data, error } = await this.resend.emails.send({
        from: `Joda Fun <${this.fromEmail}>`,
        to: [to],
        subject: '🎮 Welcome to Joda Fun!',
        html: this.getWelcomeEmailTemplate(userName),
      });

      if (error) {
        console.error('Failed to send welcome email:', error);
        throw new Error(`Email sending failed: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Welcome email error:', error);
      throw error;
    }
  }

  async sendEmailVerification(to: string, token: string, userName: string) {
    const verificationUrl = `${this.frontendUrl}/verify-email?token=${token}`;

    try {
      const { data, error } = await this.resend.emails.send({
        from: `Joda Fun <${this.fromEmail}>`,
        to: [to],
        subject: '✉️ Verify Your Email Address',
        html: this.getVerificationEmailTemplate(userName, verificationUrl),
      });

      if (error) {
        console.error('Failed to send verification email:', error);
        throw new Error(`Email sending failed: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Verification email error:', error);
      throw error;
    }
  }

  async sendPasswordResetEmail(to: string, token: string, userName: string) {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;

    try {
      const { data, error } = await this.resend.emails.send({
        from: `Joda Fun <${this.fromEmail}>`,
        to: [to],
        subject: '🔐 Reset Your Password',
        html: this.getPasswordResetTemplate(userName, resetUrl),
      });

      if (error) {
        console.error('Failed to send password reset email:', error);
        throw new Error(`Email sending failed: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Password reset email error:', error);
      throw error;
    }
  }

  async sendGameInvitation(to: string, inviterName: string, gameId: string, gameName: string) {
    const gameUrl = `${this.frontendUrl}/games/${gameName.toLowerCase().replace(/\s+/g, '-')}?gameId=${gameId}`;

    try {
      const { data, error } = await this.resend.emails.send({
        from: `Joda Fun <${this.fromEmail}>`,
        to: [to],
        subject: `🎮 ${inviterName} invited you to play ${gameName}!`,
        html: this.getGameInvitationTemplate(inviterName, gameName, gameUrl),
      });

      if (error) {
        console.error('Failed to send game invitation:', error);
        throw new Error(`Email sending failed: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Game invitation email error:', error);
      throw error;
    }
  }

  private getWelcomeEmailTemplate(userName: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Joda Fun!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
  <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 10px;">🎮</div>
      <h1 style="color: white; margin: 0; font-size: 32px; font-weight: bold;">Welcome to Joda Fun!</h1>
    </div>

    <!-- Content -->
    <div style="padding: 40px 30px;">
      <h2 style="color: #333; font-size: 24px; margin-top: 0;">Hey ${userName}! 👋</h2>

      <p style="color: #666; font-size: 16px; line-height: 1.6;">
        We're thrilled to have you join our gaming community! Get ready for an amazing experience with:
      </p>

      <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <div style="margin-bottom: 12px;">
          <span style="color: #667eea; font-size: 20px; margin-right: 8px;">🎯</span>
          <span style="color: #333; font-size: 16px; font-weight: 600;">Exciting Memory Games</span>
        </div>
        <div style="margin-bottom: 12px;">
          <span style="color: #667eea; font-size: 20px; margin-right: 8px;">🤖</span>
          <span style="color: #333; font-size: 16px; font-weight: 600;">AI Opponents</span>
        </div>
        <div style="margin-bottom: 12px;">
          <span style="color: #667eea; font-size: 20px; margin-right: 8px;">👥</span>
          <span style="color: #333; font-size: 16px; font-weight: 600;">Multiplayer Challenges</span>
        </div>
        <div>
          <span style="color: #667eea; font-size: 20px; margin-right: 8px;">🏆</span>
          <span style="color: #333; font-size: 16px; font-weight: 600;">Leaderboards & Achievements</span>
        </div>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${this.frontendUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 30px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
          Start Playing Now! 🎮
        </a>
      </div>

      <p style="color: #666; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        Have questions? We're here to help! Just reply to this email.
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
      <p style="color: #999; font-size: 12px; margin: 0;">
        © 2026 Joda Fun. All rights reserved.<br>
        You received this email because you signed up for Joda Fun.
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  private getVerificationEmailTemplate(userName: string, verificationUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
  <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 10px;">✉️</div>
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">Verify Your Email</h1>
    </div>

    <!-- Content -->
    <div style="padding: 40px 30px;">
      <h2 style="color: #333; font-size: 24px; margin-top: 0;">Hi ${userName}! 👋</h2>

      <p style="color: #666; font-size: 16px; line-height: 1.6;">
        Thanks for signing up! Please verify your email address to activate your account and start playing.
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 30px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
          Verify Email Address ✓
        </a>
      </div>

      <p style="color: #999; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        Or copy and paste this link into your browser:<br>
        <a href="${verificationUrl}" style="color: #667eea; word-break: break-all;">${verificationUrl}</a>
      </p>

      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px 16px; margin-top: 20px; border-radius: 4px;">
        <p style="color: #856404; font-size: 14px; margin: 0;">
          ⚠️ This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
      <p style="color: #999; font-size: 12px; margin: 0;">
        © 2026 Joda Fun. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  private getPasswordResetTemplate(userName: string, resetUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
  <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 10px;">🔐</div>
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">Reset Your Password</h1>
    </div>

    <!-- Content -->
    <div style="padding: 40px 30px;">
      <h2 style="color: #333; font-size: 24px; margin-top: 0;">Hi ${userName}! 👋</h2>

      <p style="color: #666; font-size: 16px; line-height: 1.6;">
        We received a request to reset your password. Click the button below to create a new password:
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 30px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
          Reset Password 🔑
        </a>
      </div>

      <p style="color: #999; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        Or copy and paste this link into your browser:<br>
        <a href="${resetUrl}" style="color: #667eea; word-break: break-all;">${resetUrl}</a>
      </p>

      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px 16px; margin-top: 20px; border-radius: 4px;">
        <p style="color: #856404; font-size: 14px; margin: 0;">
          ⚠️ This link will expire in 1 hour. If you didn't request a password reset, please ignore this email or contact support if you have concerns.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
      <p style="color: #999; font-size: 12px; margin: 0;">
        © 2026 Joda Fun. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  private getGameInvitationTemplate(inviterName: string, gameName: string, gameUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Game Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
  <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 10px;">🎮</div>
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">You're Invited to Play!</h1>
    </div>

    <!-- Content -->
    <div style="padding: 40px 30px;">
      <h2 style="color: #333; font-size: 24px; margin-top: 0;">Game Time! 🎯</h2>

      <p style="color: #666; font-size: 16px; line-height: 1.6;">
        <strong>${inviterName}</strong> has invited you to play <strong>${gameName}</strong> on Joda Fun!
      </p>

      <div style="background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1)); border-radius: 12px; padding: 20px; margin: 20px 0; border: 2px solid #667eea;">
        <div style="text-align: center;">
          <div style="font-size: 36px; margin-bottom: 10px;">🎲</div>
          <h3 style="color: #667eea; margin: 0 0 8px 0; font-size: 20px;">${gameName}</h3>
          <p style="color: #666; margin: 0; font-size: 14px;">Multiplayer Challenge</p>
        </div>
      </div>

      <p style="color: #666; font-size: 16px; line-height: 1.6;">
        Ready to accept the challenge? Click the button below to join the game!
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${gameUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 30px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
          Join Game Now! 🚀
        </a>
      </div>

      <p style="color: #999; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        Or copy and paste this link into your browser:<br>
        <a href="${gameUrl}" style="color: #667eea; word-break: break-all;">${gameUrl}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
      <p style="color: #999; font-size: 12px; margin: 0;">
        © 2026 Joda Fun. All rights reserved.<br>
        You received this invitation from ${inviterName}.
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }
}
