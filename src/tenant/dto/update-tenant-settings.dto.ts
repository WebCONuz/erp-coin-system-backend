import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { MANUAL_COIN_HARD_MAX } from 'src/coin-transaction/constants/manual-coin';

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
}
