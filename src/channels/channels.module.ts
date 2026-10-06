import { Module } from '@nestjs/common';
import { ChannelRegistryService } from './channel-registry.service';
import { PlaywrightWorkerService } from './facebook/playwright-worker.service';
import { FBMarketplaceAdapter } from './facebook/fb-marketplace.adapter';
import { WhatsAppWebService } from './whatsapp/whatsapp-web.service';
import { WhatsAppAdapter } from './whatsapp/whatsapp.adapter';
import { InstagramWebService } from './instagram/instagram-web.service';
import { InstagramAdapter } from './instagram/instagram.adapter';
import { TikTokWebService } from './tiktok/tiktok-web.service';
import { TikTokAdapter } from './tiktok/tiktok.adapter';

@Module({
  providers: [
    ChannelRegistryService,
    PlaywrightWorkerService,
    FBMarketplaceAdapter,
    WhatsAppWebService,
    WhatsAppAdapter,
    InstagramWebService,
    InstagramAdapter,
    TikTokWebService,
    TikTokAdapter
  ],
  exports: [
    ChannelRegistryService,
    FBMarketplaceAdapter,
    WhatsAppAdapter,
    InstagramAdapter,
    TikTokAdapter
  ]
})
export class ChannelsModule {}
