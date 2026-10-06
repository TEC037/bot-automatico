import { Module } from '@nestjs/common';
import { GeminiFreeProvider } from './providers/gemini-free.provider';
import { GroqProvider } from './providers/groq.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { AIOrchestratorService } from './ai-orchestrator.service';
import { FunnelPromptBuilder } from './funnel-prompt-builder.service';
import { SSOTModule } from '../ssot/ssot.module';

@Module({
  imports: [SSOTModule],
  providers: [
    GeminiFreeProvider,
    GroqProvider,
    OllamaProvider,
    AIOrchestratorService,
    FunnelPromptBuilder
  ],
  exports: [
    AIOrchestratorService,
    FunnelPromptBuilder
  ]
})
export class AIModule {}
