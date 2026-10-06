import { AppointmentService } from '../../src/appointments/appointment.service';
import { AppointmentController } from '../../src/appointments/appointment.controller';
import { SSOTCatalogService } from '../../src/ssot/ssot-catalog.service';
import { BuyaCarScraperService } from '../../src/ssot/buyacar-scraper.service';

export async function testAppointmentAntiCollisionSuite(): Promise<{ name: string; passed: boolean; details: string }> {
  const scraper = new BuyaCarScraperService();
  const catalog = new SSOTCatalogService(scraper);
  await catalog.refreshInventory();

  const service = new AppointmentService(catalog);
  const controller = new AppointmentController(service);

  const testDate = '2026-10-17'; // Sábado futuro

  // 1. Estado inicial de slots
  const initialSlots = service.getAvailableSlots(testDate, 'CAR-101');
  if (!initialSlots.includes('10:00') || initialSlots.length !== 8) {
    return { name: 'Initial Slots Availability', passed: false, details: 'Slots iniciales de atención en Tunja incorrectos' };
  }

  // 2. Reserva exitosa Cliente A para Mazda CX-5 (CAR-101) a las 10:00
  const bookA = service.bookAppointment({
    chatId: 'user_cliente_a',
    channel: 'facebook_marketplace',
    customerName: 'Cliente A',
    vehicleId: 'CAR-101',
    date: testDate,
    timeSlot: '10:00'
  });

  if (!bookA.success || !bookA.appointment || bookA.appointment.status !== 'CONFIRMED') {
    return { name: 'Booking Client A', passed: false, details: 'Reserva inicial de Cliente A falló' };
  }

  // 3. GARANTÍA ANTI-CRUCE POR VEHÍCULO: Cliente B solicita el mismo auto a la misma hora
  const bookB = service.bookAppointment({
    chatId: 'user_cliente_b',
    channel: 'whatsapp',
    customerName: 'Cliente B',
    vehicleId: 'CAR-101', // Mismo vehículo
    date: testDate,
    timeSlot: '10:00' // Misma hora
  });

  if (bookB.success || bookB.reason !== 'SLOT_OCCUPIED') {
    return { name: 'Anti-Collision: Same Vehicle Collision', passed: false, details: 'El sistema permitió cruce de horario sobre el mismo vehículo' };
  }

  if (!bookB.availableAlternatives || bookB.availableAlternatives.includes('10:00')) {
    return { name: 'Anti-Collision Alternatives', passed: false, details: 'Las alternativas no excluyeron el horario ocupado' };
  }

  // 4. Reserva concurrente para OTRO vehículo en la misma hora (Duster CAR-103)
  const bookC = service.bookAppointment({
    chatId: 'user_cliente_c',
    channel: 'instagram',
    customerName: 'Cliente C',
    vehicleId: 'CAR-103', // Vehículo diferente
    date: testDate,
    timeSlot: '10:00'
  });

  if (!bookC.success) {
    return { name: 'Concurrent Different Vehicle Booking', passed: false, details: 'Debió permitir reserva simultánea para vehículos distintos' };
  }

  // 5. GARANTÍA ANTI-CRUCE POR CAPACIDAD MÁXIMA DE SALA (Tope 2 simultáneos en Tunja)
  const bookD = service.bookAppointment({
    chatId: 'user_cliente_d',
    channel: 'tiktok',
    customerName: 'Cliente D',
    vehicleId: 'CAR-102', // Tercer vehículo distinto
    date: testDate,
    timeSlot: '10:00'
  });

  if (bookD.success || bookD.reason !== 'SLOT_OCCUPIED') {
    return { name: 'Anti-Collision: Showroom Max Capacity', passed: false, details: 'El sistema permitió sobrepasar la capacidad máxima de la sala de ventas' };
  }

  // 6. Cancelación y Liberación atómica de cupo
  const cancelled = service.cancelAppointment(bookA.appointment.id);
  if (!cancelled) {
    return { name: 'Appointment Cancellation', passed: false, details: 'Fallo al cancelar la cita de Cliente A' };
  }

  // Ahora Cliente B intenta de nuevo para la Mazda CX-5 a las 10:00
  const bookBRetry = service.bookAppointment({
    chatId: 'user_cliente_b',
    channel: 'whatsapp',
    customerName: 'Cliente B',
    vehicleId: 'CAR-101',
    date: testDate,
    timeSlot: '10:00'
  });

  if (!bookBRetry.success) {
    return { name: 'Released Slot Rebooking', passed: false, details: 'No permitió reservar el slot tras haber sido liberado por cancelación' };
  }

  // 7. Parser de Intención en Lenguaje Natural
  const parsed1 = service.parseAppointmentIntent('Me gustaría agendar cita el sábado a las 10 de la mañana para verla');
  if (!parsed1.hasIntent || parsed1.timeSlot !== '10:00') {
    return { name: 'Natural Language Intent Parser: Sábado 10 am', passed: false, details: `Esperado 10:00, obtenido ${parsed1.timeSlot}` };
  }

  const parsed2 = service.parseAppointmentIntent('¿Qué horarios tienen disponibles para ir a la sala?');
  if (!parsed2.hasIntent || parsed2.timeSlot !== undefined) {
    return { name: 'Natural Language Intent Parser: Consulta General', passed: false, details: 'Parser falló en consulta general de horarios' };
  }

  // 8. REST Controller Endpoints
  const ctrlSlots = controller.getAvailableSlots(testDate, 'CAR-101');
  if (!Array.isArray(ctrlSlots.availableSlots)) {
    return { name: 'AppointmentController GET available-slots', passed: false, details: 'Endpoint de slots disponibles retornó formato inválido' };
  }

  const allApts = controller.getAllAppointments();
  if (allApts.length < 2) {
    return { name: 'AppointmentController GET all', passed: false, details: 'Endpoint de lista de citas retornó menos citas de las esperadas' };
  }

  return {
    name: 'Appointment Scheduling & Anti-Collision Suite',
    passed: true,
    details: 'Prevención estricta de cruce por vehículo y capacidad, parser de lenguaje natural y endpoints REST validados al 100%.'
  };
}
