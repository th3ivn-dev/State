# Copilot Instructions for Esvitlov2

## Project Overview
Esvitlov2 (СвітлоБот) — Telegram бот для моніторингу відключень електроенергії в Україні.

## Tech Stack
- **Runtime:** Node.js >= 20
- **Telegram Library:** grammY (NOT node-telegram-bot-api)
- **Database:** PostgreSQL (via `pg` driver)
- **Deployment:** Railway
- **Scheduler:** node-cron
- **Runner:** @grammyjs/runner (polling mode)

## Key Conventions
- All user-facing text must be in **Ukrainian** (Українська)
- Use `bot.api.*` methods for Telegram API calls (grammY style)
- Error handling: use `safeEditMessageText`, `safeAnswerCallbackQuery` from `src/utils/errorHandler.js`
- Use `isTelegramUserInactiveError()` to silently skip blocked/deactivated users
- Notify admins about errors via `notifyAdminsAboutError()` from `src/utils/adminNotifier.js`
- HTML parse mode for all Telegram messages
- Use `escapeHtml()` from `src/utils.js` for user-generated content

## Database
- PostgreSQL with connection pooling via `pg.Pool`
- All DB operations are in `src/database/` directory
- Migrations run automatically on startup via `runMigrations()`
- Never drop tables or delete user data without explicit admin action

## Project Structure
- `src/bot.js` — Bot instance, middleware, command & callback handlers
- `src/index.js` — Entry point, startup sequence, graceful shutdown
- `src/handlers/` — Command and callback handlers (start, schedule, settings, admin, channel, feedback, regionRequest)
- `src/keyboards/` — Inline keyboard definitions
- `src/database/` — Database operations (db.js, users.js)
- `src/constants/` — Constants (regions, timeouts)
- `src/utils/` — Utilities (errorHandler, messageQueue, adminNotifier, guards)
- `src/monitoring/` — Monitoring system
- `src/state/` — State management
- `src/services/` — External services
- `src/scheduler/` — Scheduler modules

## Important Notes
- The bot uses `@grammyjs/hydrate` middleware for convenient message editing
- The bot uses `@grammyjs/auto-retry` for automatic retry on 429 errors
- Channel auto-connect feature: bot detects when added as admin to a channel
- Graceful shutdown handles all cleanup (save states, close DB, stop polling)
- Test files are in the `tests/` directory
