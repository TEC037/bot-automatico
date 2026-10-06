export interface Appointment {
  id: string;
  chatId: string;
  channel: string;
  customerName: string;
  vehicleId: string;
  vehicleName: string;
  date: string; // Formato YYYY-MM-DD
  timeSlot: string; // Formato HH:mm (ej: "10:00", "15:00")
  durationMinutes: number; // Por defecto: 60 min
  status: 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED';
  notes?: string;
  createdAt: string;
}

export interface BookingRequest {
  chatId: string;
  channel: string;
  customerName?: string;
  vehicleId: string;
  vehicleName?: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // HH:mm
  notes?: string;
}

export interface BookingResult {
  success: boolean;
  appointment?: Appointment;
  reason?: 'SLOT_OCCUPIED' | 'OUTSIDE_HOURS' | 'MAX_CAPACITY' | 'INVALID_DATE' | 'DATE_IN_THE_PAST' | 'CLOSED_ON_SUNDAYS';
  message: string;
  availableAlternatives?: string[];
}
