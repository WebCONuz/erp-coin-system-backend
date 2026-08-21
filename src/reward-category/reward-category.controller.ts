import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RewardCategoryService } from './reward-category.service';
import { CreateRewardCategoryDto } from './dto/create-reward-category.dto';
import { UpdateRewardCategoryDto } from './dto/update-reward-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { QueryRewardCategoryDto } from './dto/query-reward-category.dto';

@ApiTags('Reward Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reward-category')
export class RewardCategoryController {
  constructor(private readonly service: RewardCategoryService) {}

  @Post()
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Yangi kategoriya yaratish' })
  create(
    @TenantContext() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateRewardCategoryDto,
  ) {
    return this.service.create(tenantId, userId, dto);
  }

  @Get()
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({ summary: 'Barcha kategoriyalar' })
  findAll(
    @TenantContext() tenantId: string,
    @Query() query: QueryRewardCategoryDto,
  ) {
    return this.service.findAll(query, tenantId);
  }

  @Get(':id')
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({ summary: 'Bitta kategoriya' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.service.findOne(id, tenantId);
  }

  @Patch(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Kategoriyani yangilash' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @Body() dto: UpdateRewardCategoryDto,
  ) {
    return this.service.update(id, tenantId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: "Kategoriyani o'chirish" })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.service.remove(id, tenantId);
  }
}
