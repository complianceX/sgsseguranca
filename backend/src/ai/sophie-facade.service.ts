import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';
import { SstAgentService } from './sst-agent/sst-agent.service';
import { SophieEngineService } from '../sophie/sophie.engine.service';
import { AnalyzePtDto } from './dto/analyze-pt.dto';
import { GenerateChecklistDto } from './dto/generate-checklist.dto';
import { CreateAssistedChecklistDto } from './dto/create-assisted-checklist.dto';
import {
  CreateAssistedDdsDto,
  GenerateDdsDto,
} from './dto/generate-dds.dto';
import { GenerateSophieReportDto } from './dto/generate-sophie-report.dto';

@Injectable()
export class SophieFacadeService {
  constructor(
    private readonly aiService: AiService,
    private readonly sstAgentService: SstAgentService,
    private readonly sophieEngineService: SophieEngineService,
  ) {}

  getStatus() {
    const agent = this.sstAgentService.getRuntimeStatus();
    const knowledgeBase = this.sophieEngineService.getVersion();
    const automation = this.aiService.getAutomationRuntimeStatus();

    return {
      agent,
      knowledgeBase,
      automation,
      capabilities: {
        openAiProvider: true,
        insights: true,
        analyzeApr: true,
        analyzePt: true,
        analyzeChecklist: true,
        generateDds: true,
        generateChecklist: true,
        createChecklist: true,
        createDds: true,
        queueMonthlyReport: true,
        phase2RiskGate: true,
        phase2ChecklistAutoNc: automation.phase2Enabled,
        chat: true,
        history: true,
        imageAnalysis: agent.imageAnalysisEnabled,
        sstKnowledgeBase: true,
      },
    };
  }

  getInsights() {
    return this.aiService.getInsights();
  }

  analyzeApr(description: string) {
    return this.aiService.analyzeApr(description);
  }

  analyzePt(payload: AnalyzePtDto) {
    return this.aiService.analyzePt(payload as any);
  }

  analyzeChecklist(id: string) {
    return this.aiService.analyzeChecklist(id);
  }

  generateDds(payload?: GenerateDdsDto) {
    return this.aiService.generateDds(payload);
  }

  generateChecklist(payload: GenerateChecklistDto) {
    return this.aiService.generateChecklist(payload as any);
  }

  createChecklist(payload: CreateAssistedChecklistDto) {
    return this.aiService.createChecklist(payload);
  }

  createDds(payload: CreateAssistedDdsDto) {
    return this.aiService.createDds(payload);
  }

  queueMonthlyReport(payload: GenerateSophieReportDto) {
    return this.aiService.queueMonthlyReport(payload);
  }
}
