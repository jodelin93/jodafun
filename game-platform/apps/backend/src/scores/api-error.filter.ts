import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

// Formats HTTP errors (including validation errors) as { error: string }
@Catch(HttpException)
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const body = exception.getResponse();
    const message = typeof body === 'string' ? body : (body as any)?.message;
    res.status(exception.getStatus()).json({
      error: Array.isArray(message) ? message.join(', ') : message || exception.message,
    });
  }
}
