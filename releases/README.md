# Папка для релизов

Здесь хранятся собранные версии расширения для релизов.

## Структура

- `animestars-kodik-optimizer-v1.0.0.zip` - Релиз версии 1.0.0
- `animestars-kodik-optimizer-v1.1.0.zip` - Релиз версии 1.1.0
- и т.д.

## Создание релиза

Используйте скрипт из корневой папки:

```bash
npm run release
```

Или создайте вручную:

```bash
cd extension
npm run build
cd dist
zip -r ../../releases/animestars-kodik-optimizer-v1.0.0.zip *
```
