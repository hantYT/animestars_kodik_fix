# Git Ignore Configuration

## Что ИГНОРИРУЕТСЯ (не попадает в Git):

### Файлы релизов:
- `releases/*.zip` - Собранные ZIP архивы расширений
- `animestars-kodik-optimizer-*.zip` - Любые ZIP файлы расширения в корне
- `release_notes.txt` - Временные файлы заметок к релизу
- `*.crx` - Упакованные расширения Chrome
- `*.pem` - Приватные ключи

### Временные файлы сборки:
- `extension/dist/` - Собранные файлы расширения
- `extension/build/` - Альтернативная папка сборки
- `scripts/temp/` - Временные файлы скриптов
- `scripts/build-temp/` - Временные файлы сборки релизов

### Логи и отладка:
- `release-build.log` - Логи сборки релизов
- `build-*.log` - Логи сборки
- `*.tsbuildinfo` - Кэш TypeScript компилятора

### IDE и система:
- `.vscode/settings.json` - Персональные настройки VS Code
- `.DS_Store` - Системные файлы macOS
- `Thumbs.db` - Кэш миниатюр Windows

## Что СОХРАНЯЕТСЯ в Git:

### Исходный код:
- `extension/src/` - Исходный код расширения
- `scripts/build-release.js` - Скрипт сборки релизов
- `scripts/update-version.js` - Скрипт обновления версий

### Конфигурация:
- `extension/package.json` - Зависимости и конфигурация
- `extension/webpack.config.js` - Конфигурация сборки
- `extension/tsconfig.json` - Конфигурация TypeScript

### Документация:
- `README.md` - Основная документация
- `CHANGELOG.md` - История изменений
- `GITHUB_RELEASE_GUIDE.md` - Инструкция по релизам

### GitHub Actions:
- `.github/workflows/` - Автоматизация CI/CD

### Утилиты:
- `build-release.bat/.sh` - Скрипты быстрой сборки
- `releases/README.md` - Описание папки релизов

## Проверка игнорирования

```bash
# Проверить что будет проигнорировано
git status --ignored

# Проверить конкретный файл
git check-ignore releases/animestars-kodik-optimizer-v1.0.0.zip

# Показать все отслеживаемые файлы
git ls-files
```

## Принудительное добавление игнорируемых файлов

Если нужно добавить игнорируемый файл:
```bash
git add -f releases/example.zip
```

## Очистка уже отслеживаемых файлов

Если файл уже в Git, но должен игнорироваться:
```bash
git rm --cached releases/*.zip
git commit -m "Remove release files from tracking"
```
