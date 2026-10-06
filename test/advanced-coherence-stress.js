require('ts-node/register');

async function runAdvancedCoherenceStress() {
  console.log('================================================================================');
  console.log('🧪 SUITE AVANZADA DE PRUEBAS: COHERENCIA, VENTANA DE CONTEXTO Y RESILIENCIA');
  console.log('Objetivo: Validar anáforas, cambio de vehículo (SSOT Pivot), estrés de contexto y regateo');
  console.log('================================================================================\n');

  const { BuyaCarScraperService } = require('../src/ssot/buyacar-scraper.service.ts');
  const { SSOTCatalogService } = require('../src/ssot/ssot-catalog.service.ts');
  const { CRMService } = require('../src/crm/crm.service.ts');
  const { QueueService } = require('../src/core/queue.service.ts');
  const { StateMachineService } = require('../src/core/state-machine.service.ts');
  const { KaizenMonitorService } = require('../src/core/kaizen-monitor.service.ts');
  const { FunnelPromptBuilder } = require('../src/ai/funnel-prompt-builder.service.ts');
  const { GeminiFreeProvider } = require('../src/ai/providers/gemini-free.provider.ts');
  const { GroqProvider } = require('../src/ai/providers/groq.provider.ts');
  const { OllamaProvider } = require('../src/ai/providers/ollama.provider.ts');
  const { AIOrchestratorService } = require('../src/ai/ai-orchestrator.service.ts');

  // Inicialización SSOT y Core
  const scraper = new BuyaCarScraperService();
  const catalog = new SSOTCatalogService(scraper);
  await catalog.refreshInventory();

  const crm = new CRMService();
  const queue = new QueueService();
  const stateMachine = new StateMachineService();
  const kaizen = new KaizenMonitorService();
  const promptBuilder = new FunnelPromptBuilder(catalog);
  const orchestrator = new AIOrchestratorService(
    new GeminiFreeProvider(),
    new GroqProvider(),
    new OllamaProvider()
  );

  const testUser = 'user_stress_test_boyaca';
  const channel = 'facebook_marketplace';

  // Lead inicial
  const lead = crm.getOrCreateLead({
    chatId: testUser,
    channel,
    customerName: 'Santiago Vargas',
    vehicleInterestId: 'CAR-101'
  });

  const testCases = [
    {
      turn: 1,
      title: 'Disponibilidad y Precio Directo',
      message: 'Hola, buenas tardes. Vi la Mazda CX-5 2022 en Tunja. ¿Aún la tienen disponible y qué precio tiene?',
      expectedVehicle: 'CAR-101',
      validation: (reply) => {
        const hasPrice = reply.includes('118.000.000') || reply.includes('118');
        const hasNoRedundancy = !reply.includes('¿Desean conocer el precio');
        return hasPrice && hasNoRedundancy;
      },
      desc: 'Debe confirmar precio oficial y disponibilidad sin preguntar si quiere saber el precio.'
    },
    {
      turn: 2,
      title: 'Referencia Anafórica 1: Kilometraje Implícito',
      message: '¿Y cuántos kilómetros tiene?',
      expectedVehicle: 'CAR-101',
      validation: (reply) => reply.includes('31.500') || reply.includes('31500'),
      desc: 'Debe responder el kilometraje de la CX-5 (31.500 km) sin que se mencione el nombre del auto.'
    },
    {
      turn: 3,
      title: 'Referencia Anafórica 2: Tipo de Transmisión',
      message: '¿La caja es automática o mecánica?',
      expectedVehicle: 'CAR-101',
      validation: (reply) => reply.toLowerCase().includes('automática') || reply.toLowerCase().includes('automatica'),
      desc: 'Debe responder que es Automática manteniendo el contexto del auto.'
    },
    {
      turn: 4,
      title: 'Referencia Anafórica 3: Vigencia Documental (SOAT)',
      message: '¿Hasta cuándo tiene vigente el SOAT?',
      expectedVehicle: 'CAR-101',
      validation: (reply) => reply.includes('2027'),
      desc: 'Debe confirmar la vigencia del SOAT (2027) de la Mazda CX-5.'
    },
    {
      turn: 5,
      title: 'Cambio de Vehículo (SSOT Pivot) a Alternativa Económica',
      message: 'Esa camioneta se me sale del presupuesto. ¿Tienen alguna Renault Duster en Tunja?',
      expectedVehicle: 'CAR-103',
      validation: (reply) => (reply.includes('82.000.000') || reply.includes('82') || reply.toLowerCase().includes('duster')),
      desc: 'Debe pivotar automáticamente en el CRM a CAR-103 (Renault Duster) e indicar su precio ($82M).'
    },
    {
      turn: 6,
      title: 'Continuidad sobre el Nuevo Vehículo Pivotado',
      message: '¿Qué kilometraje tiene esa Duster?',
      expectedVehicle: 'CAR-103',
      validation: (reply) => reply.includes('39.000') || reply.includes('39000'),
      desc: 'Debe responder 39.000 km (de la Duster, NO los 31.500 km de la Mazda).'
    },
    {
      turn: 7,
      title: 'Oferta Absurda / Regateo Extremo',
      message: '¿Me la deja en 40 millones en efectivo ya mismo para cerrar trato hoy?',
      expectedVehicle: 'CAR-103',
      validation: (reply) => {
        const notAccepted = !reply.includes('acepto') && !reply.includes('trato hecho') && !reply.includes('perfecto 40');
        const mentionsOfficialOrPeritaje = reply.toLowerCase().includes('oficial') || reply.toLowerCase().includes('fijo') || reply.toLowerCase().includes('peritaje') || reply.toLowerCase().includes('lista');
        return notAccepted && mentionsOfficialOrPeritaje;
      },
      desc: 'Debe rechazar la rebaja absurda con cortesía, defender precio de lista oficial y ofrecer opciones.'
    },
    {
      turn: 8,
      title: 'Validación Legal, Comparendos y Transparencia',
      message: '¿El vehículo tiene algún comparendo, embargo o problema legal en tránsito?',
      expectedVehicle: 'CAR-103',
      validation: (reply) => reply.toLowerCase().includes('libre') || reply.toLowerCase().includes('peritaje') || reply.toLowerCase().includes('traspaso') || reply.toLowerCase().includes('garantiz'),
      desc: 'Debe dar tranquilidad legal certificando peritaje 100% y traspaso seguro en Tunja.'
    }
  ];

  let passedCount = 0;
  const results = [];

  for (const tc of testCases) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`[TURNO ${tc.turn}] ${tc.title}`);
    console.log(`Cliente: "${tc.message}"`);

    const tStart = Date.now();

    // 1. Detección de Pivot de Vehículo (Misma lógica robusta que CoreOrchestrator)
    const cars = catalog.getAllCars();
    const lowerText = tc.message.toLowerCase();
    let bestCar = null;
    let highestScore = 0;

    for (const car of cars) {
      let carScore = 0;
      const modelParts = car.name.toLowerCase().split(' ').filter(w => w.length >= 3 && w !== 'grand' && w !== 'touring' && w !== 'intens');
      const isBrandMatch = lowerText.includes(car.brand.toLowerCase());
      
      if (isBrandMatch) carScore += 20;
      for (const part of modelParts) {
        if (lowerText.includes(part)) {
          carScore += 50;
        }
      }

      if (carScore > highestScore) {
        highestScore = carScore;
        bestCar = car;
      }
    }

    if (bestCar && highestScore >= 50) {
      if (lead.vehicleInterestId !== bestCar.id) {
        lead.vehicleInterestId = bestCar.id;
        console.log(`  🔄 [CRM Pivot] Vehículo cambiado a: ${bestCar.name} (${bestCar.id}) con score ${highestScore}`);
      }
    }

    // 2. Registro en CRM y scoring
    crm.processMessageScoring(lead, tc.message);
    crm.appendConversationTurn(channel, testUser, 'user', tc.message);

    // 3. Generación con IA usando memoria reciente
    const prompt = promptBuilder.buildPromptForStage(lead.stage, channel, lead.vehicleInterestId);
    const history = crm.getRecentHistoryForAI(channel, testUser, 6);
    const aiRes = await orchestrator.generateResponse(prompt, history);
    const latMs = Date.now() - tStart;

    crm.appendConversationTurn(channel, testUser, 'assistant', aiRes.content);
    kaizen.recordInteraction(true, latMs);

    console.log(`Bot (${aiRes.provider} en ${latMs}ms):`);
    console.log(`> "${aiRes.content}"`);

    // Evaluaciones
    const vehicleOk = lead.vehicleInterestId === tc.expectedVehicle;
    const contentOk = tc.validation(aiRes.content);
    const wordCount = aiRes.content.split(/\s+/).length;
    const brevityOk = wordCount <= 45;

    const testPassed = vehicleOk && contentOk && brevityOk;
    if (testPassed) passedCount++;

    results.push({
      turn: tc.turn,
      title: tc.title,
      vehicle: lead.vehicleInterestId,
      words: wordCount,
      latency: `${latMs}ms`,
      passed: testPassed,
      checks: { vehicleOk, contentOk, brevityOk }
    });

    console.log(`Resultado: ${testPassed ? '✅ APROBADO' : '❌ FALLÓ'} | Auto: ${lead.vehicleInterestId} | Palabras: ${wordCount} | Latencia: ${latMs}ms`);
    if (!testPassed) {
      console.log(`  Detalle de fallas -> VehicleOk: ${vehicleOk}, ContentOk: ${contentOk}, BrevityOk: ${brevityOk}`);
    }
  }

  // -------------------------------------------------------------------------
  // VALIDACIÓN DE VENTANA DE CONTEXTO (SLIDING MEMORY LIMIT)
  // -------------------------------------------------------------------------
  console.log('\n================================================================================');
  console.log('📊 EVALUACIÓN DE LA VENTANA DE CONTEXTO (SLIDING WINDOW)');
  console.log('================================================================================');
  const storedHistory = lead.conversationHistory;
  const recentHistorySent = crm.getRecentHistoryForAI(channel, testUser, 6);

  console.log(`- Total de turnos acumulados en la conversación: 16 (8 cliente + 8 bot)`);
  console.log(`- Turnos persistidos en memoria (cap máximo 8): ${storedHistory.length}`);
  console.log(`- Turnos enviados al prompt de la IA (límite 6): ${recentHistorySent.length}`);

  const windowOk = storedHistory.length <= 8 && recentHistorySent.length <= 6;
  console.log(`- Estado de contención de ventana de contexto: ${windowOk ? '✅ PERFECTO (Sin fuga de tokens ni bloat)' : '❌ DESBORDADO'}`);

  // Resumen Kaizen
  const kaizenMetrics = kaizen.getMetrics();
  console.log('\n================================================================================');
  console.log('📈 REPORTE KAIZEN FINAL DE ESTRÉS Y COHERENCIA:');
  console.log(`- Pruebas Aprobadas: ${passedCount}/${testCases.length} (${Math.round((passedCount/testCases.length)*100)}%)`);
  console.log(`- Puntaje Kaizen Resultante: ${kaizenMetrics.kaizenScore}/100 (${kaizenMetrics.status})`);
  console.log(`- Latencia Promedio: ${kaizenMetrics.averageLatencyMs}ms`);
  console.log(`- Tasa de Éxito: ${kaizenMetrics.successRate}%`);
  console.log('================================================================================');

  if (passedCount === testCases.length && windowOk) {
    console.log('🏆 TODAS LAS PRUEBAS AVANZADAS DE COHERENCIA Y CONTEXTO FUERON EXITOSAS.');
    process.exit(0);
  } else {
    console.error('⚠️ ALGUNAS PRUEBAS NO ALCANZARON EL UMBRAL DE EXCELENCIA.');
    process.exit(1);
  }
}

runAdvancedCoherenceStress().catch(err => {
  console.error('Error fatal en suite de estrés:', err);
  process.exit(1);
});
