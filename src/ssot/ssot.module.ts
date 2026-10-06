import { Module } from '@nestjs/common';
import { BuyaCarScraperService } from './buyacar-scraper.service';
import { SSOTCatalogService } from './ssot-catalog.service';

@Module({
  providers: [BuyaCarScraperService, SSOTCatalogService],
  exports: [SSOTCatalogService, BuyaCarScraperService]
})
export class SSOTModule {}
