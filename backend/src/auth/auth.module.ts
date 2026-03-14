import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { PdfSecurityController } from './controllers/pdf-security.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { PdfRateLimitService } from './services/pdf-rate-limit.service';
import { BruteForceService } from './brute-force.service';
import { getAccessTokenTtl, isInfiniteTtl } from './auth-security.config';
import type { SignOptions } from 'jsonwebtoken';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const jwtSecret = configService.get<string>('JWT_SECRET');
        if (!jwtSecret) {
          throw new Error('JWT_SECRET is required');
        }
        const configuredAccessTokenTtl =
          configService.get<string>('ACCESS_TOKEN_TTL');
        const accessTokenTtl = (configuredAccessTokenTtl?.trim() ||
          getAccessTokenTtl()) as NonNullable<SignOptions['expiresIn']>;
        const signOptions: JwtSignOptions | undefined = isInfiniteTtl(
          accessTokenTtl,
        )
          ? undefined
          : { expiresIn: accessTokenTtl };
        return signOptions
          ? { secret: jwtSecret, signOptions }
          : { secret: jwtSecret };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    PdfRateLimitService,
    BruteForceService,
  ],
  controllers: [AuthController, PdfSecurityController],
  exports: [AuthService, JwtModule, PdfRateLimitService],
})
export class AuthModule {}
