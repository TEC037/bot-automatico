import { Module } from '@nestjs/common';
import { WordpressService } from './wordpress.service';
import { WordpressController } from './wordpress.controller';
import { SSOTModule } from '../ssot/ssot.module';

@Module({
  imports: [SSOTModule],
  controllers: [WordpressController],
  providers: [WordpressService],
  exports: [WordpressService]
})
export class WordpressModule {}
