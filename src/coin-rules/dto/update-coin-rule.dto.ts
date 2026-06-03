import { PartialType } from '@nestjs/swagger';
import { CreateCoinRuleDto } from './create-coin-rule.dto';

export class UpdateCoinRuleDto extends PartialType(CreateCoinRuleDto) {}
