# 🎓 ERP COIN SYSTEM

O'quv markazlari va maktablar uchun **incentive management tizimi**. O'quvchilarni darsga qiziqtirib, bonus va jarima tangalari (coins) orqali mukofotlash va punishment qilish.

---

## 📌 LOYIHA MAZMUNÍ

### 🎯 Asosiy G'oya

- **O'quvchilarni qiziqtirish**: Darsga vaqtida qatnashgan, uyga vazifasini bajargan, faol o'quvchilar bonus tangalari (coins) oladi
- **Jarima tizimi**: Darsga kelmagan, hulqi salbiy bo'lgan o'quvchilar jarima ballari (coins olib ketiladi)
- **Online Store**: O'quvchilar olgan tangalari bilan loyiha ichidagi virtual do'konda kerakli narsalarni sotib olishlari mumkin
- **Multi-tenant**: Bir platformada bir nechta o'quv markazi va maktablar ishlashi mumkin
- **Role-based Access**: Har bir foydalanuvchi o'z roli bo'yicha turli imkoniyatlarga ega

### 👥 Foydalanuvchi Turlari

1. **Creator** - Loyihaning yaratuvchisi (super-super admin, hech kim bilmaydi)
2. **Super Admin** - Loyihani bosh boqaruvchisi (barcha filiallarni nazorat qiladi)
3. **Tenant Admin** - O'quv markazi boshlig'i (o'z filialini to'liq nazorat qiladi)
4. **Teacher** - O'qituvchi (darsga qatnashish va uyga vazifa bajarishni qayd qiladi)
5. **Student | Parent** - O'quvchi | ota-ona (o'z kabinetida stats va coins ko'radi)

### 🏢 Asosiy Funktsiyalar

