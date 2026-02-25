# API Documentation - Esvitlov2 (СвітлоБот)

## Bot Commands

### User Commands
- `/start` - Початок роботи з ботом, запуск майстра налаштування
  - Доступ: Всі користувачі
  - Дія: Показує привітальне повідомлення та запускає wizard для налаштування регіону, черги та способу сповіщень

- `/schedule` - Показати розклад відключень
  - Доступ: Зареєстровані користувачі
  - Дія: Відображає поточний графік відключень електроенергії для обраної черги

- `/next` - Показати наступну подію
  - Доступ: Зареєстровані користувачі
  - Дія: Відображає час наступного вмикання/вимикання світла

- `/timer` - Встановити таймер до події
  - Доступ: Зареєстровані користувачі
  - Дія: Показує скільки часу залишилось до наступної зміни стану електроенергії

- `/settings` - Налаштування профілю
  - Доступ: Зареєстровані користувачі
  - Дія: Меню налаштувань (регіон, черга, канал, сповіщення, дані)

- `/channel` - Керування каналом
  - Доступ: Зареєстровані користувачі
  - Дія: Підключення/налаштування Telegram-каналу для сповіщень

- `/cancel` - Скасувати поточну операцію
  - Доступ: Всі користувачі
  - Дія: Скасовує введення даних у conversation-режимі

### Admin Commands
- `/admin` - Панель адміністратора
  - Доступ: Адміністратори (ADMIN_IDS) та власник (OWNER_ID)
  - Дія: Головне меню адміністратора з доступом до всіх функцій управління

- `/dashboard` - Панель інструментів адміністратора
  - Доступ: Адміністратори та власник
  - Дія: Швидкий доступ до статистики та керування ботом

- `/stats` - Статистика користувачів
  - Доступ: Адміністратори та власник
  - Дія: Показує кількість активних користувачів, каналів, розподіл по регіонах

- `/system` - Системна інформація
  - Доступ: Адміністратори та власник
  - Дія: Відображає uptime, використання пам'яті, стан БД

- `/monitoring` - Моніторинг та логи
  - Доступ: Адміністратори та власник
  - Дія: Перегляд системних метрик, логів, помилок

- `/broadcast <текст>` - Розсилка повідомлень
  - Доступ: Тільки власник (OWNER_ID)
  - Дія: Надсилає повідомлення всім активним користувачам
  - Приклад: `/broadcast Важливе оновлення!`

- `/setalertchannel <channel_id>` - Встановити канал для сповіщень адміністратора
  - Доступ: Тільки власник
  - Дія: Налаштовує канал для отримання системних сповіщень
  - Приклад: `/setalertchannel -1001234567890`

- `/setinterval <секунди>` - Встановити інтервал перевірки
  - Доступ: Адміністратори та власник
  - Дія: Змінює частоту перевірки графіків відключень
  - Приклад: `/setinterval 60`

- `/setdebounce <хвилини>` - Встановити debounce для сповіщень
  - Доступ: Адміністратори та власник
  - Дія: Встановлює мінімальний інтервал між однаковими сповіщеннями
  - Приклад: `/setdebounce 30`

- `/getdebounce` - Отримати поточний debounce
  - Доступ: Адміністратори та власник
  - Дія: Показує поточне значення debounce

## Callback Data Formats

### Exact Match Callbacks
- `menu_schedule` - Перехід до розкладу з головного меню
- `menu_timer` - Перехід до таймера з головного меню
- `menu_stats` - Показати статистику користувача
- `menu_help` - Показати довідку
- `menu_settings` - Перехід до налаштувань
- `back_to_main` - Повернутись до головного меню
- `back_to_settings` - Повернутись до налаштувань
- `confirm_setup` - Підтвердження налаштувань у wizard
- `back_to_region` - Повернутись до вибору регіону у wizard
- `restore_profile` - Відновити профіль існуючого користувача
- `create_new_profile` - Створити новий профіль
- `wizard_notify_bot` - Обрати сповіщення в боті (wizard)
- `wizard_notify_channel` - Обрати сповіщення в каналі (wizard)
- `wizard_notify_back` - Повернутись до вибору способу сповіщень (wizard)
- `channel_reconnect` - Перепідключити канал
- `confirm_deactivate` - Підтвердити деактивацію профілю
- `confirm_delete_data` - Підтвердити видалення даних
- `delete_data_step2` - Другий крок видалення даних (остаточне підтвердження)
- `cancel_channel_connect` - Скасувати підключення каналу
- `keep_current_channel` - Залишити поточний канал
- `help_howto` - Показати інструкції
- `help_faq` - Показати FAQ

