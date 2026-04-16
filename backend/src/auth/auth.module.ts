import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
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
import { AuthPrincipalService } from './auth-principal.service';
import { UserMfaCredential } from './entities/user-mfa-credential.entity';
import { UserMfaRecoveryCode } from './entities/user-mfa-recovery-code.entity';
import { MfaService } from './services/mfa.service';
import { LoginAnomalyService } from './services/login-anomaly.service';
import { PwnedPasswordService } from './services/pwned-password.service';
import {
  getAccessTokenSecret,
  getAccessTokenTtl,
  isInfiniteTtl,
} from './auth-security.config';
import type { SignOptions } from 'jsonwebtoken';

@Module({
  imports: [
    UsersModule,
    forwardRef(() => MailModule),
    PassportModule,
    TypeOrmModule.forFeature([
      UserSession,
      UserMfaCredential,
      UserMfaRecoveryCode,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const jwtSecret = getAccessTokenSecret(configService);
        const configuredAccessTokenTtl =
          configService.get<string>('ACCESS_TOKEN_TTL')?.trim() ||
          configService.get<string>('JWT_EXPIRES_IN')?.trim();
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
    AuthPrincipalService,
    JwtStrategy,
    JwtRefreshStrategy,
    PdfRateLimitService,
    SessionsService,
    BruteForceService,
    TokenRevocationService,
    TurnstileService,
    MfaService,
    LoginAnomalyService,
    PwnedPasswordService,
  ],
  controllers: [AuthController, PdfSecurityController, SessionsController],
  exports: [
    AuthService,
    AuthPrincipalService,
    JwtModule,
    PdfRateLimitService,
    TokenRevocationService,
    MfaService,
  ],
})
export class AuthModule {}
