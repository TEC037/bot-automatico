import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('BuyaCarBootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug']
  });

  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log('========================================================================');
  logger.log(`🚗 BUYACAR COLOMBIA - ENTERPRISE MULTI-CHANNEL AI CHAT CORE`);
  logger.log(`Servidor iniciado y escuchando en: http://localhost:${port}`);
  logger.log(`Sede Central: Tunja, Boyacá`);
  logger.log(`Canales: Facebook Marketplace, WhatsApp Web, Instagram Direct, TikTok`);
  logger.log(`Capa de IA Gratuita: Gemini 2.0 Flash -> Groq Llama 3.1 -> Ollama Local`);
  logger.log(`Cadencia: Cooldown 15m | Máx 4 comunicaciones/hora/usuario`);
  logger.log(`CRM Endpoints: GET /crm/pipeline, GET /crm/leads, PATCH /crm/leads/:id/stage`);
  logger.log('========================================================================');
}

bootstrap();