- ✅ Davomat va uyga vazifa tracking
- ✅ Coins avtomatik hisoblash (attendance + homework + faollik)
- ✅ Reward store (digital, imtiyoz, fizik sovg'alar)
- ✅ SMS/Email bildirishnomalar
- ✅ Audit logging (barcha harakatlar qayd)
- ✅ Role-based permissions (guard-style)
- ✅ Student/Parent cabinet
- ⚠️ Dars jadvali boshqarish (xonalar bilan conflict oldini olish)

---

## 🗄️ DATABASE SXEMA

### **TENANCY & ROLES**

Tenant
├── id (UUID)
├── name, slug, plan
├── isActive, isDeleted
└── timestamps
Role
├── id (UUID)
├── name, displayName, level
├── scope (system | tenant)
├── isSystem, canDelete, canManageAdmins, canManageUsers
├── tenantId (NULL = system role)
└── timestamps
RolePermission
├── id (UUID)
├── permission (string: "create_course", "edit_student", etc.)
├── roleId, tenantId
└── unique: [roleId, permission]
User
├── id (UUID)
├── phone (unique), email (unique)
├── fullName, passwordHash, avatarUrl
├── parentPhone (student uchun)
├── tenantId, roleId
├── isActive, isDeleted
└── timestamps + auth fields

### **COURSES & GROUPS**

Course
Room
Group
GroupStudent

### **SCHEDULE & SESSIONS**

ScheduleTemplate
ScheduleException
Session

### **ATTENDANCE & COINS**

AttendanceRecord
CoinRule
CoinTransaction
Wallet

### **REWARDS & PURCHASES**

RewardCategory
Reward
Purchase

### **NOTIFICATIONS**

SmsTemplate
SmsLog
EmailTemplate
EmailLog

### **AUDIT & IMPORTS**

AuditLog
ImportLog

---

## 🛠️ QULLANILADIGAN TEXNOLOGIYALAR

| Texnologiya         | Maqsadi                               |
| ------------------- | ------------------------------------- |
| **Node.js**         | Runtime environment                   |
| **TypeScript**      | Type-safe JavaScript                  |
| **NestJS**          | Backend framework (modular, scalable) |
| **Prisma**          | ORM (type-safe database)              |
| **PostgreSQL**      | Relational database                   |
| **JWT**             | Authentication                        |
| **Bcrypt**          | Password hashing                      |
| **Swagger/OpenAPI** | API documentation                     |

---

## 📦 ISHGA TUSHIRISH

### **1️⃣ Loyihani Clone qilish**

```bash
git clone <repository-url>
cd erp-coin-system-backend
```

### **2️⃣ Dependencies'ni o'rnatish**

```bash
npm install
```

### **3️⃣ Environment o'zgaruvchilari**

`.env` faylini yarating:

```env
# Port
PORT=3000

# Database URL for Prizma
DATABASE_URL="postgresql://postgres:your_pass@localhost:your_port/your_db?schema=public"

# Token secrets
JWT_ACCESS_SECRET = your_access_token_key
JWT_REFRESH_SECRET = your_refresh_token_key

# Gmail Providers
SMTP_PASSWORD=your_smtp_password
SMTP_USER=your_smtp_email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

# SMS service
ESKIZ_EMAIL=your_eskis_email
ESKIZ_PASSWORD=eskiz_parol
ESKIZ_SENDER=your_eskiz_sender

# Creator datas
CREATOR_PHONE=creator_phone
CREATOR_PASSWORD=creator_password
CREATOR_NAME=creator_full_name
CREATOR_EMAIL=creator_email


# Super admin datas
SUPER_ADMIN_PHONE=super_admin_phone
SUPER_ADMIN_PASSWORD=super_admin_password
SUPER_ADMIN_NAME=super_admin_fullname

# Frontend domen
FRONTEND_DOMEN=your_fronend_domen

# Working environment
NODE_ENV='development' | 'production'
```

### **4️⃣ Database Migration'larni ishlatib ko'rish**

```bash
npx prisma migrate dev --name init
```

### **5️⃣ Prisma Client'ni generate qilish**

```bash
npx prisma generate
```

### **6️⃣ Database'ni seed data bilan to'ldirish**

```bash
npx prisma db seed
```

Bu komanda:

- ✅ System tenant yaratadi
- ✅ Creator, Super Admin, Base roller'ni yaratadi
- ✅ Creator va Super Admin user'larini yaratadi
- ✅ Default reward kategoriyalarini yaratadi
- ✅ Wallet'larni yaratadi

### **7️⃣ Loyihani ishga tushirish**

```bash
# Development rejimida
npm run start:dev

# Production rejimida
npm run build
npm run start:prod
```

### **8️⃣ Prisma Studio (Database GUI)**

```bash
npx prisma studio
```

Bu buyruq `http://localhost:5555`'da database'ni visual ko'rish imkoniyatini beradi.

---

## 📁 LOYIHA STRUKTURA

erp-coin-system-backend/
├── src/
│ ├── modules/
│ │ ├── auth/ # Authentication & JWT
│ │ ├── users/ # User management
│ │ ├── roles/ # Role & Permission
│ │ ├── tenants/ # Tenant management
│ │ ├── courses/ # Courses & Groups
│ │ ├── sessions/ # Sessions & Attendance
│ │ ├── coins/ # Coin transactions
│ │ ├── rewards/ # Rewards & Purchases
│ │ ├── notifications/ # SMS & Email
│ │ ├── audit/ # Audit logging
│ │ └── imports/ # Data import
│ ├── common/
│ │ ├── guards/ # TenantGuard, AuthGuard, PermissionGuard
│ │ ├── interceptors/ # Logging, Error handling
│ │ ├── pipes/ # Validation
│ │ └── decorators/ # @CurrentTenant, @RequirePermission
│ ├── prisma/
│ │ ├── prisma.service.ts
│ │ └── seed.ts
│ ├── config/ # Configuration files
│ └── app.module.ts
├── prisma/
│ ├── schema.prisma # Database schema
│ └── migrations/ # Migration files
├── test/ # Jest tests
├── .env # Environment variables
├── package.json
├── tsconfig.json
└── README.md

---

## 🚀 KEYINGI BOSQICHLAR

- [ ] NestJS modules'ni yaratish
- [ ] Authentication va JWT guard'larini yozish
- [ ] TenantGuard va PermissionGuard'larini yozish
- [ ] API endpoints'larini yozish
- [ ] Unit tests'ni yozish
- [ ] Integration tests'ni yozish
- [ ] Docker setup'ni yaratish
- [ ] CI/CD pipeline'ni sozlash
- [ ] Frontend integration

---

## 📚 QIMOSIY FAYLLAR

- **Schema**: `prisma/schema.prisma`
- **Seed data**: `src/prisma/seed.ts`
- **Environment**: `.env`

---

## 🔐 SECURITY NOTES

- ✅ Creator - hech kimga ma'lum emas (maxfiy)
- ✅ Super Admin - loyiha buyurtmachisi
- ✅ Tenant Admin - har filialning o'z admini
- ✅ Barcha harakatlar AuditLog'da qayd qilinadi
- ✅ Tenant isolation - faqat o'z filialini ko'radi
- ✅ Role-based permissions - faqat roli bo'yicha imkoniyatlar

---

## 📞 KONTAKT

**Yaratuvchi**: Muxammadi Toshtemirov
**Telefon**: +998(94) 542-63-07
**Email**: muxammadi0799@gmail.com

---

**⭐ Loyiha ready for development!**
