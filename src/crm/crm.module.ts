import { Module } from '@nestjs/common';
import { CRMService } from './crm.service';
import { CRMController } from './crm.controller';

@Module({
  controllers: [CRMController],
  providers: [CRMService],
  exports: [CRMService]
})
export class CRMModule {}
