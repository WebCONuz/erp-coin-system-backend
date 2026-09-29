import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional, NotEquals } from 'class-validator';
import { CreateRewardDto } from './create-reward.dto';

export class UpdateRewardDto extends PartialType(CreateRewardDto) {
  @ApiPropertyOptional({
    example: 5,
    description:
      'Zaxirani nisbiy o‘zgartirish: +5 — 5 ta qo‘shish, -2 — 2 ta ayirish. `stock` bilan birga yuborilmaydi; cheksiz (-1) sovg‘aga qo‘llanmaydi',
  })
  @IsInt()
  @NotEquals(0, { message: 'stockDelta 0 bo‘lishi mumkin emas' })
  @IsOptional()
  stockDelta?: number;
}
