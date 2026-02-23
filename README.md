# ⚡ Esvitlov Bot v2

Telegram бот для моніторингу відключень електроенергії та повідомлення користувачів.

## 🤖 Бот

**👉 [@svitlochekbot](https://t.me/svitlochekbot)**

## 🚀 Функціонал

- 📊 Актуальний графік відключень для вашої черги (Київ, Київщина, Дніпропетровщина, Одещина)
- ⏱ Таймер до наступного відключення або включення світла
- 🔔 Сповіщення про зміни графіка відключень
- ⚡ Моніторинг стану світла в реальному часі через ping домашнього роутера
- 📺 Автопублікація графіків та сповіщень у ваш Telegram канал
- 🛑 Режим паузи — тимчасово вимкнути сповіщення
- 📈 Аналітика зростання та метрики використання (для адміністраторів)
- 🔁 Автоматичний планувальник перевірки оновлень розкладу
- 🏥 HTTP health-check ендпоінт для моніторингу стану сервісу
- 🔄 Підтримка як polling, так і webhook режимів

## 📦 Встановлення

### Вимоги

- Node.js >= 20.0.0
- PostgreSQL (або Docker)
- Telegram Bot Token (від [@BotFather](https://t.me/BotFather))

### Кроки

1. Клонувати репозиторій:
   ```bash
   git clone https://github.com/Ivan200424/Esvitlov2.git
   cd Esvitlov2
   ```

2. Скопіювати `.env.example` → `.env` і заповнити змінні:
   ```bash
   cp .env.example .env
   ```

3. Встановити залежності:
   ```bash
   npm install
   ```

4. Запустити бота:
   ```bash
   npm start
   ```

### Запуск через Docker

```bash
docker-compose up -d
```

## 🏗️ Структура проєкту

```
Esvitlov2/
├── src/
│   ├── config.js              # Конфігурація з env-змінних
│   ├── index.js               # Точка входу, ініціалізація бота
│   ├── bot.js                 # Налаштування grammy бота
│   ├── scheduler.js           # Планувальник перевірки розкладів
│   ├── publisher.js           # Публікація в канали
│   ├── powerMonitor.js        # Моніторинг стану світла
│   ├── healthcheck.js         # HTTP health-check сервер
│   ├── formatter.js           # Форматування повідомлень
│   ├── parser.js              # Парсинг даних розкладу
│   ├── analytics.js           # Аналітика використання
│   ├── statistics.js          # Статистика бота
│   ├── api.js                 # Отримання даних з зовнішнього API
│   ├── constants/             # Константи (регіони, черги тощо)
│   ├── database/              # Підключення та запити до БД
│   ├── handlers/              # Обробники команд та кнопок
│   │   ├── admin/             # Адмін-команди
│   │   └── ...
│   ├── keyboards/             # Inline та reply клавіатури
│   ├── monitoring/            # Утиліти моніторингу
│   ├── scheduler/             # Модулі планувальника
│   ├── services/              # Бізнес-логіка
│   ├── state/                 # Управління станом розмов
│   └── utils/                 # Допоміжні утиліти (логер тощо)
├── tests/                     # Тести
├── docs/                      # Документація
├── docker-compose.yml         # Docker Compose конфігурація
├── Dockerfile                 # Docker образ
├── .env.example               # Шаблон змінних середовища
└── package.json
```

## 🧪 Розробка

```bash
npm run lint        # Перевірка коду ESLint
npm run lint:fix    # Автоматичне виправлення ESLint
npm run dev         # Запуск з nodemon (авто-перезавантаження)
npm test            # Запуск тестів
npm start           # Запуск бота
```

## 📋 CI/CD

- ESLint перевірка на кожен Pull Request
- Автоматичне тестування при пуші до репозиторію

## 🌍 Підтримувані регіони

- Київ
- Київщина
- Дніпропетровщина
- Одещина

Дані отримуються з [outage-data-ua](https://github.com/Baskerville42/outage-data-ua).

## 📚 Документація

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Інструкції з деплою
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Архітектура проєкту (якщо є)
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — Список змін
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — Як зробити внесок

## 📄 Ліцензія

[MIT](LICENSE) © 2026 Ivan200424

---

⚡ Esvitlov Bot v2 — слідкує, щоб ти не слідкував

Зроблено з ❤️ для України 🇺🇦
