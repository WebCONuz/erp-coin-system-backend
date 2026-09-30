import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResultItemDto {
  @ApiProperty({ example: 'student-uuid-here', description: 'O‘quvchi IDsi' })
  @IsUUID()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ example: true, description: 'Qatnashdimi?' })
  @IsBoolean()
  isPresent: boolean;

  @ApiPropertyOptional({
    example: 87.5,
    nullable: true,
    description:
      "Ball (0 dan sessiya maxScore gacha). isPresent=false bo'lsa e'tiborga olinmaydi",
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  score?: number | null;

  @ApiProperty({
    example: 20,
    description:
      "Shu o'quvchiga beriladigan coin (0 — bermaslik). isPresent=false bo'lsa 0 deb olinadi",
  })
  @IsInt()
  @Min(0)
  @Max(10000)
  coinAmount: number;

  @ApiPropertyOptional({ example: '2-masalada xato', description: 'Izoh' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BulkResultsDto {
  @ApiProperty({
    type: [ResultItemDto],
    description: 'Natijasi kiritiladigan o‘quvchilar ro‘yxati',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Kamida 1 ta o‘quvchi bo‘lishi kerak' })
  @ArrayMaxSize(300, {
    message: 'Bir so‘rovda 300 tadan ortiq o‘quvchi bo‘lishi mumkin emas',
  })
  @ValidateNested({ each: true })
  @Type(() => ResultItemDto)
  records: ResultItemDto[];
}
