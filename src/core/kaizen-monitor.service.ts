import { Injectable, Logger } from '@nestjs/common';

export interface KaizenMetrics {
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
  successRate: number; // 0 - 100%
  averageLatencyMs: number;
  kaizenScore: number; // 0 - 100
  status: 'EXCELLENT' | 'STABLE' | 'NEEDS_IMPROVEMENT';
}

@Injectable()
export class KaizenMonitorService {
  private readonly logger = new Logger(KaizenMonitorService.name);
  private totalProcessed = 0;
  private totalSuccess = 0;
  private totalFailed = 0;
  private latencies: number[] = [];

  recordInteraction(success: boolean, latencyMs: number): void {
    this.totalProcessed += 1;
    if (success) {
      this.totalSuccess += 1;
    } else {
      this.totalFailed += 1;
    }

    this.latencies.push(latencyMs);
    if (this.latencies.length > 100) {
      this.latencies.shift(); // Mantener muestra móvil de 100
    }
  }

  getMetrics(): KaizenMetrics {
    const successRate = this.totalProcessed > 0 
      ? Math.round((this.totalSuccess / this.totalProcessed) * 100) 
      : 100;

    const avgLatency = this.latencies.length > 0
      ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length)
      : 2500;

    // Cálculo dinámico del Puntaje Kaizen (0 - 100)
    // 1. Tasa de éxito (50 pts)
    const successPoints = (successRate / 100) * 50;
    // 2. Penalización de latencia (30 pts si < 4000ms, decae si > 8000ms)
    let latencyPoints = 30;
    if (avgLatency > 5000) latencyPoints = 20;
    if (avgLatency > 10000) latencyPoints = 10;
    // 3. Estabilidad de fallback (20 pts)
    const stabilityPoints = this.totalFailed === 0 ? 20 : Math.max(0, 20 - this.totalFailed * 2);

    const kaizenScore = Math.min(100, Math.round(successPoints + latencyPoints + stabilityPoints));

    let status: 'EXCELLENT' | 'STABLE' | 'NEEDS_IMPROVEMENT' = 'STABLE';
    if (kaizenScore >= 85) status = 'EXCELLENT';
    else if (kaizenScore < 70) status = 'NEEDS_IMPROVEMENT';

    return {
      totalProcessed: this.totalProcessed,
      totalSuccess: this.totalSuccess,
      totalFailed: this.totalFailed,
      successRate,
      averageLatencyMs: avgLatency,
      kaizenScore,
      status
    };
  }
}
