import { Controller, Get, Header, Res } from '@nestjs/common';
import { Response } from 'express';
import { KaizenMonitorService, KaizenMetrics } from './kaizen-monitor.service';
import { ChannelRegistryService } from '../channels/channel-registry.service';
import { SSOTCatalogService } from '../ssot/ssot-catalog.service';
import { CRMService } from '../crm/crm.service';

@Controller('kaizen')
export class KaizenController {
  private readonly startTime = Date.now();

  constructor(
    private readonly kaizenMonitor: KaizenMonitorService,
    private readonly channelRegistry: ChannelRegistryService,
    private readonly ssotCatalog: SSOTCatalogService,
    private readonly crmService: CRMService
  ) {}

  @Get('metrics')
  getMetrics(): KaizenMetrics {
    return this.kaizenMonitor.getMetrics();
  }

  @Get('status')
  async getStatus(): Promise<any> {
    const metrics = this.kaizenMonitor.getMetrics();
    const channels = this.channelRegistry.getAllAdapters().map(ch => ({
      name: ch.name,
      isHealthy: ch.isHealthy()
    }));
    const inventoryCount = this.ssotCatalog.getAllCars().length;
    const leads = this.crmService.getAllLeads();
    const pipeline = this.crmService.getPipelineSummary();

    return {
      system: 'BuyaCar Multi-Channel Automation Core',
      version: '2.0.0-kaizen',
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      kaizen: metrics,
      channels,
      inventory: {
        totalCertificadosTunja: inventoryCount,
        dealership: this.ssotCatalog.getDealershipMeta()
      },
      crm: {
        totalLeads: leads.length,
        pipelineSummary: pipeline
      }
    };
  }

  @Get('dashboard')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getDashboard(): string {
    const metrics = this.kaizenMonitor.getMetrics();
    const inventory = this.ssotCatalog.getAllCars();
    const channels = this.channelRegistry.getAllAdapters();
    const pipeline = this.crmService.getPipelineSummary();
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    const scoreColor = metrics.kaizenScore >= 85 ? '#10b981' : metrics.kaizenScore >= 70 ? '#f59e0b' : '#ef4444';

    const channelRows = channels.map(ch => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #1e293b; border-radius: 8px; margin-bottom: 8px;">
        <span style="font-weight: 600; text-transform: capitalize;">${ch.name.replace('_', ' ')}</span>
        <span style="padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; background: ${ch.isHealthy() ? '#065f46; color: #34d399;' : '#7f1d1d; color: #f87171;'}">
          ${ch.isHealthy() ? 'ONLINE / ACTIVO' : 'OFFLINE'}
        </span>
      </div>
    `).join('');

    const pipelineBars = Object.entries(pipeline).map(([stage, data]) => `
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
          <span><b>${stage}</b> (${data.count} leads)</span>
          <span style="color: #94a3b8;">Score prom: ${data.avgScore}/100</span>
        </div>
        <div style="width: 100%; height: 8px; background: #334155; border-radius: 4px; overflow: hidden;">
          <div style="width: ${Math.min(100, data.count * 20)}%; height: 100%; background: #3b82f6;"></div>
        </div>
      </div>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BuyaCar - Panel Kaizen de Mejora Continua</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 1100px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; }
    .card-title { font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 8px; }
    .card-value { font-size: 28px; font-weight: 800; }
    .score-badge { display: inline-block; padding: 6px 14px; border-radius: 9999px; font-weight: bold; font-size: 14px; }
    .panel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media(max-width: 768px) { .panel-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1 style="margin: 0; font-size: 24px;">🚗 BuyaCar Tunja - Monitor Kaizen de IA</h1>
        <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 14px;">Estrategia Cero Tokens Pagos | Multicanal Anti-Ban | Sedes Tunja, Boyacá</p>
      </div>
      <div>
        <span class="score-badge" style="background: ${scoreColor}22; color: ${scoreColor}; border: 1px solid ${scoreColor};">
          Kaizen Score: ${metrics.kaizenScore}/100 [${metrics.status}]
        </span>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">Tasa de Entrega Exitosa</div>
        <div class="card-value" style="color: #10b981;">${metrics.successRate}%</div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">${metrics.totalSuccess} exitosas / ${metrics.totalProcessed} totales</div>
      </div>
      <div class="card">
        <div class="card-title">Latencia Promedio IA</div>
        <div class="card-value" style="color: #38bdf8;">${metrics.averageLatencyMs} ms</div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Fallback: Gemini $\rightarrow$ Groq $\rightarrow$ Ollama</div>
      </div>
      <div class="card">
        <div class="card-title">Inventario SSOT Activo</div>
        <div class="card-value" style="color: #fbbf24;">${inventory.length} Autos</div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Certificados en sala de venta Tunja</div>
      </div>
      <div class="card">
        <div class="card-title">Uptime del Motor</div>
        <div class="card-value" style="color: #a78bfa;">${uptime}s</div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Cadencia activa: 15m cooldown / 4h max</div>
      </div>
    </div>

    <div class="panel-grid">
      <div class="card">
        <div class="card-title" style="margin-bottom: 16px;">Estado de Adaptadores Multicanal</div>
        ${channelRows}
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom: 16px;">Pipeline Comercial CRM & Lead Scoring</div>
        ${pipelineBars}
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }
}
