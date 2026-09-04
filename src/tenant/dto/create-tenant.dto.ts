import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsEnum,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantType } from 'src/generated/prisma/enums';

export class CreateTenantDto {
  @ApiProperty({ example: "Najot Ta'lim" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'najot-talim' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: "Slug faqat kichik harf, raqam va defis bo'lishi mumkin",
  })
  slug: string;

  @ApiPropertyOptional({ example: 'premium' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  plan?: string;

  @ApiPropertyOptional({
    enum: TenantType,
    example: TenantType.learning_center,
    description: 'Tashkilot turi (learning_center, school, va h.k.)',
  })
  @IsOptional()
  @IsEnum(TenantType)
  type?: TenantType;
}
