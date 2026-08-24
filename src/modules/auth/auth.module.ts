import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthenticationService } from './authentication.service';
import { AccessJwtAuthGuard } from './guards/access-jwt-auth.guard';
import { AuthenticatedUserGuard } from './guards/authenticated-user.guard';
import { AdminGuard } from './guards/admin.guard';
import { AuthController } from './auth.controller';
import { AuthorizationService } from './authorization.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    UserModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret?.trim()) {
          throw new Error('JWT_SECRET is required');
        }
        const expiresIn =
          AuthenticationService.resolveAccessExpiresInSeconds(configService);
        return {
          secret,
          signOptions: {
            expiresIn,
            algorithm: 'HS256',
          },
        };
      },
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
