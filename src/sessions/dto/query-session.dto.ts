import { IsOptional, IsUUID, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EvaluationMode, SessionType } from 'src/generated/prisma/enums';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { IsDateOnly } from 'src/common/dto/is-date-only.decorator';

export class QuerySessionDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiPropertyOptional({ enum: SessionType })
  @IsOptional()
  @IsEnum(SessionType)
  sessionType?: SessionType;

  @ApiPropertyOptional({ enum: EvaluationMode })
  @IsOptional()
  @IsEnum(EvaluationMode)
  evaluationMode?: EvaluationMode;

  @ApiPropertyOptional({ example: '2026-06-03' })
  @IsOptional()
  @IsDateOnly()
  date?: string;

  @ApiPropertyOptional({
    description:
      "Yo'qlama qilingan/qilinmagan sessiyalar bo'yicha filtr. false berilganda faqat vaqti (endTime) allaqachon o'tgan, lekin hali yo'qlama qilinmagan sessiyalar qaytadi — hali vaqti kelmagan sessiyalar 'tekshirilmagan' sifatida hisoblanmaydi.",
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isChecked?: boolean;
}
