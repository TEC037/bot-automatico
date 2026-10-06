import { Injectable, Logger } from '@nestjs/common';
import { SSOTCatalogService } from '../ssot/ssot-catalog.service';

export interface SanitizedInputResult {
  sanitizedText: string;
  originalLength: number;
  isBlocked: boolean;
  threatDetected: boolean;
  threatCategory?: string;
  threatReason?: string;
  flags: string[];
}

export interface SanitizedOutputResult {
  safeOutput: string;
  isModified: boolean;
  violationsFound: string[];
}

@Injectable()
export class SanitizerGuardrailService {
  private readonly logger = new Logger(SanitizerGuardrailService.name);
  private readonly maxInputLength = 600;

  // Dominios estrictamente autorizados para enlaces salientes
  private readonly allowedDomains = [
    'wa.me',
    'buyacar.com.co',
    'maps.google.com',
    'google.com/maps'
  ];

  constructor(private readonly ssotCatalog: SSOTCatalogService) {}

  /**
   * Sanitiza la entrada del usuario eliminando caracteres de control, scripts,
   * etiquetas HTML, delimitadores de rol del LLM y limitando la longitud máxima.
   */
  sanitizeInput(rawInput: string): SanitizedInputResult {
    if (!rawInput || typeof rawInput !== 'string') {
      return {
        sanitizedText: '',
        originalLength: 0,
        isBlocked: false,
        threatDetected: false,
        flags: ['EMPTY_INPUT']
      };
    }

    const originalLength = rawInput.length;
    const flags: string[] = [];
    let text = rawInput;

    // 1. Limitar longitud máxima para prevenir ataques DoS / Context-Window Stuffing
    if (text.length > this.maxInputLength) {
      text = text.substring(0, this.maxInputLength);
      flags.push('LENGTH_TRUNCATED');
    }

    // 2. Limpieza de caracteres de control invisibles, Zero-Width spaces y secuencias ANSI
    const cleanText = text
      // Eliminar bytes nulos y caracteres de control excepto saltos de línea y tabulaciones comunes
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
      // Eliminar caracteres Zero-Width invisibles y marcas de formato bidireccional (utilizados para evasión stealth)
      .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD\u202A-\u202E]/g, '')
      // Eliminar secuencias ANSI escape
      .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');

    if (cleanText.length !== text.length) {
      flags.push('CONTROL_CHARS_REMOVED');
      text = cleanText;
    }

    // 3. Sanitización de XSS, etiquetas HTML y atributos peligrosos
    const htmlRegex = /<\/?(?:script|iframe|embed|object|link|style|applet|meta|svg|base)[\s\S]*?>/gi;
    if (htmlRegex.test(text)) {
      flags.push('MALICIOUS_HTML_STRIPPED');
      text = text.replace(htmlRegex, '');
    }

    // Neutralizar manejadores de eventos en cualquier etiqueta restante (ej: onerror=, onload=, onclick=)
    const eventHandlerRegex = /\b(?:on\w+)\s*=\s*(?:["'][^"']*["']|[^\s>]+)/gi;
    if (eventHandlerRegex.test(text)) {
      flags.push('EVENT_HANDLERS_STRIPPED');
      text = text.replace(eventHandlerRegex, '');
    }

    // Neutralizar esquemas de pseudo-protocolo en texto (javascript:, vbscript:, data:text/html)
    const schemeRegex = /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/gi;
    if (schemeRegex.test(text)) {
      flags.push('DANGEROUS_SCHEME_STRIPPED');
      text = text.replace(schemeRegex, '[blocked_scheme]:');
    }

    // 4. Neutralizar delimitadores de inyección de prompt del LLM
    const promptDelimiters = [
      /###\s*(?:System|Assistant|Human|User|Instruction):?/gi,
      /<<\s*SYS\s*>>[\s\S]*?<<\s*\/SYS\s*>>/gi,
      /<\|im_start\|>[\s\S]*?<\|im_end\|>/gi,
      /<\|system\|>/gi,
      /<\|user\|>/gi,
      /<\|assistant\|>/gi,
      /\[INST\][\s\S]*?\[\/INST\]/gi
    ];

    for (const delim of promptDelimiters) {
      if (delim.test(text)) {
        flags.push('PROMPT_DELIMITER_STRIPPED');
        text = text.replace(delim, ' ');
      }
    }

    // 5. Análisis de intención adversarial y trampas
    const adversarialCheck = this.detectAdversarialIntent(text);

    return {
      sanitizedText: text.trim(),
      originalLength,
      isBlocked: adversarialCheck.isAdversarial,
      threatDetected: adversarialCheck.isAdversarial,
      threatCategory: adversarialCheck.category,
      threatReason: adversarialCheck.reason,
      flags
    };
  }

  /**
   * Detecta patrones de ataque adversarial, inyección de instrucciones,
   * robo de información, manipulación de precio y engaño.
   */
  detectAdversarialIntent(text: string): { isAdversarial: boolean; category?: string; reason?: string } {
    const lower = text.toLowerCase();
    // Normalizar texto deobfuscado (eliminar puntos, guiones o espacios entre letras individuales como I.G.N.O.R.A)
    const deobfuscated = lower.replace(/([a-záéíóúñ])[\s._-]+(?=[a-záéíóúñ])/gi, '$1');
    const textsToCheck = [lower, deobfuscated];

    // 1. Jailbreak / Prompt Override
    const jailbreakPatterns = [
      /ignora\s+(?:todas\s+)?(?:las\s+)?instrucciones(?:\s+anteriores|\s+previas)?/i,
      /ignore\s+(?:all\s+)?previous\s+instructions/i,
      /disregard\s+(?:all\s+)?(?:prior|previous)\s+(?:directives|rules|guidelines|instructions)/i,
      /olvida\s+(?:tus\s+reglas|todo\s+lo\s+anterior|tus\s+instrucciones)/i,
      /forget\s+(?:all\s+)?(?:your\s+)?(?:rules|instructions)/i,
      /ahora\s+eres\s+(?:un\s+bot\s+libre|dan|libre\s+de\s+reglas|un\s+desarrollador)/i,
      /you\s+are\s+now\s+(?:dan|unrestricted|in\s+developer\s+mode)/i,
      /system\s+override/i,
      /override\s+(?:system\s+)?prompt/i,
      /modo\s+desarrollador\s+activado/i,
      /act[uú]a\s+como\s+si\s+no\s+tuvieras\s+reglas/i
    ];

    for (const t of textsToCheck) {
      for (const pattern of jailbreakPatterns) {
        if (pattern.test(t)) {
          return {
            isAdversarial: true,
            category: 'PROMPT_INJECTION_JAILBREAK',
            reason: 'Intento de anulación o alteración de las directivas del sistema.'
          };
        }
      }
    }

    // 2. Prompt Leaking & Extracción de Secretos del Sistema
    const leakPatterns = [
      /muestra\s+(?:tu\s+)?(?:system\s+prompt|prompt\s+completo|instrucciones\s+internas)/i,
      /show\s+(?:me\s+)?(?:your\s+)?(?:system\s+prompt|instructions|initial\s+prompt)/i,
      /repite\s+(?:palabra\s+por\s+palabra\s+)?(?:todo\s+el\s+texto\s+anterior|tus\s+instrucciones)/i,
      /cu[aá]les\s+son\s+tus\s+reglas\s+(?:ocultas|secretas|del\s+sistema)/i,
      /revela\s+(?:la\s+configuraci[oó]n|tu\s+c[oó]digo\s+fuente|tu\s+prompt)/i
    ];

    for (const t of textsToCheck) {
      for (const pattern of leakPatterns) {
        if (pattern.test(t)) {
          return {
            isAdversarial: true,
            category: 'PROMPT_LEAKING',
            reason: 'Intento de extracción de directivas privadas del sistema o código fuente.'
          };
        }
      }
    }

    // 3. Extracción de Datos Confidenciales / PII / Infiltración del Servidor
    const dataExfilPatterns = [
      /crm_leads\.json/i,
      /base\s+de\s+datos\s+de\s+(?:clientes|leads|usuarios)/i,
      /dame\s+(?:los\s+)?(?:tel[eé]fonos|nombres|contactos)\s+de\s+(?:otros\s+)?(?:clientes|compradores)/i,
      /database\s+dump/i,
      /variables\s+de\s+entorno/i,
      /environment\s+variables|\.env/i,
      /package\.json/i,
      /exec\(|powershell|cmd\.exe|bash|eval\(/i
    ];

    for (const t of textsToCheck) {
      for (const pattern of dataExfilPatterns) {
        if (pattern.test(t)) {
          return {
            isAdversarial: true,
            category: 'DATA_EXFILTRATION_ATTEMPT',
            reason: 'Intento de acceso o divulgación de datos confidenciales o archivos del servidor.'
          };
        }
      }
    }

    // 4. Manipulación Fraudulenta de Precios y Regateo Extremo Ficticio
    const priceFraudPatterns = [
      /te\s+(?:compro|pago)\s+(?:por\s+)?(?:\$?\s*(?:0|1|10|100|500|1\.?000|5\.?000|10\.?000|50\.?000))\s*(?:pesos|cop)?/i,
      /\b(?:cien|doscientos|trescientos|cuatrocientos|quinientos|mil|dos\s+mil|cinco\s+mil|diez\s+mil|veinte\s+mil|cincuenta\s+mil|cien\s+mil)\s+pesos\b/i,
      /\b\d+\s+(?:d[oó]lares|usd|euros)\b/i,
      /confirma\s+que\s+(?:me\s+lo\s+regalas|me\s+lo\s+vendes\s+por\s+\$?1)/i,
      /el\s+due[nñ]o\s+(?:me\s+autoriz[oó]|me\s+dio)\s+(?:un\s+)?(?:90%|95%|99%|100%)\s+de\s+descuento/i,
      /di\s+que\s+el\s+precio\s+es\s+(?:cero|\$0|gratis)/i,
      /di\s+['"]trato\s+cerrado\s+por\s+/i
    ];

    for (const t of textsToCheck) {
      for (const pattern of priceFraudPatterns) {
        if (pattern.test(t)) {
          return {
            isAdversarial: true,
            category: 'PRICE_TAMPERING_FRAUD',
            reason: 'Intento de manipulación fraudulenta de precio o engaño comercial.'
          };
        }
      }
    }

    // 5. Suplantación Bancaria y Enlaces de Phishing
    const phishingPatterns = [
      /(?:consigna(?:r|me|ci[oó]n)?|transfi[eé][ra]me|transfer(?:ir|encia)?|deposita(?:r|me)?|env[ií]a(?:r|me)?)\s+(?:el\s+(?:anticipo|dinero|pago)\s+)?a\s+(?:mi\s+|esta\s+)?(?:nequi|daviplata|bancolombia|cuenta)/i,
      /(?:nequi|daviplata|bancolombia)\s*(?::\s*)?\d{7,15}/i,
      /transfi[eé][ra]me\s+a\s+(?:mi\s+)?(?:nequi|daviplata|cuenta)/i,
      /cuenta\s+personal(?:\s+de\s+ahorros)?/i,
      /a\s+mi\s+nequi/i
    ];

    for (const pattern of phishingPatterns) {
      if (pattern.test(lower)) {
        return {
          isAdversarial: true,
          category: 'PHISHING_ACCOUNT_INJECTION',
          reason: 'Intento de inyección de cuentas bancarias no autorizadas o transacciones irregulares.'
        };
      }
    }

    // 6. Coerción Legal y Exigencia de Garantías Imposibles
    const legalCoercionPatterns = [
      /garant[ií]za(?:me)?\s+(?:bajo\s+pena\s+de\s+demanda|por\s+escrito\s+que\s+nunca\s+se\s+da[nñ]ar[aá]|de\s+por\s+vida)/i,
      /firma\s+aqu[ií]\s+que\s+este\s+carro\s+es\s+perfecto/i
    ];

    for (const pattern of legalCoercionPatterns) {
      if (pattern.test(lower)) {
        return {
          isAdversarial: true,
          category: 'LEGAL_ENTRAPMENT',
          reason: 'Intento de forzar declaraciones jurídicas indebidas o garantías no contempladas en ley.'
        };
      }
    }

    return { isAdversarial: false };
  }

  /**
   * Sanitiza y aplica guardrails sobre la salida generada por el LLM antes de ser entregada al usuario.
   * Evita fugas de información interna, manipulación de precio, scripts y enlaces no autorizados.
   */
  sanitizeOutput(output: string, context: { vehicleId?: string; originalStage?: string; confirmedAppointmentId?: string } = {}): SanitizedOutputResult {
    if (!output || typeof output !== 'string') {
      return { safeOutput: '', isModified: false, violationsFound: [] };
    }

    let text = output;
    let isModified = false;
    const violationsFound: string[] = [];

    // 1. Eliminar cualquier etiqueta HTML o script que el LLM pudiera haber emitido
    const htmlRegex = /<\/?(?:script|iframe|embed|object|link|style)[\s\S]*?>/gi;
    if (htmlRegex.test(text)) {
      violationsFound.push('OUTPUT_HTML_TAGS_STRIPPED');
      text = text.replace(htmlRegex, '');
      isModified = true;
    }

    // 2. Guardrail de Precios: Prevenir alucinación o reducción fraudulenta de precio respecto al SSOT
    if (context.vehicleId) {
      const car = this.ssotCatalog.findById(context.vehicleId);
      if (car) {
        // Detectar si el texto menciona un monto inferior al 80% del valor de lista oficial
        const priceMatches = text.match(/\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:\s*(?:COP|pesos|millones))?/gi);
        if (priceMatches) {
          for (const match of priceMatches) {
            const rawDigits = match.replace(/[^\d]/g, '');
            const parsedNum = parseInt(rawDigits, 10);
            
            // Si el monto detectado es absurdo (ej: menos de 5 millones en un vehículo que vale 50M+)
            if (parsedNum > 0 && parsedNum < car.priceCop * 0.75) {
              violationsFound.push(`PRICE_TAMPERING_DETECTED (Detected: ${match} vs Official: ${car.formattedPrice})`);
              // Reemplazar la alucinación con el precio oficial de lista certificado
              text = text.replace(match, car.formattedPrice);
              isModified = true;
            }
          }
        }
      }
    }

    // 3. Whitelist Estricta de Enlaces y URLs Salientes
    const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
    text = text.replace(urlRegex, (url) => {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        const isAllowed = this.allowedDomains.some(domain => host === domain || host.endsWith('.' + domain));

        if (!isAllowed) {
          violationsFound.push(`UNAUTHORIZED_URL_BLOCKED: ${url}`);
          isModified = true;
          // Reemplazar con el enlace verificado de WhatsApp
          const meta = this.ssotCatalog.getDealershipMeta();
          return meta.whatsapp;
        }
        return url;
      } catch {
        violationsFound.push(`MALFORMED_URL_STRIPPED: ${url}`);
        isModified = true;
        return '';
      }
    });

    // 4. Guardrail de Términos Internos del Sistema (System Leaking Prevention)
    const systemTermsRegex = /\b(?:SSOTCatalogService|crm_leads\.json|GeminiFreeProvider|GroqProvider|OllamaProvider|AIOrchestratorService|FunnelPromptBuilder)\b/gi;
    if (systemTermsRegex.test(text)) {
      violationsFound.push('SYSTEM_INTERNAL_TERMS_STRIPPED');
      text = text.replace(systemTermsRegex, 'nuestro sistema de gestión comercial');
      isModified = true;
    }

    // 5. Garantizar que no se emitan acuerdos fraudulentos de regalo o costo cero
    if (/te\s+(?:lo\s+regalo|lo\s+doy\s+gratis|lo\s+vendo\s+en\s+cero)/i.test(text)) {
      violationsFound.push('GIFT_PROMISE_HALLUCINATION_BLOCKED');
      const meta = this.ssotCatalog.getDealershipMeta();
      text = `Nuestros vehículos cuentan con precio de lista oficial con peritaje 100% certificado en Tunja. Con gusto te atiende un asesor en WhatsApp: ${meta.whatsapp}`;
      isModified = true;
    }

    // 6. Guardrail Anti-Citas Fantasma (Ghost Appointment Prevention)
    // Previene categóricamente que se prometa o confirme una cita si no hay un ID de cita persistido en disco
    const ghostAppointmentRegex = /(?:tu\s+cita\s+qued[oó]\s+agendada|qued[oó]\s+agendada\s+para\s+el|tu\s+cita\s+est[aá]\s+confirmada|te\s+esperamos.*para\s+tu\s+cita|quedaste\s+agendado)/i;
    if (ghostAppointmentRegex.test(text) && !context.confirmedAppointmentId) {
      violationsFound.push('GHOST_APPOINTMENT_ANNOUNCEMENT_BLOCKED');
      const meta = this.ssotCatalog.getDealershipMeta();
      text = `Con mucho gusto te ayudamos a agendar tu cita oficial en nuestra sala de Tunja frente a la Toyota. Por favor indícanos tu fecha y horario preferido (Lunes a Sábado, 8am-12pm o 2pm-6pm) para apartar el turno oficial sin cruces: ${meta.whatsapp}`;
      isModified = true;
    }

    return {
      safeOutput: text.trim(),
      isModified,
      violationsFound
    };
  }

  /**
   * Genera una respuesta segura de escudo ante intentos hostiles o engaños detectados,
   * manteniendo la compostura profesional y canalizando al asesor humano en Tunja.
   */
  getShieldResponse(attackCategory: string, vehicleId?: string): string {
    const meta = this.ssotCatalog.getDealershipMeta();
    const car = vehicleId ? this.ssotCatalog.findById(vehicleId) : null;

    this.logger.warn(`[Shield Activado] Categoría: [${attackCategory}]. Generando respuesta segura estandarizada.`);

    if (attackCategory === 'PRICE_TAMPERING_FRAUD' && car) {
      return `El precio oficial de lista de la ${car.name} es de ${car.formattedPrice} con peritaje certificado en Tunja. No manejamos descuentos no autorizados. WhatsApp oficial: ${meta.whatsapp}`;
    }

    if (attackCategory === 'PHISHING_ACCOUNT_INJECTION') {
      return `Por tu seguridad, BuyaCar únicamente recibe apartados y pagos a través de los canales institucionales verificados en nuestra sala de ventas en Tunja (${meta.address}). Contáctanos directamente: ${meta.whatsapp}`;
    }

    // Respuesta genérica de contención defensiva
    return `En BuyaCar Colombia en Tunja (${meta.address}) brindamos atención comercial personalizada con vehículos 100% certificados. Puedes comunicarte directamente con nuestro equipo oficial aquí: ${meta.whatsapp}`;
  }
}