### Prefix Match Callbacks
- `region_<region_code>` - Вибір регіону (наприклад, `region_kyiv`, `region_kharkiv`)
- `queue_<queue_number>` - Вибір черги (наприклад, `queue_1.1`, `queue_3.2`)
- `region_request_<action>` - Запит на додавання нового регіону
- `wizard_channel_confirm_<channel_id>` - Підтвердження підключення каналу в wizard
- `timer_<user_id>` - Показати таймер для користувача
- `stats_<user_id>` - Показати статистику для користувача
- `settings_<section>` - Розділи налаштувань (region, queue, alerts, channel, data, ip)
- `alert_<type>` - Налаштування сповіщень
- `ip_<action>` - Керування IP-моніторингом
- `notify_target_<target>` - Вибір способу сповіщень (bot, channel, both)
- `schedule_alert_<action>` - Налаштування сповіщень про графіки
- `feedback_<action>` - Зворотній зв'язок
- `admin_<action>` - Дії адміністратора
- `pause_<action>` - Керування режимом паузи
- `debounce_<action>` - Керування debounce
- `growth_<action>` - Керування обмеженнями зростання
- `dashboard_<section>` - Розділи панелі адміністратора
- `channel_<action>` - Дії з каналом (connect, info, disable, test, etc.)
- `brand_<action>` - Брендинг каналу (назва, опис)
- `test_<type>` - Тестові повідомлення для каналу
- `format_<action>` - Налаштування формату повідомлень
- `connect_channel_<channel_id>` - Підключити канал (автовизначення)
- `replace_channel_<channel_id>` - Замінити поточний канал новим

## Database Schema

### Table: `users`
Основна таблиця користувачів бота.

**Поля:**
- `id` (SERIAL PRIMARY KEY) - Унікальний ідентифікатор запису
- `telegram_id` (VARCHAR(20) UNIQUE NOT NULL) - Telegram ID користувача
- `username` (VARCHAR(255)) - Username користувача Telegram
- `region` (VARCHAR(50) NOT NULL) - Код регіону (kyiv, kharkiv, lviv, etc.)
- `queue` (VARCHAR(10) NOT NULL) - Номер черги (1.1, 2.3, etc.)
- `is_active` (BOOLEAN DEFAULT true) - Чи активний профіль користувача
- `channel_id` (VARCHAR(20)) - ID підключеного Telegram-каналу
- `channel_title` (TEXT) - Назва підключеного каналу
- `power_notify_target` (VARCHAR(20) DEFAULT 'bot') - Куди надсилати сповіщення: 'bot', 'channel', 'both'
- `router_ip` (VARCHAR(255)) - IP-адреса роутера для моніторингу
- `router_check_interval` (INTEGER DEFAULT 60) - Інтервал перевірки роутера (секунди)
- `last_schedule_hash` (VARCHAR(64)) - Хеш останнього отриманого графіка
- `last_start_message_id` (INTEGER) - ID останнього повідомлення від /start
- `created_at` (TIMESTAMP DEFAULT NOW()) - Дата створення запису
- `updated_at` (TIMESTAMP DEFAULT NOW()) - Дата останнього оновлення

### Table: `settings`
Глобальні налаштування бота.

**Поля:**
- `key` (VARCHAR(255) PRIMARY KEY) - Ключ налаштування
- `value` (TEXT) - Значення налаштування

**Основні ключі:**
- `bot_paused` - Режим паузи ('0' або '1')
- `pause_message` - Повідомлення в режимі паузи
- `pause_show_support` - Показувати кнопку підтримки ('0' або '1')
- `alert_channel_id` - ID каналу для адмін-сповіщень
- `check_interval` - Інтервал перевірки графіків (секунди)
- `growth_stage` - Стадія зростання ('0'-'4')
- `registration_enabled` - Дозволити реєстрацію ('0' або '1')

### Table: `pending_channels`
Тимчасові канали в процесі підключення.

**Поля:**
- `channel_id` (VARCHAR(20) PRIMARY KEY) - ID каналу
- `telegram_id` (VARCHAR(20)) - ID користувача, який додає канал
- `channel_title` (TEXT) - Назва каналу
- `channel_username` (VARCHAR(255)) - Username каналу
- `timestamp` (BIGINT) - Timestamp створення (мілісекунди)

## Environment Variables

### Required
- `BOT_TOKEN` (string) - Telegram Bot API токен
- `DATABASE_URL` (string) - PostgreSQL connection string (postgres://user:pass@host:port/db)

### Optional
- `OWNER_ID` (number) - Telegram ID власника бота (для команд тільки для власника)
- `ADMIN_IDS` (comma-separated numbers) - Список Telegram ID адміністраторів
- `TZ` (string, default: 'Europe/Kyiv') - Timezone для бота
- `ROUTER_HOST` (string) - IP або hostname роутера для моніторингу
- `ROUTER_PORT` (number, default: 80, range: 1-65535) - Порт роутера
- `WEBHOOK_URL` (string, must start with 'https://') - URL для webhook режиму
- `WEBHOOK_PATH` (string) - Шлях для webhook
- `WEBHOOK_PORT` (number, default: 3000) - Порт для webhook
- `WEBHOOK_MAX_CONNECTIONS` (number, default: 100) - Максимум одночасних з'єднань
- `USE_WEBHOOK` (boolean) - Використовувати webhook замість polling
- `PORT` (number, default: 3000) - Порт для health check або webhook
- `HEALTH_PORT` (number, default: 3000) - Порт для health check endpoint

### Performance Tuning
- `DB_POOL_MAX` (number, default: 50) - Максимум з'єднань у пулі БД
- `DB_POOL_MIN` (number, default: 5) - Мінімум з'єднань у пулі БД
- `TELEGRAM_RATE_LIMIT` (number, default: 25) - Ліміт повідомлень на секунду
- `MESSAGE_RETRY_COUNT` (number, default: 3) - Кількість повторних спроб при помилках
- `SCHEDULER_BATCH_SIZE` (number, default: 5) - Кількість паралельних регіонів при перевірці
- `SCHEDULER_STAGGER_MS` (number, default: 50) - Затримка між користувачами (мс)
