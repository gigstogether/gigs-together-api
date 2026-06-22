import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Requires `req.user` (typically set by `AccessJwtAuthGuard`). Use after that guard on routes that
 * must not be anonymous.
 */
@Injectable()
export class AuthenticatedUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user) {
      throw new UnauthorizedException('Authentication required');
    }
    return true;
  }
}
