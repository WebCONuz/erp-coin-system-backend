import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { MANUAL_COIN_HARD_MAX } from 'src/coin-transaction/constants/manual-coin';
import { isValidTimeZone } from 'src/common/utils/tenant-time';

@ValidatorConstraint({ name: 'isTimeZone', async: false })
class IsTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidTimeZone(value);
  }
  defaultMessage() {
    return "timezone noto'g'ri — IANA nomi bo'lishi kerak (masalan Asia/Tashkent)";
  }
}

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({
    example: 50,
    nullable: true,
    description:
      "Teacher bitta tranzaksiyada bitta o'quvchiga bera oladigan maksimal coin. null — cheklov yo'q",
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(MANUAL_COIN_HARD_MAX)
  teacherCoinLimit?: number | null;

  @ApiPropertyOptional({
    example: 'Asia/Tashkent',
    description:
      'IANA timezone. "Bugun", dars boshlanganmi va yo\'qlamani tahrirlash muddati shu bo\'yicha hisoblanadi',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Validate(IsTimeZoneConstraint)
  timezone?: string;
}
