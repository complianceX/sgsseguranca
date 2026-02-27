import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const token = (request.cookies as Record<string, string>)?.['access_token'];
    if (token) {
      request.headers.authorization = `Bearer ${token}`;
    }
    return super.canActivate(context);
  }
}
