# Domato Broker

Centro integral de gestión patrimonial: dashboard, cartera de bonos, histórico,
informes exportables, indicadores internacionales y noticias financieras
filtradas.

## Qué incluye esta versión (MVP + fase 2)

- **Dashboard**: valor total, variaciones diaria/mensual/anual, rentabilidad
  acumulada, patrimonio máximo, gráfico de evolución, resumen de alertas.
- **Cartera**: tabla completa de bonos, carga manual y por CSV (con plantilla
  descargable).
- **Histórico**: comparativos hoy vs. ayer / mes / año, registro diario.
- **Riesgo y benchmark**: duration, duration modificada y convexidad
  ponderadas por valor de mercado; VaR diario (histórico y paramétrico);
  concentración por moneda, corredor y duration; comparación de la
  rentabilidad anualizada contra benchmarks de referencia.
- **Simulador de escenarios**: vender hoy, mantener a vencimiento, reinvertir
  cupones, cambio de tasas, cambio de precio, cambio del dólar — por bono.
- **Alertas inteligentes**: cupones y vencimientos próximos, variaciones
  relevantes por bono y movimientos fuertes de los índices de mercado;
  calculadas también en `/api/alerts`, listo para un cron diario y para
  emailear vía Resend si configurás las variables correspondientes.
- **Calendario financiero**: vista mensual con cupones y vencimientos de toda
  la cartera, más un listado de próximos eventos.
- **Perfil del inversor**: objetivos, rentabilidad objetivo, riesgo aceptado,
  horizonte y distribución objetivo — persistido en Supabase.
- **Informes**: exportación a PDF (diario/mensual/anual) y Excel.
- **Mercados**: Dow Jones, Nasdaq, S&P 500, Russell 2000, VIX, Treasuries
  (2/5/10/20/30 años vía FRED), commodities (WTI, Brent, oro, plata, cobre) y
  monedas (DXY, EUR/USD, USD/JPY, USD/UYU, USD/ARS, USD/BRL).
- **Noticias**: agregador RSS filtrado por Uruguay / EEUU / Argentina / Brasil
  y por palabras clave (bonos, tasas, inflación, Fed, petróleo, riesgo país).

## Qué queda pendiente

- Integración automática con la Bolsa de Valores de Montevideo (BVM): la BVM
  no tiene una API pública gratuita; hay que gestionar acceso directamente
  con ellos.
- Lectura automática de estados de cuenta en PDF vía OCR + IA: es factible,
  pero cada corredor tiene su propio formato y conviene ajustarlo con
  ejemplos reales de tus PDFs.
- Notificaciones push (requieren registrar un service worker en el
  navegador — el cálculo de alertas ya existe, falta el canal push).

Avisame cuando quieras seguir con alguna de estas y las vamos sumando.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Supabase (Postgres) para persistencia
- Recharts para gráficos
- FRED API para tasas del Tesoro de EEUU
- Yahoo Finance (endpoint público) para índices, commodities y monedas
- RSS para noticias

## Cómo ponerlo en marcha

### 1. Base de datos (Supabase)

1. Creá una cuenta gratis en [supabase.com](https://supabase.com) y un
   proyecto nuevo.
2. Andá a **SQL Editor** y pegá el contenido de `supabase/schema.sql`. Ejecutalo.
   Si ya habías creado la base antes de esta actualización, te faltará la
   columna `convexidad` en `bonds` y la tabla `investor_profile` — el mismo
   archivo trae los `create table if not exists` necesarios, y dejé además
   el `alter table` puntual comentado ahí mismo por si preferís correrlo solo.
3. En **Project Settings > API** copiá:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (¡no la expongas en el
     frontend, solo se usa en `/api/snapshot`!)

### 2. Variables de entorno

Copiá `.env.example` a `.env.local` y completá los valores:

```bash
cp .env.example .env.local
```

- `FRED_API_KEY`: clave gratuita en
  https://fred.stlouisfed.org/docs/api/api_key.html (para las tasas del
  Tesoro; si la dejás vacía, esa sección del panel de Mercados avisa que
  falta configurarla, el resto de la app funciona igual).
- `CRON_SECRET`: cualquier string secreto que definas vos, para proteger el
  endpoint que graba el snapshot diario.

### 3. Correr en local

```bash
npm install
npm run dev
```

Abrí http://localhost:3000 — te redirige al Dashboard.

### 4. Deploy a Vercel

1. Subí este proyecto a un repo de GitHub (`git init`, `git add .`,
   `git commit`, y creá el repo en GitHub).
2. Entrá a [vercel.com](https://vercel.com) → **Add New Project** → importá
   el repo.
3. En **Environment Variables**, cargá las mismas variables de tu
   `.env.local` (incluida `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET`).
4. Deploy. Vercel detecta Next.js automáticamente.
5. El cron en `vercel.json` (`/api/snapshot`, todos los días a las 22:00 UTC
   ≈ 19:00 en Uruguay) empieza a correr solo una vez que el proyecto está en
   producción — así se va armando el histórico día a día.

### 5. Cargar tu cartera

Entrá a **Cartera** → **+ Agregar bono** para carga manual, o **Importar CSV**
usando la plantilla descargable en esa misma pantalla.

## Login

La app pide iniciar sesión — nadie puede ver ni tocar los datos sin loguearse
(las políticas de la base de datos, no solo la pantalla, están restringidas a
usuarios autenticados).

1. En Supabase, andá a **Authentication > Users** → **Add user** → **Create
   new user**.
2. Cargá el email y la contraseña con la que vas a entrar vos (marcá "Auto
   Confirm User" si te lo pregunta, para no depender de un mail de
   confirmación).
3. En **SQL Editor**, corré de nuevo el bloque de políticas al final de
   `supabase/schema.sql` (sección "Row Level Security") si ya habías corrido
   una versión anterior del schema — ahí es donde se restringe el acceso a
   usuarios logueados.
4. Entrá a tu sitio y logueate con ese email y contraseña.

No hay registro público (sign up): los usuarios se crean a mano desde
Supabase, uno por uno — apropiado para un panel de una sola persona o de un
equipo chico.

## Notas sobre los datos de mercado

El endpoint de índices/commodities/monedas usa un endpoint público de Yahoo
Finance que no requiere clave, pero no es una API oficial contratada — si en
algún momento deja de responder, se puede reemplazar por un proveedor como
Twelve Data o Alpha Vantage (tienen planes gratuitos con límite de consultas).
