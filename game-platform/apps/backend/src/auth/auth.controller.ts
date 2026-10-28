import { All, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { auth } from '../lib/auth';
import { GuestAuthService } from './guest-auth.service';

@Controller('auth')
export class AuthController {
  constructor(private guestAuthService: GuestAuthService) {}

  @Post('guest')
  async createGuest(@Res() res: any) {
    try {
      const result = await this.guestAuthService.createGuestUser();

      // Set session cookie
      res.cookie('better-auth.session_token', result.session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });

      return res.json(result);
    } catch (error) {
      console.error('Guest creation error:', error);
      return res.status(500).json({
        error: 'Failed to create guest user',
        message: error.message,
      });
    }
  }

  @Get('get-session')
  async getSession(@Req() req: any, @Res() res: any) {
    try {
      // Get session token from cookie
      const sessionToken = req.cookies['better-auth.session_token'];

      if (!sessionToken) {
        return res.status(401).json({
          error: 'Not authenticated',
        });
      }

      // Find session with user
      const session = await this.guestAuthService['prisma'].session.findUnique({
        where: { token: sessionToken },
        include: { user: true },
      });

      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({
          error: 'Session expired',
        });
      }

      return res.json({
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          emailVerified: session.user.emailVerified,
          image: session.user.image,
          createdAt: session.user.createdAt.toISOString(),
          updatedAt: session.user.updatedAt.toISOString(),
        },
        session: {
          token: session.token,
          expiresAt: session.expiresAt,
        },
      });
    } catch (error) {
      console.error('Get session error:', error);
      return res.status(500).json({
        error: 'Failed to get session',
      });
    }
  }

  @Post('convert-guest')
  async convertGuest(@Req() req: any, @Res() res: any) {
    try {
      // Get session token from cookie
      const sessionToken = req.cookies['better-auth.session_token'];

      if (!sessionToken) {
        return res.status(401).json({
          error: 'Not authenticated',
          message: 'Please log in first',
        });
      }

      // Find session to get user ID
      const session = await this.guestAuthService['prisma'].session.findUnique({
        where: { token: sessionToken },
        include: { user: true },
      });

      if (!session) {
        return res.status(401).json({
          error: 'Invalid session',
          message: 'Please log in again',
        });
      }

      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          error: 'Missing fields',
          message: 'Email and password are required',
        });
      }

      // Convert guest account
      const result = await this.guestAuthService.convertGuestToPermament(
        session.userId,
        email,
        password,
      );

      return res.json(result);
    } catch (error) {
      console.error('Convert guest error:', error);
      return res.status(error.status || 500).json({
        error: 'Failed to convert account',
        message: error.message,
      });
    }
  }

  // Handles both guest sessions (raw token cookie set by createGuest) and better-auth sessions
  // (possibly "token.signature", possibly the __Secure- cookie name); better-auth's own sign-out
  // doesn't recognise the guest cookie, which left guests signed in after "Sign out"
  @Post('sign-out')
  async signOut(@Req() req: any, @Res() res: any) {
    const cookieNames = ['better-auth.session_token', '__Secure-better-auth.session_token'];
    const tokens = cookieNames
      .map((name) => req.cookies?.[name])
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .flatMap((value) => [value, value.split('.')[0]]);

    try {
      if (tokens.length > 0) {
        await this.guestAuthService['prisma'].session.deleteMany({
          where: { token: { in: tokens } },
        });
      }
    } catch (error) {
      console.error('Sign out error:', error);
    }

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };
    for (const name of cookieNames) {
      res.clearCookie(name, cookieOptions);
    }
    // better-auth's short-lived session cache cookie would otherwise keep answering for a few minutes
    res.clearCookie('better-auth.session_data', cookieOptions);
    res.clearCookie('__Secure-better-auth.session_data', cookieOptions);

    return res.json({ success: true });
  }

  @All('*')
  async handleAuth(@Req() req: any, @Res() res: any) {
    // Convert Express request to Web Request
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const headers = new Headers();
    Object.keys(req.headers).forEach((key) => {
      const value = req.headers[key];
      if (typeof value === 'string') {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => headers.append(key, v));
      }
    });

    const webRequest = new Request(url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method)
        ? undefined
        : JSON.stringify(req.body),
    });

    const response = await auth.handler(webRequest);

    // Set headers from Web Response to Express response
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    // Set status code and send body
    res.status(response.status);
    const body = await response.text();
    return res.send(body);
  }
}
