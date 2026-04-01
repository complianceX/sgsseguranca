import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { resolveAllowedCorsOrigins } from '../common/security/cors-origins';

interface JwtPayload {
  sub: string;
  email: string;
  companyId?: string;
}

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = resolveAllowedCorsOrigins({
  isProduction,
  configuredOriginsRaw: process.env.CORS_ALLOWED_ORIGINS,
});

@WebSocketGateway({
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('NotificationsGateway');

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('Init');
  }

  handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth.token ||
        client.handshake.headers.authorization) as string;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // Join user room
      void client.join(`user:${payload.sub}`);
      // Join company room
      if (payload.companyId) {
        void client.join(`company:${payload.companyId}`);
      }

      this.logger.log(`Client connected: ${client.id}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  sendToUser(userId: string, event: string, data: Record<string, any>) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  sendToCompany(companyId: string, event: string, data: Record<string, any>) {
    this.server.to(`company:${companyId}`).emit(event, data);
  }
}
