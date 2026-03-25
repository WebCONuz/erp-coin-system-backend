import { PartialType } from '@nestjs/swagger';
import { CreateRewardCategoryDto } from './create-reward-category.dto';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRewardCategoryDto extends PartialType(
  CreateRewardCategoryDto,
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
