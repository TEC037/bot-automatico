import { Module } from '@nestjs/common';
import { ChannelsModule } from './channels/channels.module';
import { SSOTModule } from './ssot/ssot.module';
import { AIModule } from './ai/ai.module';
import { CRMModule } from './crm/crm.module';
import { WordpressModule } from './wordpress/wordpress.module';
import { CoreModule } from './core/core.module';
import { AppointmentModule } from './appointments/appointment.module';
import { SecurityModule } from './security/security.module';
import { CopilotModule } from './copilot/copilot.module';

@Module({
  imports: [
    ChannelsModule,
    SSOTModule,
    AIModule,
    CRMModule,
    WordpressModule,
    CoreModule,
    AppointmentModule,
    SecurityModule,
    CopilotModule
  ]
})
export class AppModule {}
