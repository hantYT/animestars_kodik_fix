# Сборка расширения

## Доступные команды

### Сборка
- `npm run build:dev` - Development сборка (с source maps и console.log)
- `npm run build:prod` - Production сборка (минифицированная, без console.log)
- `npm run dev` - Watch режим для разработки

### Версионирование
- `npm run version:patch` - Увеличить patch версию (1.0.1 → 1.0.2)
- `npm run version:minor` - Увеличить minor версию (1.0.1 → 1.1.0)  
- `npm run version:major` - Увеличить major версию (1.0.1 → 2.0.0)

### Упаковка
- `npm run package` - Production сборка + архив с версией
- `npm run package:dev` - Development сборка + архив с версией
- `npm run zip:versioned` - Создать архив с текущей версией

### Релиз (версия + сборка + архив)
- `npm run release:patch` - Patch релиз (1.0.1 → 1.0.2 + сборка + архив)
- `npm run release:minor` - Minor релиз (1.0.1 → 1.1.0 + сборка + архив)
- `npm run release:major` - Major релиз (1.0.1 → 2.0.0 + сборка + архив)

## Примеры использования

```bash
# Обычная разработка
npm run dev

# Создать patch релиз
npm run release:patch

# Создать minor релиз с новыми функциями
npm run release:minor

# Создать major релиз с breaking changes
npm run release:major

# Просто собрать без изменения версии
npm run package
```

## Результат

Архивы создаются с именами вида: `animestars-kodik-optimizer-v1.0.2.zip`

Файлы также копируются в папку `../releases/` если она существует.
