import { Module } from '@nestjs/common';
import { SanitizerGuardrailService } from './sanitizer-guardrail.service';
import { SSOTModule } from '../ssot/ssot.module';

@Module({
  imports: [SSOTModule],
  providers: [SanitizerGuardrailService],
  exports: [SanitizerGuardrailService]
})
export class SecurityModule {}
