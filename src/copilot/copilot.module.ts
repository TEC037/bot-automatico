import { Module, forwardRef } from '@nestjs/common';
import { CopilotService } from './copilot.service';
import { CopilotController } from './copilot.controller';
import { ChannelsModule } from '../channels/channels.module';
import { CRMModule } from '../crm/crm.module';
import { CoreModule } from '../core/core.module';

@Module({
  imports: [
    ChannelsModule,
    CRMModule,
    forwardRef(() => CoreModule)
  ],
  controllers: [CopilotController],
  providers: [CopilotService],
  exports: [CopilotService]
})
export class CopilotModule {}
