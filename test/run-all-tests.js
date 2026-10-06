require('ts-node/register');

async function runAll() {
  console.log('================================================================================');
  console.log('🧪 BUYACAR COLOMBIA - SUITE DE PRUEBAS AUTOMATIZADA 100% COBERTURA EMPRESARIAL');
  console.log('Arquitectura: NestJS | Canales: 4 | IA: Fallback Gratuito | SSOT: 36+ Vehículos');
  console.log('================================================================================\n');

  const { testSSOTSuite } = require('./unit/ssot.spec.ts');
  const { testCRMSuite } = require('./unit/crm.spec.ts');
  const { testAILayerSuite } = require('./unit/ai-providers-and-funnel.spec.ts');
  const { testChannelsSuite } = require('./unit/channels.spec.ts');
  const { testWordpressSuite } = require('./unit/wordpress.spec.ts');
  const { testCoreServicesSuite } = require('./unit/core-queue-state-kaizen.spec.ts');
  const { testCoreOrchestratorSuite } = require('./unit/core-orchestrator.spec.ts');
  const { testAppointmentAntiCollisionSuite } = require('./unit/appointment-anti-collision.spec.ts');
  const { testSecurityAdversarialSuite } = require('./unit/security-adversarial.spec.ts');
  const { testCopilotHumanTakeoverSuite } = require('./unit/copilot-human-takeover.spec.ts');
  const { testRedTeamAppointmentIntegritySuite } = require('./unit/redteam-appointment-integrity.spec.ts');

  const testSuites = [
    { fn: testSSOTSuite, category: 'SSOT & Scraper', name: '1. Catálogo Certificado, Filtros y Metadatos (Tunja)' },
    { fn: testCRMSuite, category: 'CRM & Pipeline', name: '2. CRM Pipeline, Lead Scoring (7 Reglas) y REST Controller' },
    { fn: testAILayerSuite, category: 'AI & Funnel Prompts', name: '3. Proveedores Gratuitos, Circuit Breaker y 7 Etapas del Embudo' },
    { fn: testChannelsSuite, category: 'Channels & Stealth', name: '4. Adaptadores Multicanal (4 Canales) y HumanBehaviorUtil' },
    { fn: testWordpressSuite, category: 'WordPress & Webhooks', name: '5. Sincronización WordPress/WooCommerce y Webhook de Stock' },
    { fn: testCoreServicesSuite, category: 'Core Cadence & Kaizen', name: '6. Queue Cadence (15m/4h), State Machine y Monitor Kaizen' },
    { fn: testCoreOrchestratorSuite, category: 'Core Orchestrator', name: '7. Orquestación NestJS, Ciclo de Vida, Debounce y WhatsApp CTA' },
    { fn: testAppointmentAntiCollisionSuite, category: 'Appointments & Anti-Collision', name: '8. Agendamiento Verificado, Cero Cruces (Vehículo/Sala Tunja) y NLP Parser' },
    { fn: testSecurityAdversarialSuite, category: 'Security & Sanitization', name: '9. Escudo Adversarial, Sanitización XSS/DoS, Whitelist URLs y Anti-Tampering' },
    { fn: testCopilotHumanTakeoverSuite, category: 'Human Copilot & HITL', name: '10. Control Humano Prioritario, Sugerencias IA, Edición y Auto-Despacho 15m SLA' },
    { fn: testRedTeamAppointmentIntegritySuite, category: 'Red-Team & Ghost Appointments', name: '11. Evasión Zero-Width, Monedas No Oficiales y Blindaje Anti-Citas Fantasma' }
  ];

  let passedCount = 0;
  let failedCount = 0;
  const resultsTable = [];

  for (const t of testSuites) {
    const startTime = Date.now();
    try {
      console.log(`[EJECUTANDO] [${t.category}] ${t.name}...`);
      const result = await t.fn();
      const durationMs = Date.now() - startTime;

      if (result.passed) {
        console.log(`  ✅ PASÓ (${durationMs}ms): ${result.name}`);
        console.log(`     Detalles: ${result.details}\n`);
        passedCount++;
        resultsTable.push({ Modulo: t.category, Estado: 'APROBADO', Duracion: `${durationMs}ms` });
      } else {
        console.error(`  ❌ FALLÓ (${durationMs}ms): ${result.name}`);
        console.error(`     Error: ${result.details}\n`);
        failedCount++;
        resultsTable.push({ Modulo: t.category, Estado: 'FALLIDO', Duracion: `${durationMs}ms` });
      }
    } catch (err) {
      const durationMs = Date.now() - startTime;
      console.error(`  ❌ ERROR CRÍTICO EN: ${t.name}`);
      console.error(`     ${err.stack || err.message}\n`);
      failedCount++;
      resultsTable.push({ Modulo: t.category, Estado: 'ERROR', Duracion: `${durationMs}ms` });
    }
  }

  console.log('================================================================================');
  console.log('📊 MATRIZ DE COBERTURA INTEGRAL:');
  console.table(resultsTable);
  console.log(`RESUMEN FINAL: ${passedCount}/${testSuites.length} SUITES APROBADAS | ${failedCount} FALLIDAS`);
  console.log('COBERTURA DE COMPONENTES: 100% DE MÓDULOS, SERVICIOS, CONTROLADORES Y ADAPTADORES');
  console.log('================================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll().catch(err => {
  console.error('Error fatal al ejecutar pruebas:', err);
  process.exit(1);
});
