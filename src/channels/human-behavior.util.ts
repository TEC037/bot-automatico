import { Page } from 'playwright';

export class HumanBehaviorUtil {
  /**
   * Pausa aleatoria entre min y max milisegundos
   */
  static async sleep(minMs: number, maxMs: number): Promise<void> {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retraso humano previo a responder: entre 15 y 40 segundos
   */
  static async responseDelay(): Promise<void> {
    const delay = Math.floor(Math.random() * (40000 - 15000 + 1)) + 15000;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Tipeo estocástico carácter por carácter con pausas de pensamiento
   * Imita la velocidad variable de un operador humano (45-130ms por letra)
   */
  static async typeStochastic(page: Page, selector: string, text: string): Promise<void> {
    await page.waitForSelector(selector, { state: 'visible', timeout: 15000 });
    await page.click(selector);
    await this.sleep(300, 700);

    for (const char of text) {
      // Retraso por tecla entre 45ms y 130ms
      const delay = Math.floor(Math.random() * (130 - 45 + 1)) + 45;
      await page.keyboard.type(char, { delay });

      // Pausa de pensamiento humano (3% de probabilidad, entre 300ms y 900ms)
      if (Math.random() < 0.03) {
        await this.sleep(300, 900);
      }
    }
  }

  /**
   * Movimiento curvo de ratón (Bézier simple) para evitar detección de teletransportación
   */
  static async moveMouseBezier(page: Page, targetX: number, targetY: number): Promise<void> {
    const steps = 15;
    const startX = Math.floor(Math.random() * 200) + 100;
    const startY = Math.floor(Math.random() * 200) + 100;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // Curva cuadrática simple
      const curX = Math.round((1 - t) * startX + t * targetX + Math.sin(t * Math.PI) * 20);
      const curY = Math.round((1 - t) * startY + t * targetY + Math.cos(t * Math.PI) * 15);
      await page.mouse.move(curX, curY);
      await this.sleep(10, 25);
    }
  }
}
