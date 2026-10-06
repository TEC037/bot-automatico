import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Appointment, BookingRequest, BookingResult } from './appointment.interface';
import { SSOTCatalogService } from '../ssot/ssot-catalog.service';

@Injectable()
export class AppointmentService implements OnModuleInit {
  private readonly logger = new Logger(AppointmentService.name);
  private appointments: Map<string, Appointment> = new Map();
  private readonly storagePath = path.resolve(__dirname, '../../data/appointments.json');

  // Franjas horarias estándar de atención comercial en Tunja (Lunes a Sábado)
  readonly standardSlots = [
    '08:00', '09:00', '10:00', '11:00',
    '14:00', '15:00', '16:00', '17:00'
  ];

  // Máximo 2 citas simultáneas en sala de ventas en Tunja
  readonly maxShowroomCapacity = 2;

  constructor(private readonly ssotCatalog: SSOTCatalogService) {}

  onModuleInit(): void {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        const list: Appointment[] = JSON.parse(raw);
        for (const item of list) {
          this.appointments.set(item.id, item);
        }
        this.logger.log(`AppointmentService cargó ${this.appointments.size} citas confirmadas desde disco.`);
      }
    } catch (err: any) {
      this.logger.warn(`No se pudieron cargar citas previas: ${err.message}`);
    }
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(Array.from(this.appointments.values()), null, 2), 'utf-8');
    } catch (err: any) {
      this.logger.error(`Error guardando citas en disco: ${err.message}`);
    }
  }

  getAllAppointments(): Appointment[] {
    return Array.from(this.appointments.values());
  }

  getAppointmentsByDate(date: string): Appointment[] {
    return this.getAllAppointments().filter(a => a.date === date && a.status === 'CONFIRMED');
  }

  /**
   * Obtiene las franjas horarias libres y garantizadas sin cruce para una fecha y vehículo dado
   */
  getAvailableSlots(date: string, vehicleId?: string): string[] {
    const dayAppointments = this.getAppointmentsByDate(date);

    return this.standardSlots.filter(slot => {
      // 1. Cruce por capacidad total de la sala de ventas
      const slotTotalCount = dayAppointments.filter(a => a.timeSlot === slot).length;
      if (slotTotalCount >= this.maxShowroomCapacity) {
        return false;
      }

      // 2. Cruce estricto por vehículo: el mismo auto no puede ser probado por dos personas en la misma hora
      if (vehicleId) {
        const vehicleCollision = dayAppointments.some(a => a.timeSlot === slot && a.vehicleId === vehicleId);
        if (vehicleCollision) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Intenta agendar una cita verificando de forma atómica la prevención de cruces
   */
  bookAppointment(req: BookingRequest): BookingResult {
    // Validar formato de fecha (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.date)) {
      return {
        success: false,
        reason: 'INVALID_DATE',
        message: 'La fecha proporcionada no es válida.',
        availableAlternatives: []
      };
    }

    // Validar que la fecha no sea en el pasado
    const todayStr = new Date().toISOString().split('T')[0];
    if (req.date < todayStr) {
      return {
        success: false,
        reason: 'DATE_IN_THE_PAST',
        message: `No es posible agendar en fechas pasadas (${req.date}). Por favor elige una fecha presente o futura.`,
        availableAlternatives: []
      };
    }

    // Validar que no sea Domingo (la sala de Tunja atiende de Lunes a Sábado)
    const [year, month, day] = req.date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    if (dateObj.getDay() === 0) {
      return {
        success: false,
        reason: 'CLOSED_ON_SUNDAYS',
        message: 'Nuestra sala de ventas en Tunja no atiende los domingos. Te esperamos con gusto de Lunes a Sábado.',
        availableAlternatives: []
      };
    }

    // Validar franja horaria dentro del horario de atención
    if (!this.standardSlots.includes(req.timeSlot)) {
      const available = this.getAvailableSlots(req.date, req.vehicleId);
      return {
        success: false,
        reason: 'OUTSIDE_HOURS',
        message: `El horario ${req.timeSlot} está fuera del horario comercial (8:00am a 12:00pm y 2:00pm a 6:00pm).`,
        availableAlternatives: available
      };
    }

    const availableSlots = this.getAvailableSlots(req.date, req.vehicleId);

    // Verificación estricta de cruce: el horario solicitado DEBE estar disponible
    if (!availableSlots.includes(req.timeSlot)) {
      this.logger.warn(`[Anti-Colisión] Intento de cruce evitado: Vehículo [${req.vehicleId}] o sala ocupada el ${req.date} a las ${req.timeSlot}`);
      return {
        success: false,
        reason: 'SLOT_OCCUPIED',
        message: `El horario de las ${req.timeSlot} ya se encuentra reservado para evitar cruces con otros clientes.`,
        availableAlternatives: availableSlots.slice(0, 3)
      };
    }

    // Resolver nombre del vehículo desde el catálogo SSOT si no viene especificado
    let carName = req.vehicleName;
    if (!carName && req.vehicleId) {
      const car = this.ssotCatalog.findById(req.vehicleId);
      if (car) carName = car.name;
    }

    const appointment: Appointment = {
      id: `APT-${Date.now()}-${Math.floor(Math.random() * 900) + 100}`,
      chatId: req.chatId,
      channel: req.channel,
      customerName: req.customerName || 'Cliente BuyaCar',
      vehicleId: req.vehicleId,
      vehicleName: carName || 'Vehículo Certificado',
      date: req.date,
      timeSlot: req.timeSlot,
      durationMinutes: 60,
      status: 'CONFIRMED',
      notes: req.notes,
      createdAt: new Date().toISOString()
    };

    this.appointments.set(appointment.id, appointment);
    this.saveToDisk();

    this.logger.log(`[Cita Confirmada] ID=${appointment.id} | ${appointment.customerName} | ${appointment.vehicleName} | Fecha: ${appointment.date} @ ${appointment.timeSlot} en Tunja`);

    return {
      success: true,
      appointment,
      message: `¡Cita confirmada exitosamente sin cruces para el ${appointment.date} a las ${appointment.timeSlot}!`
    };
  }

  cancelAppointment(id: string): boolean {
    const apt = this.appointments.get(id);
    if (!apt) return false;
    apt.status = 'CANCELLED';
    this.saveToDisk();
    this.logger.log(`Cita [${id}] cancelada.`);
    return true;
  }

  /**
   * Parser inteligente de fecha y hora para mensajes naturales de clientes
   * Detecta expresiones como "sábado a las 10", "mañana a las 3 pm", "viernes a las 11"
   */
  parseAppointmentIntent(text: string, now = new Date()): {
    hasIntent: boolean;
    date?: string;
    timeSlot?: string;
    dayLabel?: string;
  } {
    const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const intentWords = ['cita', 'agendar', 'verlo', 'verla', 'visitar', 'visita', 'probar', 'prueba', 'horario', 'pasar', 'ir a'];
    const hasIntent = intentWords.some(w => lower.includes(w));

    if (!hasIntent) {
      return { hasIntent: false };
    }

    // 1. Detectar día
    let targetDate = new Date(now);
    let dayLabel = '';

    if (lower.includes('hoy')) {
      dayLabel = 'hoy';
    } else if (lower.includes('manana')) {
      targetDate.setDate(targetDate.getDate() + 1);
      dayLabel = 'mañana';
    } else if (lower.includes('pasado manana')) {
      targetDate.setDate(targetDate.getDate() + 2);
      dayLabel = 'pasado mañana';
    } else {
      const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
      for (let i = 0; i < days.length; i++) {
        if (lower.includes(days[i])) {
          dayLabel = days[i];
          const currentDay = now.getDay();
          let diff = i - currentDay;
          if (diff <= 0) diff += 7; // Próximo día de la semana
          targetDate.setDate(now.getDate() + diff);
          break;
        }
      }
    }

    // Si es domingo, mover al lunes más próximo (la sala abre lunes a sábado)
    if (targetDate.getDay() === 0) {
      targetDate.setDate(targetDate.getDate() + 1);
    }

    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // 2. Detectar hora
    let timeSlot: string | undefined;

    const timeMatches = [
      { regex: /(?:a las|a la|tipo)?\s*(8|08)(?::00)?\s*(?:am|de la manana)?/i, slot: '08:00' },
      { regex: /(?:a las|a la|tipo)?\s*(9|09)(?::00)?\s*(?:am|de la manana)?/i, slot: '09:00' },
      { regex: /(?:a las|a la|tipo)?\s*(10)(?::00)?\s*(?:am|de la manana)?/i, slot: '10:00' },
      { regex: /(?:a las|a la|tipo)?\s*(11)(?::00)?\s*(?:am|de la manana)?/i, slot: '11:00' },
      { regex: /(?:a las|a la|tipo)?\s*(2|14)(?::00)?\s*(?:pm|de la tarde)?/i, slot: '14:00' },
      { regex: /(?:a las|a la|tipo)?\s*(3|15)(?::00)?\s*(?:pm|de la tarde)?/i, slot: '15:00' },
      { regex: /(?:a las|a la|tipo)?\s*(4|16)(?::00)?\s*(?:pm|de la tarde)?/i, slot: '16:00' },
      { regex: /(?:a las|a la|tipo)?\s*(5|17)(?::00)?\s*(?:pm|de la tarde)?/i, slot: '17:00' }
    ];

    for (const tm of timeMatches) {
      if (tm.regex.test(lower)) {
        timeSlot = tm.slot;
        break;
      }
    }

    return {
      hasIntent: true,
      date: dateStr,
      timeSlot,
      dayLabel: dayLabel || 'fecha solicitada'
    };
  }
}
