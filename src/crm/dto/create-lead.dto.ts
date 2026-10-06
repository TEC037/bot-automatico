import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber } from 'class-validator';

export enum PipelineStage {
  PROSPECT = 'PROSPECT',
  QUALIFIED = 'QUALIFIED',
  PROPOSAL_SENT = 'PROPOSAL_SENT',
  APPOINTMENT_SCHEDULED = 'APPOINTMENT_SCHEDULED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  CLOSED_WON = 'CLOSED_WON',
  CLOSED_LOST = 'CLOSED_LOST',
  HUMAN_TAKEOVER = 'HUMAN_TAKEOVER'
}

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @IsString()
  @IsNotEmpty()
  channel: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  vehicleInterestId?: string;

  @IsEnum(PipelineStage)
  @IsOptional()
  stage?: PipelineStage = PipelineStage.PROSPECT;

  @IsNumber()
  @IsOptional()
  score?: number = 10;
}
