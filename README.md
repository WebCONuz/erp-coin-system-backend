# 🎓 ERP COIN SYSTEM

O'quv markazlari va maktablar uchun mo'ljallangan, zamonaviy va kengaytirshga qulay **Incentive Management (Geymifikatsiya va Rag'batlantirish) Tizimi**. Ushbu platforma o'quvchilarni darsga qiziqtirish, davomat samaradorligini oshirish va ichki virtual iqtisodiyot (tanga va sovg'alar do'koni) orqali o'quv jarayonini interaktiv qilish uchun ishlab chiqilgan.

---

## 📌 LOYIHA MAZMUNI

### 🎯 Asosiy G'oya

- **O'quvchilarni qiziqtirish (Gamification)**: Darsga o'z vaqtida qatnashgan, uyga vazifasini mukammal bajargan va faol o'quvchilar avtomatik ravishda bonus tangalari (coins) bilan taqdirlanadi.
- **Jarima tizimi (Penalty Logic)**: Darsga sababsiz kelmagan yoki ichki tartib-qoidalarni buzgan o'quvchilarning hamyonidan tangalar tizim tomonidan chegirib tashlanadi.
- **Virtual Do'kon (Rewards Store)**: O'quvchilar yig'gan tangalari evaziga tizim ichidagi do'kondan jismoniy (futbolka, ruchka), raqamli (kurslar, kuponlar) yoki imtiyozli (guruhni o'zgartirish, imtihonni qayta topshirish) sovg'alarni sotib olishlari mumkin.
- **Xavfsiz Multi-tenant Arxitektura**: Bir vaqtning o'zida yuzlab o'quv markazlari va maktablar (Tenant) tizimdan mutloq xavfsiz va bir-biridan ajratilgan (Isolated) holda foydalana oladi.
- **Granulyar Role-based Access (RBAC)**: Foydalanuvchilar o'z rollari va ruxsatnomalari (Permissions) doirasidagina tizim qismlariga kirish huquqiga ega.

### 👥 Foydalanuvchi Turlari va Rollari

1. **Creator** - Platformaning global yaratuvchisi (Super-super admin). Hech bir tenantga tegishli bo'lmagan holda, tizimning barcha qismlarini va global parametrlarni nazorat qiladi.
2. **Super Admin** - Loyihaning asosiy egalari va boshqaruvchilari. Yangi o'quv markazlarini (Tenant) ro'yxatdan o'tkazadi va global moliya/auditingni kuzatadi.
3. **Tenant Admin** - Muayyan o'quv markazi yoki maktab rahbari. O'z filialining o'qituvchilari, o'quvchilari, guruhlari, kurslari va tangalar qoidalarini to'liq boshqaradi.
4. **Teacher** - O'qituvchi. Dars jurnali orqali guruhlarni bittada (Bulk) yo'qlama qiladi va o'quvchilarga qo'lda (Manual) yoki dars asosida (Auto) tangalar yozadi.
5. **Student | Parent** - O'quvchi va ota-ona kabineti. Joriy tangalar balansini, batafsil tranzaksiyalar tarixini, reytinglar jadvalini (Leaderboard) ko'radi hamda do'kondan xaridlarni amalga oshiradi.

### 🏢 MVP Bosqichidagi Asosiy Funktsiyalar

- [x] **Multi-Tenant Isolation**: Maxsus `@TenantContext()` dekoratori orqali ma'lumotlar xavfsizligi va tenantlararo aloqa cheklanishi ta'minlangan.
- [x] **Bulk Attendance & Auto-Coin System**: Guruhni bittada davomat qilish orqali butun guruhga avtomatik ravishda `CoinRule` asosida tanga berish yoki ayirish logikasi.
- [x] **Transactional Wallet Integrity**: Barcha moliya operatsiyalari Prisma `$transaction` (Atomik amallar) orqali yoziladi. Balans hech qachon to'g'ridan-to'g'ri o'zgarmaydi, faqat `CoinTransaction` orqali inkrement/dekrement qilinadi.
- [x] **Store & Refund Logic**: Talaba sovg'a sotib olganda ombor zaxirasi (`stock`) avtomatik kamayadi. Admin xaridni rad etsa (`rejected`), tangalar talaba hamyoniga qaytariladi va zaxira tiklanadi.
- [x] **Leaderboard (Reyting Tizimi)**: Database darajasida indekslangan va optimallashtirilgan eng ko'p tangaga ega talabalar TOP ro'yxati.
- [x] **Audit Logging & Security**: Tizimdagi har bir xavfli operatsiya va xarid tarixi qat'iy nazorat ostida log qilinadi.

---

## 🛠️ QO'LLANILADIGAN TEXNOLOGIYALAR

| Texnologiya                       | Maqsadi                                                                |
| :-------------------------------- | :--------------------------------------------------------------------- |
| **Node.js (v18+)**                | Backend runtime muhiti                                                 |
| **TypeScript**                    | Strict type-safe dasturlash tili                                       |
| **NestJS**                        | Enterprise darajadagi, modulli backend framework                       |
| **Prisma ORM**                    | Tizimli va type-safe ma'lumotlar bazasi munosabatlari                  |
| **PostgreSQL**                    | Relational ma'lumotlar bazasi (Tranzaksiyalar uchun qulay)             |
| **Class-Validator & Transformer** | DTO darajasida requestlarni qat'iy va xavfsiz validatsiya qilish       |
| **JWT (Access & Refresh)**        | Ikki bosqichli xavfsiz autentifikatsiya tizimi                         |
| **Swagger / OpenAPI**             | Interaktiv va avtomatik generatsiya bo'luvchi API hujjatlar jamlanmasi |

---

## 📦 ISHGA TUSHIRISH VA SOZLANGANLIK

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

# Database URL for Prisma (PostgreSQL)
DATABASE_URL="postgresql://postgres:your_pass@localhost:5432/erp_coin_db?schema=public"

# Token secrets (Kamida 32 belgidan iborat murakkab kalit yozing)
JWT_ACCESS_SECRET="your_extremely_strong_access_token_key_2026"
JWT_REFRESH_SECRET="your_extremely_strong_refresh_token_key_2026"

# Gmail SMTP Providers
SMTP_PASSWORD="your_smtp_app_password"
SMTP_USER="info@yourdomain.com"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587

# SMS API Service (Eskiz.uz integratsiyasi)
ESKIZ_EMAIL="your_eskiz_email@gmail.com"
ESKIZ_PASSWORD="your_eskiz_password"
ESKIZ_SENDER="4545"

# Global Creator (Secret Master Account)
CREATOR_PHONE="+998945426307"
CREATOR_PASSWORD="secure_creator_password_123"
CREATOR_NAME="Muxammadi Toshtemirov"
CREATOR_EMAIL="muxammadi0799@gmail.com"

# System Super Admin Datas
SUPER_ADMIN_PHONE="+998901234567"
SUPER_ADMIN_PASSWORD="super_admin_secure_pass"
SUPER_ADMIN_NAME="Super Admin Chief"
SUPER_ADMIN_EMAIL="admin@erpcoin.uz"

# Frontend Web Domain URL
FRONTEND_DOMEN="http://localhost:3000"

# Working environment
NODE_ENV="development"
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
│ ├── auth/ # Autentifikatsiya, JWT, Login/Logout va Guardlar
│ │ ├── decorators/ # @CurrentUser, @TenantContext maxsus dekoratorlari
│ │ └── guards/ # JwtAuthGuard, RolesGuard
│ ├── coin-rules/ # Tanga berish/ayirish mezonlari (CRUD)
│ ├── coin-transactions/ # Kirim-chiqim tranzaksiyalari & Wallet (Atomik Servis)
│ ├── rewards/ # Do'kon sovg'alari boshqaruvi (CRUD)
│ ├── purchases/ # Xaridlar tarixi & Admin Tasdiqlash/Qaytarish logikasi
│ ├── sessions/ # Darslar jadvali & Bulk Attendance (Yo'qlama jurnali)
│ ├── users/ # Foydalanuvchilar va profil boshqaruvi
│ ├── tenants/ # O'quv markazlari (Tenant) boshqaruvi
│ ├── prisma/ # Prisma Service ulanishi va seed mantiqlari
│ ├── common/ # Global Interceptorlar, Exception Filterlar va Pipelar
│ └── app.module.ts # Markaziy ildiz moduli
├── prisma/
│ ├── schema.prisma # Markaziy Database relyatsion sxemasi
│ └── migrations/ # SQL migratsiya fayllari tarixi
├── .husky/ # Git pre-commit pre-push hooklar (Linting & Case-sensitivity protection)
├── .env # Atrof-muhit o'zgaruvchilari fayli
├── package.json # Loyiha skriptlari va kutubxonalari ro'yxati
└── README.md # Loyiha qo'llanmasi

---

## 🚀 KEYINGI BOSQICHLAR

- [ ] Tashqi file-uploading ulash
- [ ] Dars jadval tizimini ishlab chiqish
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

- [ ] **Yaratuvchi (Lead Engineer)**: Muxammadi Toshtemirov
- [ ] **Telefon raqam**: +998(94) 542-63-07
- [ ] **Elektron pochta**: muxammadi0799@gmail.com
- [ ] **Telegram**: @Muxammadi_Dev

---

**⭐ Tizim MVP talablari bo'yicha ishlab chiqarish (Production) va sinov rejimlariga to'liq tayyor!**
