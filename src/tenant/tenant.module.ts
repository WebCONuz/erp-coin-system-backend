import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantSettingsController } from './tenant-settings.controller';

@Module({
  controllers: [TenantController, TenantSettingsController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
