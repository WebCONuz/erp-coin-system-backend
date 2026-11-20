import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_TENANT_SLUG } from './constants/system-tenant';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { DEFAULT_TENANT_ROLES } from '../roles/constants';
import { DEFAULT_TENANT_COIN_RULES } from '../coin-rules/constants';
import { invalidateTenantTimezone } from '../common/utils/tenant-time';
import { archivedName } from '../common/utils/soft-delete-unique';
import { AuditActionType, Prisma } from '../generated/prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AUDIT_ENTITY, definedFields } from '../audit-log/utils/audit-entry';

@Injectable()
export class TenantService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
  ) {}

  async create(dto: CreateTenantDto, createdById: string) {
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) throw new ConflictException('Bu slug allaqachon mavjud');

    // Atomic operation: Creating tenant & default roles & built-in coin rules
    const data = await this.prisma.tenant.create({
      data: {
        ...dto,
        roles: {
          create: DEFAULT_TENANT_ROLES.map((role) => ({ ...role })),
        },
        coinRules: {
          create: DEFAULT_TENANT_COIN_RULES.map((rule) => ({
            ...rule,
            isBuiltIn: true,
            createdById,
          })),
        },
      },
      include: {
        roles: {
          select: { id: true, name: true, displayName: true, level: true },
        },
        coinRules: {
          select: {
            id: true,
            name: true,
            coinAmount: true,
            direction: true,
            triggerType: true,
            sourceType: true,
            isBuiltIn: true,
          },
        },
      },
    });
    await this.audit.recordSafe({
      tenantId: data.id,
      actorId: createdById,
      action: AuditActionType.create,
      entityType: AUDIT_ENTITY.tenant,
      entityId: data.id,
      changes: { name: data.name, slug: data.slug, type: data.type },
    });

    return {
      status: 'success',
      message: 'Successfully created',
      data,
    };
  }

  async findAll() {
    const data = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        type: true,
        isActive: true,
        createdAt: true,
        _count: { select: { users: true, groups: true } },
      },
      where: {
        isDeleted: false,
        NOT: { OR: [{ name: 'Asosiy tashkilot' }, { name: 'System Tenant' }] },
      },
    });

    return {
      status: 'success',
      data,
    };
  }

  async findOne(id: string) {
    // O'chirilgan (soft delete) tenant — topilmaydi
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, isDeleted: false },
      include: {
        _count: { select: { users: true, groups: true, courses: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');

    return {
      status: 'success',
      data: tenant,
    };
  }

  // ─── Tenant sozlamalari (tenant admini) ──────────────────────
  private static readonly SETTINGS_SELECT = {
    id: true,
    teacherCoinLimit: true,
    timezone: true,
  } as const;

  async getSettings(tenantId: string) {
    const settings = await this.prisma.tenant.findFirst({
      where: { id: tenantId, isDeleted: false },
      select: TenantService.SETTINGS_SELECT,
    });
    if (!settings) throw new NotFoundException('Tenant topilmadi');
    return { status: 'success', data: settings };
  }

  async updateSettings(
    tenantId: string,
    dto: UpdateTenantSettingsDto,
    actorId: string,
  ) {
    const before = await this.getSettings(tenantId);
    const changes = definedFields(dto);
    const [data] = await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          ...(dto.teacherCoinLimit !== undefined
            ? { teacherCoinLimit: dto.teacherCoinLimit }
            : {}),
          ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        },
        select: TenantService.SETTINGS_SELECT,
      }),
      // Coin limiti va timezone — coin berish va "bugun" hisobiga ta'sir qiladi
      this.prisma.auditLog.create({
        data: this.audit.data({
          tenantId,
          actorId,
          action: AuditActionType.update,
          entityType: AUDIT_ENTITY.tenant,
          entityId: tenantId,
          changes: {
            settings: changes,
            before: {
              teacherCoinLimit: before.data.teacherCoinLimit,
              timezone: before.data.timezone,
            },
          } as Prisma.InputJsonValue,
        }),
      }),
    ]);
    // "Bugun" hisoblari yangi timezone'ni darhol ishlatsin
    invalidateTenantTimezone(tenantId);
    return { status: 'success', message: 'Sozlamalar saqlandi', data };
  }

  // Tizim tenantini o'chirish/nofaol qilish/slug'ini o'zgartirish taqiqlanadi
  private assertNotSystemTenant(slug: string, action: string) {
    if (slug === SYSTEM_TENANT_SLUG) {
      throw new ForbiddenException(`Tizim tenantini ${action} mumkin emas`);
    }
  }

  async update(id: string, dto: UpdateTenantDto, actorId: string) {
    const tenant = await this.findOne(id); // mavjudligini tekshirish

    if (dto.slug && dto.slug !== tenant.data.slug) {
      this.assertNotSystemTenant(tenant.data.slug, "slug'ini o'zgartirish");
    }

    if (dto.slug) {
      const existing = await this.prisma.tenant.findUnique({
        where: { slug: dto.slug },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Bu slug allaqachon mavjud');
      }
    }
    const data = await this.prisma.tenant.update({ where: { id }, data: dto });
    invalidateTenantTimezone(id);
    await this.audit.recordSafe({
      tenantId: id,
      actorId,
      action: AuditActionType.update,
      entityType: AUDIT_ENTITY.tenant,
      entityId: id,
      changes: definedFields(dto) as Prisma.InputJsonValue,
    });

    return {
      status: 'success',
      message: 'Successfully updated',
      data,
    };
  }

  /**
   * Soft delete: tenant va uning ma'lumotlari (coin tarixi, yo'qlama, xaridlar) saqlanadi,
   * userlari kira olmaydi (ACTIVE_ACCOUNT_WHERE), barcha qurilma sessiyalari yopiladi.
   * Slug bo'shatiladi — shu slug bilan yangi tenant ochish mumkin.
   */
  async remove(id: string, actorId: string) {
    const tenant = await this.findOne(id);
    this.assertNotSystemTenant(tenant.data.slug, "o'chirish");

    await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id },
        data: {
          isDeleted: true,
          isActive: false,
          deletedAt: new Date(),
          slug: archivedName(tenant.data.slug, id, 100),
        },
      }),
      this.prisma.refreshSession.deleteMany({
        where: { user: { tenantId: id } },
      }),
      this.prisma.auditLog.create({
        data: this.audit.data({
          tenantId: id,
          actorId,
          action: AuditActionType.delete,
          entityType: AUDIT_ENTITY.tenant,
          entityId: id,
          changes: { name: tenant.data.name, slug: tenant.data.slug },
        }),
      }),
    ]);
    invalidateTenantTimezone(id);

    return {
      status: 'success',
      message: 'Successfully deleted',
      data: tenant.data,
    };
  }

  async toggleActive(id: string, actorId: string) {
    const tenant = await this.findOne(id);
    if (tenant.data.isActive) {
      this.assertNotSystemTenant(tenant.data.slug, 'nofaol qilish');
    }
    await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id },
        data: { isActive: !tenant.data.isActive },
      }),
      this.prisma.auditLog.create({
        data: this.audit.data({
          tenantId: id,
          actorId,
          action: tenant.data.isActive
            ? AuditActionType.archive
            : AuditActionType.restore,
          entityType: AUDIT_ENTITY.tenant,
          entityId: id,
          changes: { isActive: !tenant.data.isActive },
        }),
      }),
    ]);

    return {
      status: 'success',
      message: `Successfully ${!tenant.data.isActive ? 'archivated' : 'activated'}`,
      data: {
        ...tenant,
        isActive: !tenant.data.isActive,
      },
    };
  }
}
