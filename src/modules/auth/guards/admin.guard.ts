import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Requires `req.user.isAdmin === true`. How `isAdmin` is set on `req.user` is not this guard's concern.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.user?.isAdmin !== true) {
      throw new ForbiddenException('Admin privileges required');
    }
    return true;
  }
}
