import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PipelineStage } from './create-lead.dto';

export class UpdateStageDto {
  @IsEnum(PipelineStage)
  @IsNotEmpty()
  stage: PipelineStage;

  @IsString()
  @IsOptional()
  notes?: string;
}
