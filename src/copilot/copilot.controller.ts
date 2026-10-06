import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { CopilotService } from './copilot.service';
import { ApproveCopilotDto, SendManualCopilotDto, CopilotMode } from './copilot.interface';

@Controller('copilot')
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Get('pending')
  getPendingMessages() {
    return {
      success: true,
      pendingCount: this.copilotService.getPendingMessages().length,
      autoDispatchDelayMinutes: Math.round(this.copilotService.getAutoDispatchDelayMs() / 60000),
      messages: this.copilotService.getPendingMessages()
    };
  }

  @Get('stats')
  getStats() {
    return {
      success: true,
      stats: this.copilotService.getStats()
    };
  }

  @Post('approve/:id')
  async approveMessage(@Param('id') id: string, @Body() body: ApproveCopilotDto) {
    return await this.copilotService.approveMessage(id, body);
  }

  @Post('reject/:id')
  rejectMessage(@Param('id') id: string) {
    const success = this.copilotService.discardMessage(id);
    return {
      success,
      message: success ? 'Sugerencia descartada exitosamente.' : 'Mensaje no encontrado o ya procesado.'
    };
  }

  @Post('send-manual')
  async sendManualMessage(@Body() body: SendManualCopilotDto) {
    const success = await this.copilotService.sendManualMessage(body);
    return {
      success,
      message: success ? 'Mensaje manual despachado al cliente.' : 'Error al enviar mensaje por el canal.'
    };
  }

  @Post('mode')
  setMode(@Body() body: { mode: CopilotMode; delayMinutes?: number }) {
    if (body.mode) {
      this.copilotService.setMode(body.mode);
    }
    if (typeof body.delayMinutes === 'number' && body.delayMinutes >= 0) {
      this.copilotService.setAutoDispatchDelayMs(body.delayMinutes * 60000);
    }
    return {
      success: true,
      currentMode: this.copilotService.getMode(),
      autoDispatchDelayMinutes: Math.round(this.copilotService.getAutoDispatchDelayMs() / 60000)
    };
  }
}
