import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { TenantQueryDto } from 'src/common/dto/tenant-query.dto';

export const MAX_LEADERBOARD_LIMIT = 50;

export class QueryLeaderboardDto extends TenantQueryDto {
  @ApiPropertyOptional({
    example: 10,
    default: 10,
    minimum: 1,
    maximum: MAX_LEADERBOARD_LIMIT,
    description: 'Reytingdagi o‘quvchilar soni',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LEADERBOARD_LIMIT)
  limit?: number = 10;
}
