import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { CreateHolidayDto, QueryHolidayDto } from './dto/holiday.dto';
import { HolidaysService } from './holidays.service';

@ApiTags('Dam olish kunlari (Holidays)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  @Get()
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({ summary: "Dam olish kunlari ro'yxati (?from=&to=)" })
  findAll(@TenantContext() tenantId: string, @Query() query: QueryHolidayDto) {
    return this.holidaysService.findAll(tenantId, query);
  }

  @Post()
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary:
      "Dam olish kuni qo'shish — shu sanadagi jadval darslari avtomatik bekor qilinadi",
  })
  create(
    @TenantContext() tenantId: string,
    @CurrentUser('id') createdById: string,
    @Body() dto: CreateHolidayDto,
  ) {
    return this.holidaysService.create(tenantId, createdById, dto);
  }

  @Delete(':id')
  @Roles('admin', 'super_admin')
  @HttpCode(200)
  @ApiOperation({
    summary: "Dam olish kunini o'chirish — jadval darslari qaytariladi",
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.holidaysService.remove(id, tenantId);
  }
}
