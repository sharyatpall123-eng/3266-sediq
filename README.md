# WMS Pro 2.0

دا د React 19، Vite، Tailwind CSS v4، Node.js، Express.js او Supabase پر بنسټ بشپړ Full Stack Warehouse Management System دی.

## مهم بدلونونه

- د پخوانۍ ګډوډې پروژې تکراري او خراب فایلونه لرې شول.
- ټولې پاڼې یو واحد Premium Blue/White/Glass design system کاروي.
- Products او Categories جلا pages نه لري؛ ټول product management د Warehouse دننه دی.
- Dashboard ته د نخل او سمندر background ورکړل شوی.
- نورې pages د روښانه ساحل background کاروي.
- Node.js REST API، Supabase database schema، authentication، storage او backup/restore شامل دي.
- Stock In او Stock Out database transactions د Supabase RPC functions له لارې atomic دي.
- Debtors، payments، invoices، reports، notifications، settings او representatives فعال دي.

## Folder Structure

```text
warehouse-system-pro/
├── client/                 React + Vite + Tailwind CSS v4
├── server/                 Node.js + Express REST API
├── supabase/               Database migration and seed
├── docs/                   Setup and API notes
├── package.json            Root workspace scripts
└── README.md
```

## 1. Requirements

- Node.js 20.19 یا تر دې پورته
- npm
- Supabase account

## 2. Dependencies نصب

په اصلي فولډر کې CMD خلاص کړئ:

```cmd
npm install
```

یا:

```cmd
npm run install:all
```

## 3. Supabase Database

1. Supabase کې نوی Project جوړ کړئ.
2. SQL Editor خلاص کړئ.
3. دا فایل بشپړ Run کړئ:

```text
supabase/migrations/001_complete_schema.sql
```

4. اختیاري Demo data لپاره دا Run کړئ:

```text
supabase/seed.sql
```

## 4. Server Environment

دا فایل Copy کړئ:

```text
server/.env.example
```

نوم یې داسې کړئ:

```text
server/.env
```

بیا حقیقي Supabase معلومات پکې واچوئ:

```env
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
PASSWORD_RESET_REDIRECT=http://localhost:5173/reset-password
```

`SUPABASE_SERVICE_ROLE_KEY` هېڅکله client folder ته مه انتقالوئ او GitHub ته یې مه پورته کوئ.

## 5. لومړی Administrator جوړول

Database migration او `.env` تر بشپړولو وروسته:

```cmd
npm run create:admin -- --email admin@example.com --password StrongPass123 --username admin --name "Administrator"
```

بیا Login:

```text
Username: admin
Password: StrongPass123
```

## 6. پروژه چلول

```cmd
npm run dev
```

Frontend:

```text
http://localhost:5173
```

Backend health check:

```text
http://localhost:5000/api/health
```

## 7. Production Build

```cmd
npm run build
npm start
```

د frontend `client/dist` فولډر د Static hosting لپاره چمتو کېږي. Backend جلا Node hosting ته Deploy کړئ.

## Security

- Frontend مستقیم database ته حساس عملیات نه کوي.
- Supabase service role key یوازې Node server کاروي.
- ټول حساس API routes د Supabase access token تصدیق کوي.
- Access token د refresh token له لارې په اتومات ډول تازه کېږي.
- Forgot Password لینک د `/reset-password` بشپړې پاڼې له لارې نوی Password ثبتوي.
- Row Level Security په ټولو مهمو tables فعاله ده.
- Login rate limiting، Helmet، CORS او input checks شامل دي.
- Delete product soft delete دی.
- قرضدار د پاتې قرض په حالت کې نه حذف کېږي.
- Stock Out تر موجود quantity زیات نه ثبتېږي.

## Database Backup

Settings page کې:

- Backup Database: مهم tables د JSON file په توګه ډاونلوډ کوي.
- Restore Database: یوازې Administrator کولی شي JSON backup بېرته restore کړي.

د Supabase خپل managed backups هم جلا فعال وساتئ.
