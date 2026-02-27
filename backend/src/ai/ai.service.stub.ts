import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor() {
    this.logger.log(
      'AiService stub initialized - AI features temporarily disabled',
    );
  }

  async generateChecklist(params: any) {
    throw new Error('AI Service temporarily disabled');
  }

  async generateDds() {
    throw new Error('AI Service temporarily disabled');
  }
}
