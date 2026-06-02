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
import { RewardsService } from './rewards.service';
import { CreateRewardDto } from './dto/create-reward.dto';
import { QueryRewardDto } from './dto/query-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';

@ApiTags('Geymifikatsiya: Sovg‘alar Do‘koni')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Post()
  @ApiOperation({ summary: 'Do‘konga yangi sovg‘a qo‘shish (Faqat Admin)' })
  create(
    @TenantContext() tenantId: string,
    @CurrentUser('id') createdById: string,
    @Body() dto: CreateRewardDto,
  ) {
    return this.rewardsService.create(tenantId, createdById, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'Do‘kondagi barcha faol sovg‘alarni ko‘rish (Talabalar va Adminlar uchun)',
  })
  findAll(@TenantContext() tenantId: string, @Query() query: QueryRewardDto) {
    return this.rewardsService.findAll(query, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID bo‘yicha sovg‘a tafsilotlarini ko‘rish' })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.rewardsService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sovg‘a ma’lumotlarini tahrirlash (Faqat Admin)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRewardDto,
    @TenantContext() tenantId: string,
  ) {
    return this.rewardsService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Sovg‘ani do‘kondardan olib tashlash (Soft-Delete)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.rewardsService.remove(id, tenantId);
  }

  // 🛒 TALABA TOMONIDAN SOVG‘ANI SOTIB OLISH ENDPOINTI
  @Post(':id/purchase')
  @ApiOperation({ summary: 'Tanga evaziga sovg‘a sotib olish (Talaba uchun)' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'Sotib olinayotgan sovg‘a IDsi',
  })
  purchase(
    @Param('id', ParseUUIDPipe) rewardId: string,
    @TenantContext() tenantId: string,
    @CurrentUser('id') studentId: string, // Tizimga kirgan talabaning IDsi avtomatik olinadi
  ) {
    return this.rewardsService.purchase(rewardId, studentId, tenantId);
  }
}
