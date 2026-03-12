import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { PdfRateLimitService } from './services/pdf-rate-limit.service';
import { BruteForceService } from './brute-force.service';
import { getAccessTokenTtl, isInfiniteTtl } from './auth-security.config';

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
        const accessTokenTtl =
          configService.get<string>('ACCESS_TOKEN_TTL') || getAccessTokenTtl();
        const signOptions = isInfiniteTtl(accessTokenTtl)
          ? {}
          : ({ expiresIn: accessTokenTtl } as any);
        return { secret: jwtSecret, signOptions };
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
  controllers: [AuthController],
  exports: [AuthService, JwtModule, PdfRateLimitService],
})
export class AuthModule {}
