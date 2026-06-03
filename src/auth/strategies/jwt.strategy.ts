import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';
import { AuthPayloadType, ReqUserType } from 'src/common/types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private prisma: PrismaService) {
    super({
      // Cookie dan access_token ni olish
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request): string | null =>
          (req?.cookies?.access_token as string) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET!,
    });
  }

  async validate(payload: AuthPayloadType): Promise<ReqUserType> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, isActive: true },
      include: { role: true },
    });

    if (!user) throw new UnauthorizedException('Foydalanuvchi topilmadi');

    // req.user ga yoziladi — barcha controllerlarda ishlatiladi
    return {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      tenantId: user.tenantId,
      role: user.role.name,
      roleLevel: user.role.level,
      roleId: user.roleId,
    };
  }
}
