import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MustChangePasswordGuard } from './guards/must-change-password.guard';
import { LoggerService } from '../../common/logging/logger.service';
import { EmailModule } from '../email/email.module';

/**
 * AuthModule registers two APP_GUARDs:
 *   1. JwtAuthGuard  — authenticates the bearer token, populates request.user
 *   2. MustChangePasswordGuard — enforces the admin first-sign-in lockout
 *
 * These are registered AHEAD of AuthzModule's guards (PermissionsGuard,
 * OwnershipGuard) via the import order in app.module.ts.
 */
@Module({
  imports: [
    EmailModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<string>('jwt.expiresIn', '15m') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    LoggerService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: MustChangePasswordGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
