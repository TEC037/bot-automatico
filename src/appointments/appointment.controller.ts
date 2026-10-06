import { Controller, Get, Post, Delete, Body, Query, Param, NotFoundException } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { BookingRequest, BookingResult, Appointment } from './appointment.interface';

@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Get()
  getAllAppointments(): Appointment[] {
    return this.appointmentService.getAllAppointments();
  }

  @Get('available-slots')
  getAvailableSlots(
    @Query('date') date: string,
    @Query('vehicleId') vehicleId?: string
  ): { date: string; vehicleId?: string; availableSlots: string[] } {
    const slots = this.appointmentService.getAvailableSlots(date, vehicleId);
    return {
      date,
      vehicleId,
      availableSlots: slots
    };
  }

  @Post('book')
  bookAppointment(@Body() body: BookingRequest): BookingResult {
    return this.appointmentService.bookAppointment(body);
  }

  @Delete(':id')
  cancelAppointment(@Param('id') id: string): { success: boolean; id: string } {
    const ok = this.appointmentService.cancelAppointment(id);
    if (!ok) {
      throw new NotFoundException(`Cita con ID ${id} no encontrada.`);
    }
    return { success: true, id };
  }
}
