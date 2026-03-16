import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { WorkerHeartbeatService } from './worker-heartbeat.service';

@Injectable()
export class WorkerHeartbeatReporterService implements OnModuleInit {
  private readonly logger = new Logger(WorkerHeartbeatReporterService.name);

  constructor(private readonly workerHeartbeat: WorkerHeartbeatService) {}

  async onModuleInit(): Promise<void> {
    await this.reportHeartbeat('worker-bootstrap');
  }

  @Interval(30_000)
  async refreshHeartbeat(): Promise<void> {
    await this.reportHeartbeat('worker-loop');
  }

  private async reportHeartbeat(source: string): Promise<void> {
    if (!this.workerHeartbeat.isEnabled()) {
      return;
    }

    try {
      await this.workerHeartbeat.touch(source);
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
