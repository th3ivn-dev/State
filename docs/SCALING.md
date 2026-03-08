# 📈 Горизонтальне масштабування СвітлоБот

> Документ описує поточну архітектуру, обмеження Telegram API та рекомендації щодо масштабування бота для роботи з великою кількістю користувачів.

---

## 🏗️ Поточна архітектура

Бот працює як **єдиний процес Node.js**, де об'єднані:

- **Telegram Bot** — приймає команди та повідомлення від користувачів
- **Scheduler** — cron-задачі для автоматичної відправки нагадувань та фактів
- **BullMQ Worker** — обробник черги повідомлень (concurrency: 15, limiter: 20/сек)
- **Redis** — черга BullMQ + кеш фото (PR #44)
- **PostgreSQL** — основна база даних користувачів

```
┌─────────────────────────────────────────────────────┐
│                   Node.js Process                   │
│                                                     │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │ Telegram │  │ Scheduler │  │  BullMQ Worker   │ │
│  │   Bot    │  │  (cron)   │  │  concurrency=15  │ │
│  └────┬─────┘  └─────┬─────┘  └────────┬─────────┘ │
│       │              │                  │           │
│       └──────────────┴─────────────────┘           │
│                       │                             │
└───────────────────────┼─────────────────────────────┘
                        │
              ┌─────────┴─────────┐
              │                   │
        ┌─────▼──────┐    ┌───────▼──────┐
        │   Redis    │    │  PostgreSQL  │
        │  (Queue +  │    │    (Users)   │
        │  Photo     │    │              │
        │  Cache)    │    │              │
        └────────────┘    └──────────────┘
```

---

## 📡 Telegram API Rate Limits

Telegram накладає жорсткі обмеження на відправку повідомлень:

| Обмеження | Значення | Примітка |
|-----------|----------|----------|
| Загальна швидкість | **30 msg/сек** | Для всіх чатів разом |
| На один чат | **20 msg/хв** | Персональні чати |
| На канал | **1 msg/сек** | Публічні канали |

### ⏱️ Розрахунок часу масової розсилки

При 100 000 активних користувачів:

```
100 000 повідомлень / 30 msg/сек = ~3 333 секунди ≈ 55 хвилин
```

> ⚠️ **Важливо:** BullMQ limiter (BULLMQ_RATE_MAX/BULLMQ_RATE_DURATION) слід виставляти
> менше максимального ліміту Telegram, щоб уникнути помилок 429 (Too Many Requests).

---

## ⚙️ BullMQ масштабування

### Як працює concurrency

`BULLMQ_CONCURRENCY` визначає кількість **паралельних job** в одному worker-процесі:

```
Worker 1: [job1] [job2] [job3] ... [job15]  ← concurrency=15
Worker 2: [job16] [job17] ...               ← окремий процес
```

### Як працює limiter

`BULLMQ_RATE_MAX` і `BULLMQ_RATE_DURATION` обмежують швидкість обробки **по всіх worker-ах разом** (через Redis):

```javascript
limiter: {
  max: 20,        // не більше 20 job
  duration: 1000, // за 1000ms (1 секунду)
}
```

> 💡 Limiter BullMQ є **глобальним** і координується через Redis — навіть якщо запущено декілька worker-процесів, загальна швидкість не перевищить вказаний ліміт.

### Запуск кількох worker-процесів

```bash
# Термінал 1 (головний процес)
npm start

# Термінал 2 (додатковий worker — шаблон)
npm run worker
```

> ⚠️ **Поточне обмеження:** `src/queue/workerProcess.js` — це шаблон для майбутнього масштабування. Повноцінний standalone worker потребує доступу до bot instance для відправки повідомлень.

---

## 🗄️ Redis вимоги

### Мінімальна пам'ять Redis

| Кількість юзерів | Мін. RAM Redis | Рекомендовано |
|-----------------|---------------|---------------|
| До 5 000 | 50 MB | 100 MB |
| 5 000 – 50 000 | 200 MB | 512 MB |
| 50 000 – 500 000 | 1 GB | 2 GB |

### Що займає пам'ять у Redis

1. **BullMQ черга** — кожен job ≈ 1–5 KB (з даними фото значно більше)
2. **Photo Cache** (PR #44) — кеш base64-фото ≈ 200–500 KB на фото
3. **BullMQ limiter** — незначно (лічильники)

### Рекомендований план Railway Redis

- **Starter:** до 5к юзерів — безкоштовний план (25 MB — лише для тестування)
- **Growth:** 5к–50к юзерів — Railway Redis Hobby ($5–10/міс, 512 MB)
- **Scale:** 50к–500к юзерів — Railway Redis Pro (1–2 GB)

---

## 🐘 PostgreSQL оптимізація

### Connection Pooling

Налаштовується через змінні середовища:

```env
DB_POOL_MAX=10  # максимальна кількість з'єднань у пулі
DB_POOL_MIN=2   # мінімальна кількість активних з'єднань
```

| Масштаб | DB_POOL_MAX | DB_POOL_MIN |
|---------|-------------|-------------|
| До 5к | 5 | 1 |
| 5к–50к | 10 | 2 |
| 50к–500к | 20 | 5 |

### Нормалізовані таблиці (PR #43)

Нормалізована схема БД суттєво зменшує навантаження на PostgreSQL при великій кількості юзерів завдяки:
- Зменшенню дублювання даних
- Ефективнішим JOIN-запитам
- Кращому використанню індексів

### Batch операції

Для масових оновлень використовуйте batch INSERT/UPDATE замість окремих запитів:

```javascript
// ✅ Добре — одна транзакція на багато рядків
await db.query('UPDATE users SET active = false WHERE id = ANY($1)', [inactiveIds]);

// ❌ Погано — окремий запит для кожного юзера
for (const id of inactiveIds) {
  await db.query('UPDATE users SET active = false WHERE id = $1', [id]);
}
```

---

## 🚂 Railway-specific рекомендації

### Горизонтальне масштабування на Railway

Railway підтримує кілька підходів:

#### Варіант 1: Збільшення ресурсів одного сервісу (Vertical Scaling)
```
Railway Service: svitlobot
  CPU: 1 → 2 vCPU
  RAM: 512 MB → 1 GB
```

#### Варіант 2: Кілька сервісів (Horizontal Scaling)
```
Railway Project
├── svitlobot-main    (bot + scheduler + worker)
├── svitlobot-worker  (додатковий worker — майбутнє)
├── Redis             (shared між сервісами)
└── PostgreSQL        (shared між сервісами)
```

### Рекомендовані ресурси Railway

| Масштаб | CPU | RAM | Redis | PostgreSQL |
|---------|-----|-----|-------|------------|
| До 5к | 0.5 vCPU | 256 MB | 100 MB | Starter |
| 5к–50к | 1 vCPU | 512 MB | 512 MB | Hobby |
| 50к–500к | 2 vCPU | 1 GB | 2 GB | Pro |

### railway.json конфігурація

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## 🖼️ Photo Cache (PR #44)

### Чому це критично для масштабу

Без кешування фото, при масовій розсилці 100к юзерів:
- Кожен job завантажував би фото **окремо** → 100к HTTP запитів до зовнішнього API
- Величезне навантаження на зовнішній сервіс розкладу
- Ймовірне блокування IP через rate limiting

### Як працює Photo Cache

```
1. Scheduler отримує фото розкладу (один HTTP запит)
2. Зберігає фото в Redis як base64 з TTL 1 година
3. При додаванні jobs до черги — передає photoCacheKey
4. Workers читають фото з Redis (швидко, без HTTP)
5. Через TTL старий кеш автоматично видаляється
```

```javascript
// Кеш ключ формату: photo:{timestamp}
// TTL: 3600 секунд (1 година)
await setCachedPhoto(cacheKey, base64Data);

// Worker читає з кешу
const photoData = await getCachedPhoto(photoCacheKey);
```

---

## 📊 Конфігурація для різних масштабів

### 🟢 До 5 000 юзерів (Starter)

```env
# BullMQ
BULLMQ_CONCURRENCY=5
BULLMQ_RATE_MAX=10
BULLMQ_RATE_DURATION=1000

# Database
DB_POOL_MAX=5
DB_POOL_MIN=1

# Redis
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info
```

**Ресурси Railway:**
- Bot Service: 0.5 vCPU, 256 MB RAM
- Redis: безкоштовний план або Hobby
- PostgreSQL: Starter план

---

### 🟡 5 000 – 50 000 юзерів (Growth)

```env
# BullMQ
BULLMQ_CONCURRENCY=15
BULLMQ_RATE_MAX=20
BULLMQ_RATE_DURATION=1000

# Database
DB_POOL_MAX=10
DB_POOL_MIN=2

# Redis
REDIS_URL=redis://:password@hostname:6379

# Logging
LOG_LEVEL=warn
```

**Ресурси Railway:**
- Bot Service: 1 vCPU, 512 MB RAM
- Redis: Hobby план (512 MB)
- PostgreSQL: Hobby план

---

### 🔴 50 000 – 500 000 юзерів (Scale)

```env
# BullMQ
BULLMQ_CONCURRENCY=30
BULLMQ_RATE_MAX=25
BULLMQ_RATE_DURATION=1000

# Database
DB_POOL_MAX=20
DB_POOL_MIN=5

# Redis
REDIS_URL=redis://:password@hostname:6379

# Logging
LOG_LEVEL=error
```

**Ресурси Railway:**
- Bot Service: 2 vCPU, 1 GB RAM
- Redis: Pro план (2 GB)
- PostgreSQL: Pro план

---

### Таблиця порівняння env змінних

| Змінна | До 5к (Starter) | 5к–50к (Growth) | 50к–500к (Scale) |
|--------|-----------------|-----------------|------------------|
| `BULLMQ_CONCURRENCY` | 5 | 15 | 30 |
| `BULLMQ_RATE_MAX` | 10 | 20 | 25 |
| `BULLMQ_RATE_DURATION` | 1000 | 1000 | 1000 |
| `DB_POOL_MAX` | 5 | 10 | 20 |
| `DB_POOL_MIN` | 1 | 2 | 5 |

> ⚠️ `BULLMQ_RATE_MAX` не повинен перевищувати **30 msg/сек** (ліміт Telegram).
> З запасом рекомендується тримати ≤25.

---

## 📉 Моніторинг

### Що відстежувати

#### Redis пам'ять
```bash
# Підключення до Redis CLI
redis-cli info memory

# Ключові метрики:
# used_memory_human — поточне використання
# maxmemory_human — максимум
# mem_fragmentation_ratio — фрагментація (норма: 1.0–1.5)
```

#### Queue stats
```javascript
// Доступно через getQueueStats() з notificationsQueue.js
const stats = await getQueueStats();
// { active, completed, failed, delayed, waiting }
```

Здорові показники:
- `waiting` — має зменшуватись після розсилки
- `failed` — має бути близько до 0
- `active` ≤ `BULLMQ_CONCURRENCY`

#### Database connection pool
```javascript
// Моніторинг через pg pool events
pool.on('connect', () => { /* нове з'єднання */ });
pool.on('acquire', () => { /* з'єднання взято з пулу */ });
pool.on('remove', () => { /* з'єднання видалено */ });
```

#### Node.js heap
```javascript
const used = process.memoryUsage();
console.log(`Heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
```

### Рекомендовані пороги алертів

| Метрика | Попередження | Критично |
|---------|-------------|---------|
| Redis RAM | >70% max | >90% max |
| Queue failed jobs | >50/хв | >200/хв |
| DB pool wait | >100ms | >500ms |
| Node.js heap | >80% limit | >95% limit |
| Telegram 429 errors | >10/хв | >50/хв |

---

## ✅ Checklist перед масштабуванням

### Інфраструктура
- [ ] Redis має достатньо пам'яті для очікуваного навантаження
- [ ] PostgreSQL connection pool налаштований відповідно до масштабу
- [ ] `BULLMQ_RATE_MAX` ≤ 25 msg/сек (з запасом від ліміту Telegram 30/сек)
- [ ] Налаштований моніторинг Redis пам'яті
- [ ] Налаштований моніторинг queue stats (failed jobs)

### Код та конфігурація
- [ ] `BULLMQ_CONCURRENCY` виставлений відповідно до доступних ресурсів
- [ ] Photo Cache (PR #44) активний — Redis URL доступний
- [ ] Нормалізована схема БД (PR #43) застосована
- [ ] Міграції БД успішно пройдені
- [ ] `.env` змінні оновлені для нового масштабу

### Тестування перед production
- [ ] Протестована відправка 100–1000 повідомлень вручну
- [ ] Перевірена швидкість доставки та відсоток помилок
- [ ] Перевірений час очищення черги після масової розсилки
- [ ] Перевірена поведінка при Redis перезавантаженні
- [ ] Перевірена поведінка при Telegram 429 помилках

### Railway deployment
- [ ] Ресурси сервісу відповідають очікуваному навантаженню
- [ ] Health check налаштований
- [ ] Restart policy виставлена (ON_FAILURE, max retries: 10)
- [ ] Логи доступні та читабельні
- [ ] Alerting через Railway Webhooks або зовнішній сервіс

---

## 📚 Корисні посилання

- [BullMQ документація](https://docs.bullmq.io/)
- [Telegram Bot API Rate Limits](https://core.telegram.org/bots/faq#broadcasting-to-users)
- [Railway документація](https://docs.railway.app/)
- [ioredis документація](https://github.com/redis/ioredis)
