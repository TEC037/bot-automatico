import { Controller, Get, Patch, Param, Body, Query, NotFoundException } from '@nestjs/common';
import { CRMService } from './crm.service';
import { UpdateStageDto } from './dto/update-stage.dto';

@Controller('crm')
export class CRMController {
  constructor(private readonly crmService: CRMService) {}

  @Get('pipeline')
  getPipeline() {
    return {
      success: true,
      data: this.crmService.getPipelineSummary()
    };
  }

  @Get('leads')
  getLeads(@Query('channel') channel?: string) {
    let leads = this.crmService.getAllLeads();
    if (channel) {
      leads = leads.filter(l => l.channel === channel);
    }
    return {
      success: true,
      total: leads.length,
      data: leads
    };
  }

  @Patch('leads/:chatId/stage')
  updateLeadStage(
    @Param('chatId') chatId: string,
    @Query('channel') channel: string = 'facebook_marketplace',
    @Body() dto: UpdateStageDto
  ) {
    const updated = this.crmService.updateStage(chatId, channel, dto.stage, dto.notes);
    if (!updated) {
      throw new NotFoundException(`Lead con ID ${chatId} no encontrado en canal ${channel}`);
    }
    return {
      success: true,
      data: updated
    };
  }
}
