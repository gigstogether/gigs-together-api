import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthenticationService } from './authentication.service';
import { AUTH_CONFIG, AuthConfigModule } from './auth-config.module';
import type { AuthConfig } from './auth-config.module';
import { AccessJwtAuthGuard } from './guards/access-jwt-auth.guard';
import { AuthenticatedUserGuard } from './guards/authenticated-user.guard';
import { AdminGuard } from './guards/admin.guard';
import { AuthController } from './auth.controller';
import { AuthorizationService } from './authorization.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    UserModule,
    AuthConfigModule,
    JwtModule.registerAsync({
      imports: [AuthConfigModule],
      inject: [AUTH_CONFIG],
      useFactory: (authConfig: AuthConfig) => ({
        secret: authConfig.accessSecret,
        signOptions: {
          expiresIn: authConfig.accessExpiresInSeconds,
          algorithm: 'HS256',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthenticationService,
    AuthorizationService,
    AccessJwtAuthGuard,
    AuthenticatedUserGuard,
    AdminGuard,
  ],
  exports: [
    AuthorizationService,
    AuthenticationService,
    AccessJwtAuthGuard,
    AuthenticatedUserGuard,
    AdminGuard,
    JwtModule,
  ],
})
export class AuthModule {}
