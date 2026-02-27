import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Delete,
} from '@nestjs/common';
import { Request } from 'express';
import { PushService } from './push.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface RequestWithUser extends Request {
  user: {
    id: string;
    [key: string]: any;
  };
}

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('public-key')
  getPublicKey() {
    return this.pushService.getPublicKey();
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  async subscribe(
    @Req() req: RequestWithUser,
    @Body()
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    await this.pushService.addSubscription(req.user.id, subscription);
    return { success: true };
  }

  @Delete('unsubscribe')
  @UseGuards(JwtAuthGuard)
  async unsubscribe(@Body() body: { endpoint: string }) {
    await this.pushService.removeSubscription(body.endpoint);
    return { success: true };
  }
}
