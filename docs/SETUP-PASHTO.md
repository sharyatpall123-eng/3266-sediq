# د نصب دقیق مراحل

## A. ZIP Extract

ZIP داسې Extract کړئ چې اصلي `package.json` مستقیم په project folder کې وي:

```text
Desktop\warehouse-system-pro\package.json
Desktop\warehouse-system-pro\client
Desktop\warehouse-system-pro\server
```

په اضافي بهرني فولډر کې commands مه چلوئ.

## B. CMD

```cmd
cd /d C:\Users\Azizullah\Desktop\warehouse-system-pro
npm install
```

## C. Supabase keys

Supabase Dashboard کې:

```text
Project Settings > API
```

له هغه ځایه URL، anon key او service role key واخلئ.

## D. Database schema

Supabase Dashboard کې:

```text
SQL Editor > New query
```

`supabase/migrations/001_complete_schema.sql` ټول Copy/Paste او Run کړئ.

## E. Admin

```cmd
npm run create:admin -- --email admin@example.com --password StrongPass123 --username admin --name "Administrator"
```

## F. Run

```cmd
npm run dev
```

CMD مه بندوئ. کله چې CMD بند شي، frontend او backend دواړه بندېږي.

## G. Forgot Password

د Supabase Authentication په URL Configuration کې دا Redirect URL اضافه کړئ:

```text
http://localhost:5173/reset-password
```

په production کې د خپل اصلي domain همدا `/reset-password` URL وکاروئ.
