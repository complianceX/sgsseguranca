import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { PdfSecurityController } from './controllers/pdf-security.controller';
import { SessionsController } from './controllers/sessions.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { PdfRateLimitService } from './services/pdf-rate-limit.service';
import { SessionsService } from './services/sessions.service';
import { BruteForceService } from './brute-force.service';
import { TokenRevocationService } from './token-revocation.service';
import { TurnstileService } from './turnstile.service';
import { UserSession } from './entities/user-session.entity';
import {
  getAccessTokenSecret,
  getAccessTokenTtl,
  isInfiniteTtl,
} from './auth-security.config';
import type { SignOptions } from 'jsonwebtoken';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([UserSession]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const jwtSecret = getAccessTokenSecret(configService);
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
    SessionsService,
    BruteForceService,
    TokenRevocationService,
    TurnstileService,
  ],
  controllers: [AuthController, PdfSecurityController, SessionsController],
  exports: [
    AuthService,
    JwtModule,
    PdfRateLimitService,
    TokenRevocationService,
  ],
})
export class AuthModule {}
