import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { resolveAllowedCorsOrigins } from '../common/security/cors-origins';
import { AuthPrincipalService } from '../auth/auth-principal.service';

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

  constructor(private readonly authPrincipalService: AuthPrincipalService) {}

  afterInit() {
    this.logger.log('Init');
  }

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth.token ||
        client.handshake.headers.authorization) as string;
      if (!token) {
        client.disconnect();
        return;
      }

      const bearerToken = token.startsWith('Bearer ') ? token.slice(7) : token;
      await this.authorizeAndJoin(client, bearerToken);
      this.logger.log(`Client connected: ${client.id}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private async authorizeAndJoin(client: Socket, token: string): Promise<void> {
    try {
      const principal =
        await this.authPrincipalService.verifyAndResolveAccessToken(token);

      void client.join(`user:${principal.userId}`);
      if (principal.companyId) {
        void client.join(`company:${principal.companyId}`);
      }
    } catch {
      client.disconnect();
    }
  }

  sendToUser(userId: string, event: string, data: Record<string, any>) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  sendToCompany(companyId: string, event: string, data: Record<string, any>) {
    this.server.to(`company:${companyId}`).emit(event, data);
  }
}
