import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { PushSubscription } from './entities/push-subscription.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription])],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
