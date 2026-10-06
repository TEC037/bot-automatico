import { Module, forwardRef } from '@nestjs/common';
import { QueueService } from './queue.service';
import { StateMachineService } from './state-machine.service';
import { KaizenMonitorService } from './kaizen-monitor.service';
import { CoreOrchestratorService } from './core-orchestrator.service';
import { KaizenController } from './kaizen.controller';
import { ChannelsModule } from '../channels/channels.module';
import { AIModule } from '../ai/ai.module';
import { CRMModule } from '../crm/crm.module';
import { SSOTModule } from '../ssot/ssot.module';
import { AppointmentModule } from '../appointments/appointment.module';
import { SecurityModule } from '../security/security.module';
import { CopilotModule } from '../copilot/copilot.module';

@Module({
  imports: [ChannelsModule, AIModule, CRMModule, SSOTModule, AppointmentModule, SecurityModule, forwardRef(() => CopilotModule)],
  controllers: [KaizenController],
  providers: [
    QueueService,
    StateMachineService,
    KaizenMonitorService,
    CoreOrchestratorService
  ],
  exports: [
    QueueService,
    StateMachineService,
    KaizenMonitorService,
    CoreOrchestratorService
  ]
})
export class CoreModule {}
