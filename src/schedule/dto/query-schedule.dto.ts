import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Weekday } from 'src/generated/prisma/enums';

export class QueryScheduleDto {
  @ApiPropertyOptional({ description: 'Faqat super_admin uchun' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ description: "Guruh bo'yicha filtr" })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ description: "Xona bo'yicha filtr" })
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional({ enum: Weekday })
  @IsOptional()
  @IsEnum(Weekday)
  weekday?: Weekday;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
