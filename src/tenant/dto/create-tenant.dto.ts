import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}
