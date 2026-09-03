import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TeachersService } from './teachers.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@ApiTags("O'qituvchi shaxsiy kabineti")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get('me/dashboard')
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({
    summary:
      "Tizimga kirgan o'qituvchining shaxsiy dashboard xulosasi: bugungi/haftalik darslar, yo'qlama kutayotgan sessiyalar, guruh/o'quvchi soni, so'nggi coin faoliyati",
  })
  getMyDashboard(
    @TenantContext() tenantId: string,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.teachersService.getMyDashboard(teacherId, tenantId);
  }
}
