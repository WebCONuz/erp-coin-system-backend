import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CoinRulesService } from './coin-rules.service';
import { CreateCoinRuleDto } from './dto/create-coin-rule.dto';
import { QueryCoinRuleDto } from './dto/query-coin-rule.dto';
import { UpdateCoinRuleDto } from './dto/update-coin-rule.dto';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

@ApiTags('Geymifikatsiya: Tanga Qoidalari')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('coin-rules')
export class CoinRulesController {
  constructor(private readonly coinRulesService: CoinRulesService) {}

  @Post()
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({
    summary: 'Yangi tanga berish qoidasini yaratish (Admin / O‘qituvchi)',
  })
  create(
    @TenantContext() tenantId: string,
    @CurrentUser('id') createdById: string,
    @Body() dto: CreateCoinRuleDto,
  ) {
    return this.coinRulesService.create(tenantId, createdById, dto);
  }

  @Get()
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({
    summary: 'Barcha faol tanga qoidalarini ko‘rish (Filtrlar bilan)',
  })
  findAll(@TenantContext() tenantId: string, @Query() query: QueryCoinRuleDto) {
    return this.coinRulesService.findAll(query, tenantId);
  }

  @Get(':id')
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({ summary: 'ID bo‘yicha tanga qoidasi tafsilotlarini ko‘rish' })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.coinRulesService.findOne(id, tenantId);
  }

  @Patch(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Tanga qoidasini tahrirlash' })
  @ApiParam({ name: 'id', format: 'uuid' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCoinRuleDto,
    @TenantContext() tenantId: string,
  ) {
    return this.coinRulesService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Tanga qoidasini o‘chirish (Soft-Delete)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.coinRulesService.remove(id, tenantId);
  }
}
