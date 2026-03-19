import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor() {
    this.logger.log(
      'AiService stub initialized - AI features temporarily disabled',
    );
  }

  generateChecklist(_params: unknown): Promise<never> {
    return Promise.reject(new Error('AI Service temporarily disabled'));
  }

  generateDds(): Promise<never> {
    return Promise.reject(new Error('AI Service temporarily disabled'));
  }
}
