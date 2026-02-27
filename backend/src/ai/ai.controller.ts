import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { AnalyzePtDto } from './dto/analyze-pt.dto';
import { GenerateChecklistDto } from './dto/generate-checklist.dto';
import { ChatDto } from './dto/chat.dto';
import { AnalyzeAprDto } from './dto/analyze-apr.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantInterceptor)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(@Body() body: ChatDto) {
    return this.aiService.chat(body.message, body.context as any);
  }

  @Post('insights')
  async getInsights() {
    return this.aiService.getInsights();
  }

  @Post('analyze-apr')
  async analyzeApr(@Body() body: AnalyzeAprDto) {
    return this.aiService.analyzeApr(body.description);
  }

  @Post('analyze-pt')
  async analyzePt(@Body() body: AnalyzePtDto) {
    return this.aiService.analyzePt(body as any);
  }

  @Get('analyze-checklist/:id')
  async analyzeChecklist(@Param('id') id: string) {
    return this.aiService.analyzeChecklist(id);
  }

  @Post('generate-dds')
  async generateDds() {
    return this.aiService.generateDds();
  }

  @Post('generate-checklist')
  async generateChecklist(@Body() body: GenerateChecklistDto) {
    return this.aiService.generateChecklist(body as any);
  }
}
