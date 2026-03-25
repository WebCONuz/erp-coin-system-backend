import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// Ishlatish: @Roles('admin', 'super_admin')
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
