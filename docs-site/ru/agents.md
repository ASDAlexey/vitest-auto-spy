---
title: Для ИИ-агентов
description: llms.txt, llms-full.txt, вложенный AGENTS.md и скилл для Claude Code — как навести Claude Code, Codex, Cursor или любого другого агента на эту библиотеку.
---

# Для ИИ-агентов

Эта страница помогает вашему агенту (Claude Code, Codex, Cursor, Copilot и другим) писать правильные
спеки с этой библиотекой. Выполните в проекте одну команду:

```bash
npx vitest-auto-spy init
```

Она добавляет короткий указатель в файлы инструкций, которые читают ваши агенты (`AGENTS.md`,
`CLAUDE.md`, `GEMINI.md` и несколько файлов для отдельных инструментов;
[полный список](#one-command)). Указатель отправляет агента в `node_modules/vitest-auto-spy/AGENTS.md` —
справочник, который входит в пакет и совпадает с установленной версией. В Claude Code вместо этого
можно поставить плагин; см. [Плагин для Claude Code](#claude-code-plugin).

Пакет содержит сжатую версию своей документации для агентов: дерево решений, смысл опций, таблицу
«ошибка → исправление» и частые ошибки.

## Одна команда {#one-command}

```bash
npx vitest-auto-spy init
```

Она записывает [указатель ниже](#point-your-agent-at-it-once) в файлы инструкций _этого_
репозитория и подставляет детали вашего проекта:

- какая точка входа подходит вашему раннеру;
- какой адаптер подходит вашему фреймворку;
- настоящий путь до setup-файла, где нужен `import 'vitest-auto-spy/rxjs'` (если rxjs не
  установлен, этой строки не будет).

Всё записанное лежит между маркерами и перегенерируется при следующем запуске. Обновление — дифф в
один блок, а `init --uninstall` возвращает файл как было.

| Команда                                | Что делает                                                           |
| -------------------------------------- | -------------------------------------------------------------------- |
| `npx vitest-auto-spy init`             | записать или обновить блок                                           |
| `npx vitest-auto-spy init --check`     | для CI: упасть, если блок отличается от того, что пишет эта версия   |
| `npx vitest-auto-spy init --uninstall` | удалить блок                                                         |

Что она пишет:

| Файл                                                          | Для кого                                     | Когда                                              |
| ------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------- |
| `AGENTS.md`                                                   | Codex, Cursor, Copilot и большинство других  | всегда (создаётся, если нет)                       |
| `CLAUDE.md`                                                   | Claude Code                                  | всегда (создаётся, если нет)                       |
| `GEMINI.md`                                                   | Gemini CLI                                   | всегда (создаётся, если нет)                       |
| `.claude/skills/vitest-auto-spy/SKILL.md`                     | заглушка скилла для Claude Code              | всегда                                             |
| `.cursor/rules/vitest-auto-spy.mdc`                           | Cursor, только для файлов спек               | только если есть папка `.cursor/`                  |
| `.github/instructions/vitest-auto-spy.instructions.md`        | GitHub Copilot, только для файлов спек       | только если есть папка `.github/`                  |
| `.windsurf/rules/…`, `.devin/rules/…`, `.clinerules/…`, `.roo/rules/…` | Windsurf, Devin, Cline, Roo         | только если есть эта папка                         |
| `.rules`, `.cursorrules`, `.windsurfrules`                    | старые форматы правил                        | дописываются, только если файл уже есть            |

Три корневых файла получают один и тот же блок между маркерами. Файл правила Cursor пишется, только
если папка `.cursor/` уже есть, так что при необходимости создайте её заранее. После обновления пакета запустите
`init` снова: `init --check` в CI падает, пока блок не совпадёт с установленной версией.

Полностью команда описана на странице [CLI](/ru/utilities/cli). Дальше на этой странице — что именно
она пишет и как сделать это руками.

## Пять точек входа {#the-five-entry-points}

Здесь «точка входа» — это вид документации, а не путь импорта. Одна и та же документация доходит до
агента в пяти видах:

| Что                                                                               | Где                                                                       | Для чего лучше всего                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`llms.txt`](/llms.txt)                                                           | корень сайта                                                              | краулеру, выбирающему единственную нужную страницу              |
| [`llms-full.txt`](/llms-full.txt)                                                 | корень сайта                                                              | прочитать всю документацию одним запросом                       |
| [`AGENTS.md`](https://github.com/ASDAlexey/vitest-auto-spy/blob/master/AGENTS.md) | `node_modules/vitest-auto-spy/AGENTS.md`                                  | любому агенту, **без сети** — файл едет в тарболе               |
| [Паттерны спек](/ru/recipes)                                                      | сайт документации                                                         | формы, к которым пришёл настоящий набор тестов, с частотами                |
| Скилл для Claude Code                                                             | [плагин](#claude-code-plugin) или `.claude/skills/`, который пишет `init` | Claude Code — грузится, только когда спека упоминает библиотеку |

[`llms.txt`](https://llmstxt.org) — соглашение: карта из одних ссылок в корне сайта, чтобы агент
скачивал одну страницу, а не разбирал десять. Оба файла `llms` генерируются из сайдбара этого сайта и
проверяются в CI, поэтому не расходятся с ним.

## Что доезжает до агента без всякой настройки {#what-reaches-an-agent-with-no-setup}

Две вещи доходят до агента сразу после `npm install`, без единой строки в вашем репозитории:

- **Ошибки, которые называют, чем чинить.** Каждая ошибка и каждое предупреждение заканчиваются
  строкой `Docs:` со ссылкой на страницу с разбором. Стек-трейс агент читает гораздо чаще, чем README,
  поэтому этот канал работает лучше всего. См. [примеры ниже](#errors-that-name-their-own-fix).
- **TSDoc в `dist/*.d.ts`.** Каждый экспорт описан там, куда и так смотрят редактор и «перейти к
  определению». Если документ расходится с кодом, правы типы.

Всему остальному нужна одна записанная где-то строка. Вот почему.

::: warning Скилл внутри npm-пакета сам собой не находится
`skills/vitest-auto-spy/SKILL.md` лежит внутри npm-пакета, но Claude Code его там не находит. Он
ищет скиллы только в `~/.claude/skills/`, в `.claude/skills/` проекта и в `skills/` установленного
плагина. С папками правил других инструментов то же самое: **зависимость не может попасть в
инструкции агента без настройки.** Поэтому скилл приходит одним из двух путей:

- через [плагин](#claude-code-plugin);
- через заглушку, которую `npx vitest-auto-spy init` пишет в `.claude/skills/vitest-auto-spy/SKILL.md`.
  Она копирует frontmatter скилла из пакета (он решает, когда скилл загрузится), а её тело только
  указывает на пакет, поэтому устареть не может.
:::

`AGENTS.md` тоже входит в пакет, поэтому `node_modules/vitest-auto-spy/AGENTS.md` лежит на диске, без
сети, в установленной версии. Но агенту всё равно нужно сказать, чтобы он его прочитал; эту строку и
пишет `init`.

Справочник описывает каждый экспорт, опцию и ошибку, поэтому он разбит на два уровня:

- `AGENTS.md` — карта примерно на 30 kB: меньше бюджета Codex в 32 KB, и её можно прочитать целиком.
  В ней точки входа, основной рецепт, `Spy<T>` против `T`, сброс и `fakeAsync`, а для каждого
  остального раздела — заглушка с подсказкой, когда его открывать.
- `node_modules/vitest-auto-spy/agent-docs/` — остальное, по файлу на раздел с теми же номерами:
  фабрики, конфигурация, хелперы по типу возврата, setup-файл, Angular, ESLint-плагин, Error → fix
  (таблица, в которой ищут по тексту ошибки), чек-лист перед отчётом об успехе и другое.

Скилл из пакета и заглушка от `init` сначала отправляют агента к карте.

## Наведите агента один раз {#point-your-agent-at-it-once}

Добавьте это в файл инструкций, который читает ваш агент:

- корневой `AGENTS.md` — для Codex, Cursor, Copilot и большинства других инструментов;
- `CLAUDE.md` — для Claude Code и для GLM или Kimi внутри него;
- `GEMINI.md` — для Gemini CLI.

```md
When writing or fixing tests that use `vitest-auto-spy`, first read
`node_modules/vitest-auto-spy/AGENTS.md` whole — a short map — then only the topic files in
`agent-docs/` it names for the task.
```

Этот файл лежит на диске в каждом проекте, где установлен пакет. Агенту не нужна сеть, и он читает
ту версию, которая у вас действительно стоит.

## Какой файл читает ваш агент {#which-file-your-agent-reads}

Фрагмент одинаков для всех инструментов, меняется только имя файла. **Три корневых файла покрывают
все инструменты.** `init` пишет свой блок во все три. Руками держите текст в `AGENTS.md`, а
`CLAUDE.md` и `GEMINI.md` пусть указывают на него.

- Большинство инструментов читают `AGENTS.md`: Codex, Cursor, Copilot, Cline, Windsurf/Cascade, Zed,
  OpenCode, Qwen, Junie, Roo и Aider.
- Claude Code читает `CLAUDE.md`, а не `AGENTS.md`.
- Gemini CLI читает `GEMINI.md`, если `context.fileName` не называет другой файл.

Напишите блок один раз и сошлитесь на него дважды. Тогда покрыты все агенты из таблицы, включая те,
которыми пользуются ваши коллеги.

| Агент                                                               | Какой файл инструкций читает                                                                                                                                                                          | Читает ли `AGENTS.md`?                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Claude Code**                                                     | `CLAUDE.md` — проектный, `.claude/CLAUDE.md` и `~/.claude/CLAUDE.md`, все склеиваются                                                                                                                 | **Нет.** Свяжите строкой импорта `@AGENTS.md` или симлинком                     |
| **OpenAI Codex** — CLI `codex`, расширение для IDE, облачный Codex  | `AGENTS.md`, по одному на директорию от корня git вниз до cwd ([ниже](#openai-codex))                                                                                                                 | нативно                                                                         |
| **GLM (тарифный план z.ai)**, **Kimi K3**                           | то, что читает их клиент — внутри Claude Code это `CLAUDE.md` ([ниже](#glm-z-ai-kimi-k3-and-other-claude-compatible-models))                                                                          | через клиент                                                                    |
| **Cursor**                                                          | корневой `AGENTS.md`; `.cursor/rules/*.mdc` для правил с glob-областью                                                                                                                                | нативно — и корневой `CLAUDE.md` он применяет тем же всегда-включённым способом |
| **GitHub Copilot**                                                  | корневой `AGENTS.md`; `.github/copilot-instructions.md`                                                                                                                                               | нативно, включая coding agent                                                   |
| **OpenCode**                                                        | `AGENTS.md`, затем `CLAUDE.md`, по директориям вверх                                                                                                                                                  | нативно                                                                         |
| **Cline**                                                           | корневой `AGENTS.md`; директория `.clinerules/`                                                                                                                                                       | нативно                                                                         |
| **Windsurf / Cascade**                                              | корневой `AGENTS.md`; `.windsurf/rules/*.md` (`.devin/rules/*.md`, если она есть)                                                                                                                     | да                                                                              |
| **Zed**                                                             | **побеждает первое совпадение, без слияния**: `.rules` → `.cursorrules` → `.windsurfrules` → `.clinerules` → `.github/copilot-instructions.md` → `AGENT.md` → `AGENTS.md` → `CLAUDE.md` → `GEMINI.md` | да — но только если ничего более раннего в этом списке нет                      |
| **Gemini CLI**                                                      | `GEMINI.md` ([ниже](#gemini-cli))                                                                                                                                                                     | **по умолчанию нет**                                                            |
| **Qwen Code**                                                       | `QWEN.md`                                                                                                                                                                                             | нативный фолбэк                                                                 |
| **Roo Code**                                                        | корневой `AGENTS.md`; `.roo/rules/`                                                                                                                                                                   | да                                                                              |
| **Junie**                                                           | корневой `AGENTS.md` — учтите, что `.junie/AGENTS.md` заменяет его целиком                                                                                                                            | да                                                                              |
| **Aider**                                                           | ничего неявно — перечислите файл: `read: [AGENTS.md]` в `.aider.conf.yml`                                                                                                                             | по запросу                                                                      |
| **Jules, Factory, goose, Amp, Warp, Devin, Kilo, Augment, VS Code** | корневой `AGENTS.md`                                                                                                                                                                                  | нативно                                                                         |

::: warning Никогда не заводите legacy-файл правил только ради этого фрагмента
Zed читает `.rules` → `.cursorrules` → `.windsurfrules` → `.clinerules` → …, и **побеждает первое
совпадение, без слияния**. Новый legacy-файл молча перекроет `AGENTS.md`, на который опирается весь
проект. Дописывайте в такой файл, только если он уже есть.
:::

## Как поставить это своему агенту {#install-it-in-your-agent}

`npx vitest-auto-spy init` пишет всё это сам. Руками хватит трёх файлов в корне репозитория, чтобы
покрыть все инструменты из таблицы выше:

```bash
# 1 — AGENTS.md: источник. Codex, Cursor, Copilot, Cline, Windsurf, Zed, OpenCode, Qwen, Roo, Junie, Aider…
cat >> AGENTS.md <<'MD'

## Tests that use `vitest-auto-spy`

When writing or fixing tests that use `vitest-auto-spy`, first read
`node_modules/vitest-auto-spy/AGENTS.md` whole — a short map — then only the topic files in
`agent-docs/` it names for the task.
MD

# 2 — CLAUDE.md: Claude Code и GLM / Kimi внутри него. Одна строка, вторую копию поддерживать не надо
printf '\n@AGENTS.md\n' >> CLAUDE.md

# 3 — GEMINI.md: Gemini CLI, который по умолчанию не читает AGENTS.md
printf '\nRead `AGENTS.md` in this directory — it is the single source.\n' >> GEMINI.md
```

`@AGENTS.md` — синтаксис импорта Claude Code, так что инструкции живут в одном файле. Симлинк
(`ln -s AGENTS.md CLAUDE.md`) тоже подойдёт, если второй файл не нужен. В Gemini CLI импорта нет:
`GEMINI.md` содержит фразу-указатель выше, или вы правите `.gemini/settings.json` [ниже](#gemini-cli).
В любом случае держите текст в одном месте: две копии справочника по API расходятся за один релиз.

Дальше — по инструментам. Всё в колонке «Установка» необязательно и добавляется поверх трёх
корневых файлов:

| Агент                                       | Установка                                                                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code**                             | `/plugin marketplace add ASDAlexey/vitest-auto-spy`, затем `/plugin install vitest-auto-spy@vitest-auto-spy` — [скилл](#claude-code-plugin), файлы проекта не трогаются |
| **OpenAI Codex**                            | больше ничего; по желанию `~/.codex/config.toml` [отсюда](#openai-codex)                                                                                                |
| **GLM (z.ai)**, **Kimi K3**                 | как у Claude Code — тот же клиент, та же команда плагина                                                                                                                |
| **Cursor**                                  | `.cursor/rules/vitest-auto-spy.mdc`, чтобы грузить его только для файлов спек (см. ниже)                                                                                |
| **GitHub Copilot**                          | `.github/instructions/vitest-auto-spy.instructions.md` (см. ниже)                                                                                                       |
| **Cline**                                   | `.clinerules/vitest-auto-spy.md` — те же три строки плюс `paths: ["**/*.spec.ts", "**/*.test.ts"]`                                                                       |
| **Windsurf / Cascade**                      | `.windsurf/rules/vitest-auto-spy.md` с `trigger: glob` (см. ниже)                                                                                                       |
| **Roo Code**                                | `.roo/rules/vitest-auto-spy.md` — всегда включён, так что ограничьтесь указателем в три строки                                                                          |
| **Gemini CLI**                              | `GEMINI.md` или правка `.gemini/settings.json` [отсюда](#gemini-cli)                                                                                                    |
| **Aider**                                   | `.aider.conf.yml`: `read: [AGENTS.md]`                                                                                                                                  |
| **Zed, OpenCode, Qwen Code, Junie, Jules…** | ничего — корневой `AGENTS.md` и есть вся установка                                                                                                                      |

Три инструмента умеют подключать правило только для файлов спек. Тело у всех одно и то же,
отличается только frontmatter:

<!-- prettier-ignore-start -->

**`.cursor/rules/vitest-auto-spy.mdc`**

```md
---
description: How to write tests with vitest-auto-spy
globs: **/*.spec.ts, **/*.spec.tsx, **/*.test.ts, **/*.test.tsx
alwaysApply: false
---

Read `node_modules/vitest-auto-spy/AGENTS.md` before writing or fixing a spec that uses
`vitest-auto-spy` — the API, the configuration semantics and the common mistakes.
```

**`.github/instructions/vitest-auto-spy.instructions.md`**

```md
---
applyTo: '**/*.spec.ts,**/*.spec.tsx,**/*.test.ts,**/*.test.tsx'
---

Read `node_modules/vitest-auto-spy/AGENTS.md` before writing or fixing a spec that uses
`vitest-auto-spy` — the API, the configuration semantics and the common mistakes.
```

**`.windsurf/rules/vitest-auto-spy.md`** (или `.devin/rules/vitest-auto-spy.md`, если есть эта папка)

```md
---
trigger: glob
globs: **/*.spec.ts, **/*.spec.tsx, **/*.test.ts, **/*.test.tsx
---

Read `node_modules/vitest-auto-spy/AGENTS.md` before writing or fixing a spec that uses
`vitest-auto-spy` — the API, the configuration semantics and the common mistakes.
```

<!-- prettier-ignore-end -->

`globs` у Cursor — **строка через запятую, а не YAML-массив**. Файл правила Windsurf ограничен 12 000
символов. Поэтому правило указывает на справочник, а не копирует его.

## OpenAI Codex {#openai-codex}

Codex (CLI `codex`, расширение для IDE и облачный Codex) читает `AGENTS.md`, так что корневого
`AGENTS.md` достаточно. Дойдёт ли он до модели, решают две детали:

- **Codex читает по одному файлу на папку, от корня git до текущей папки**, и склеивает их.
  `AGENTS.override.md` важнее `AGENTS.md`. Если в монорепозитории пакет использует другой раннер,
  положите блок и в `AGENTS.md` этого пакета. Только так можно сказать агенту «здесь `bun test`, а по
  соседству Vitest», а от этого зависит, [какую точку
  входа](#point-it-at-the-subpath-not-only-at-the-package) он импортирует.
- **Вся цепочка ограничена** параметром `project_doc_max_bytes`, **по умолчанию 32 768 байт**. Всё,
  что сверх лимита, обрезается с предупреждением. Если ваш `AGENTS.md` уже длинный, поставьте
  указатель ближе к началу.

Если инструкции репозитория лежат в `CLAUDE.md`, скажите Codex читать его, когда `AGENTS.md` нет. Это
глобальный конфиг на вашей машине, коммитить нечего:

```toml
# ~/.codex/config.toml
project_doc_fallback_filenames = ["CLAUDE.md"]   # по директориям, где нет AGENTS.md
project_doc_max_bytes = 65536                    # поднять бюджет в 32 КБ для цепочки монорепозитория
```

Облачный Codex читает тот же корневой `AGENTS.md` и **по умолчанию не имеет доступа в интернет**.
Поэтому справочник входит в пакет, а не живёт только на этом сайте: после установки зависимостей
`node_modules/vitest-auto-spy/AGENTS.md` уже на диске.

## GLM (z.ai), Kimi K3 и другие Claude-совместимые модели {#glm-z-ai-kimi-k3-and-other-claude-compatible-models}

GLM — это **модель**, а не агент. Какие файлы она читает, решает клиент, в котором вы её запускаете.

Тариф z.ai для программирования запускает GLM **внутри Claude Code**: `ANTHROPIC_BASE_URL` (вместе с
`ANTHROPIC_AUTH_TOKEN`) указывает на Anthropic-совместимый адрес z.ai. Поиск файлов от этого не
меняется: `CLAUDE.md`, `.claude/skills/` и [плагин](#claude-code-plugin) работают так же, как на
Claude, потому что клиент тот же. То же верно для Kimi K3 внутри Claude Code. Там скилл и плагин
лучше вставленного фрагмента: они загружаются, только когда спека упоминает библиотеку.

В другом клиенте решает он. OpenCode, Cline, Roo Code и Kilo Code читают корневой `AGENTS.md`.
`kimi-cli` от Moonshot читает свою цепочку `AGENTS.md`, включая `.kimi/AGENTS.md`.

## Gemini CLI {#gemini-cli}

Gemini CLI читает `GEMINI.md` и **не** читает `AGENTS.md` по умолчанию. Либо вставьте фрагмент в
`GEMINI.md`, либо один раз назовите оба файла:

```json
// .gemini/settings.json
{ "context": { "fileName": ["GEMINI.md", "AGENTS.md"] } }
```

Qwen Code сделан на основе Gemini CLI и принимает ту же настройку `context.fileName`, но `AGENTS.md`
читает и без неё.

## Плагин для Claude Code {#claude-code-plugin}

Репозиторий также служит маркетплейсом плагинов Claude Code. Этому пути не нужны файлы в вашем
проекте. Это один из двух способов, которыми Claude Code находит скилл; второй — заглушка в
`.claude/skills/` от `init`. [Копию внутри пакета он не находит](#what-reaches-an-agent-with-no-setup).

```
/plugin marketplace add ASDAlexey/vitest-auto-spy
/plugin install vitest-auto-spy@vitest-auto-spy
```

В описании скилла перечислены экспорты библиотеки и четыре самых частых сообщения об ошибках, поэтому
он загружается только для задач про этот пакет. Его тело — короткое дерево решений и таблица «берите
это, а не пишите руками», где ключ — _симптом_: текст ошибки или падающий код. Именно это есть у
агента на старте.

## Наводите на подпуть, а не только на пакет {#point-it-at-the-subpath-not-only-at-the-package}

Каждый путь импорта подключает библиотеку к своему раннеру или фреймворку, а некоторые, например
`/rxjs` и `/zone`, намеренно подключаются вручную. `init` вписывает в свой блок нужный для вашего
проекта. Агент, который знает только `vitest-auto-spy`, напишет спеку, которая упадёт на
первом же хелпере:

| Подпуть                                      | Нужен для                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `vitest-auto-spy/rxjs`                       | `nextWith`, `observablePropsToSpyOn`, `throwWith` — импортируется один раз, в setup                        |
| `vitest-auto-spy/bun`                        | любой спеки, которую гоняет `bun test` (`/bun-angular` — для тамошнего `TestBed` Angular)                  |
| `vitest-auto-spy/node`                       | тесты на `node --test`, ESM или CJS                                                                        |
| `vitest-auto-spy/rstest`                     | любой спеки, которую гоняет [Rstest](/ru/runtimes/rstest), — `npx rstest run`                              |
| `vitest-auto-spy/angular`                    | `provideAutoSpy`, `injectSpy`, `renderShallow`, хелперов переопределения                                   |
| `vitest-auto-spy/setup`                      | `setupAutoSpy` (со `strayConsole` и `preset: 'strict'`), хелперов часов, `installPerTest`, матчеров фокуса |
| [`vitest-auto-spy/zone`](/ru/utilities/zone) | `fakeAsync` / `waitForAsync` на Vitest — zone.js не попадает ни в одну другую точку входа                  |

## Ошибки, которые называют, чем чинить {#errors-that-name-their-own-fix}

Стек-трейс агент читает гораздо чаще, чем README. Поэтому каждая ошибка и каждое предупреждение
этого пакета говорят, что пошло не так, называют исправление и заканчиваются ссылкой на разбор:

```
[vitest-auto-spy] Observable spies require rxjs, and 'vitest-auto-spy/rxjs' was not imported in this run. Add `import 'vitest-auto-spy/rxjs';` once to the setup file.
Docs: https://asdalexey.github.io/vitest-auto-spy/runtimes/rxjs
```

То же верно для:

- отсутствующего mock-адаптера;
- метода, которого нет в классе;
- `advanceTimers()` без фейковых таймеров;
- preload-файла `bun-angular` без DOM-пакета;
- `templateUrl`, который не удаётся найти;
- нарушения `mustBeCalledWith`;
- повторной установки пакета.

Под [`setupAutoSpy({ strayConsole: 'throw' })`](/ru/utilities/setup) вывод в консоль, который не
поймал ни один спай, роняет тест. Ошибка называет метод консоли, первые выведенные строки и код,
который их вывел. Если после включения этой проверки покраснела спека, которую агент не трогал,
смотрите туда в первую очередь.

## Более дешёвый вывод прогона — `--reporter=agent` {#cheaper-run-output-—-reporter-agent}

В Vitest 4.1 есть репортер для агентов. Он печатает те же падения без списка прошедших тестов и
повторяющихся баннеров, так что агенту дешевле читать вывод и держать его в контексте.

```bash
npx vitest run --reporter=agent src/app/cart.component.spec.ts
```

Это часть Vitest, а не этого пакета, настраивать ничего не нужно. Добавьте ещё фильтр по пути: агенту
редко нужен весь прогон, обычно только файл, который он только что правил.

## В чём агенты чаще всего ошибаются {#what-agents-get-wrong-most-often}

На это приходится подавляющее большинство сломанных спек, и всё перечисленное разобрано в
`AGENTS.md`:

1. **`let s: MyService = createSpyFromClass(MyService)`.** `Spy<T>` — это mapped type, и приватные
   члены он отбрасывает. Объявляйте как `Spy<T>` или наводите мост через
   [`asInstance` / `asSpy`](/ru/core/spy-typing) — но никогда через `as unknown as T`.
2. **Попытка ограничить набор через `methodsToSpyOn`.** Он **дополняет** найденные методы, как и в
   `jest-auto-spies`. Исчерпывающий белый список — это
   [`onlyMethodsToSpyOn`](/ru/core/create-spy-from-class), и он полностью пропускает обход прототипа.
3. **Вызов `nextWith` без `import 'vitest-auto-spy/rxjs'`.** Observable-слой подключается вручную.
4. **Импорт `vitest-auto-spy` внутри файла под `bun test`.** Каждая точка входа регистрирует при
   импорте свой mock-адаптер; берите [`vitest-auto-spy/bun`](/ru/runtimes/bun).
5. **`expect()` внутри колбэка `subscribe()`.** Молчащий поток делает из этого зелёный тест, который
   ничего не проверил, — берите [`expectEmission`](/ru/core/observable-assertions), где проверка и
   есть `await`.
6. **`vi.fn().mockImplementation(() => instance)` для того, что код зовёт через `new`.** Идиома из
   Jest не переносится: Vitest пробрасывает `new` только в конструируемую реализацию, поэтому
   стрелка запишет вызов, пропустит тело и вернёт пустой объект — или бросит
   `X is not a constructor` уже изнутри продакшен-кода. Берите
   [`mockConstructor` / `stubConstructor`](/ru/utilities/constructor-doubles).
7. **Экспортируемый `const` с `vi.fn()` внутри, общий на несколько файлов спек.** При
   `isolate: false` модуль вычисляется один раз на воркер, то есть это один набор спаев на все
   файлы, которые его импортируют. Фикстура — это фабрика; файл спеки не экспортирует вообще ничего.
8. **`it('x', (done) => …)`.** Vitest передаёт `TestContext`, так что `done()` бросает внутри
   промиса, которого никто не ждёт, а тест **проходит**, выполнив едва ли не пустое тело. Ловит это
   правило линтера `no-done-callback`; чинится через `await`.
9. **`await Promise.resolve()`, чтобы дождаться динамического `import()` под фейковыми таймерами.**
   Так время не двигается ни на такт, а `setTimeout` — фейковый; берите
   [`settleDynamicImport` / `flushEventLoop`](/ru/utilities/event-loop).
10. **Уверенность, что хуки из setup-файла доедут до каждого файла спек.** Они принадлежат тому
    файлу, чья сборка импортировала модуль, и раннер, который держит этот модуль в кеше между
    файлами — в дикой природе это `@angular/build:unit-test` до 22.2.0 под `--coverage`, — отдаёт их
    первому файлу каждого воркера и больше никому. Никто об этом не сообщает; симптом — утёкший
    глобал или настоящие таймеры в спеке, которая сама по себе проходит. `@angular/build` 22.2.0 это
    исправляет; на более старом билдере гоняйте покрытие с `--isolate` или вызывайте
    [`setupAutoSpy()`](/ru/utilities/setup) из чего-то, что вычисляется на каждый файл. В любом случае
    держите вызов на верхнем уровне самого setup-файла, а не в модуле, который он импортирует.
11. **`vi.spyOn(console, 'error')`, чтобы спека молчала.** Без реализации он вызывает оригинал, так
    что строка всё равно печатается — а под `strayConsole` тест на ней падает. Ставьте тихие спаи
    через `installConsoleSpies()` из [`vitest-auto-spy/console`](/ru/utilities/console) в
    `beforeEach` и проверяйте `consoleErrorSpy`; голую форму ловит правило `no-passthrough-console-spy`.

12. **Советы, перенесённые из туториалов и шпаргалок времён Jest**, — каждый пункт ниже неверен под
    Vitest, проверено на Vitest 5.0.0:
    - **Фабрика `vi.mock`, читающая переменную, объявленную выше.** `vi.mock` поднимается над
      импортами, поэтому фабрика выполняется раньше, чем появляется `const`, и файл падает с
      `[vitest] There was an error when mocking a module…`, причина —
      `ReferenceError: Cannot access 'load' before initialization`. Исключения Jest для имён,
      начинающихся с `mock`, здесь нет — `mockLoad` падает так же. Объявляйте то, что нужно
      фабрике, через `const mocks = vi.hoisted(() => ({ load: vi.fn() }))`.
    - **`vi.requireActual` / `jest.requireActual`, чтобы сохранить остальной модуль.** Ни того ни
      другого нет; фабрика получает `importOriginal`:
      `vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), load: vi.fn() }))`.
      `vi.importActual` — асинхронная отдельная форма.
    - **`import { jest } from 'vitest'`.** `vitest` не экспортирует `jest`; пространство имён — `vi`.
    - **`import { userEvent } from '@testing-library/user-event'`.** Именованный экспорт есть
      только с 14.5.0; экспорт по умолчанию работает на любой 14.x. API 14.x асинхронный:
      `const user = userEvent.setup(); await user.click(button)`.
    - **`vi.restoreAllMocks()`, чтобы отменить `vi.useFakeTimers()`.** Восстановление, сброс и
      очистка моков оставляют фейковые часы на месте; настоящие возвращает `vi.useRealTimers()` в
      `afterEach`.
    - **`globalThis.fetch = vi.fn()`.** Ни `vi.restoreAllMocks()`, ни `vi.unstubAllGlobals()` не
      достают до голого присваивания, так что фейк отвечает каждому следующему тесту файла.
      Используйте `vi.stubGlobal('fetch', …)` с `unstubGlobals: true` или
      `mockValueProp(globalThis, 'fetch', …)`, который восстанавливает
      [`setupAutoSpy()`](/ru/utilities/setup); `blockNetwork()` — для спеки, которой нужно лишь не
      ходить в сеть, и [`stubResponse({ body })`](/ru/utilities/setup#answering-a-stubbed-fetch-—-stubresponse)
      — для самого `Response`. Голую форму ловит правило
      [`no-hand-assigned-global`](/ru/utilities/eslint-rules#no-hand-assigned-global), а
      [`prefer-stub-response`](/ru/utilities/eslint-rules#prefer-stub-response) — тот
      `{ ok: true, json } as Response`, который из неё возвращают.
    - **`await import('./thing')`, чтобы дождаться модуля, который лениво грузит код под тестом.**
      Оно дожидается модуля, а не продолжения обработчика, который его грузил, поэтому ассерт
      выполняется на такт раньше. Нужен
      [`settleDynamicImport(() => import('./thing'))`](/ru/utilities/event-loop#settledynamicimport-load-turns),
      который добавляет тот самый `flushEventLoop(1)`; голую форму ловит
      [`prefer-settle-dynamic-import`](/ru/utilities/eslint-rules#prefer-settle-dynamic-import).
    - **Тест, каждое утверждение которого выполнено тем, что поток промолчал.** `let`, который пишет
      только колбэк `subscribe`, проверенный через `toEqual([])` против собственного инициализатора
      или через `toBeUndefined` / `not.toHaveBeenCalled`, не отличает пустой результат от отсутствия
      результата. Скажите, что имеете в виду:
      [`expectNoEmission(source$)`](/ru/core/observable-assertions) — про молчание,
      `expect(await expectEmission(source$))` — про значение; написанную руками форму ловит правило
      [`no-vacuous-absence-assertion`](/ru/utilities/eslint-rules#no-vacuous-absence-assertion).
    - **`{ id: '1', isOffline: false } as SomeType` для фикстуры.** Каст спрашивает, пересекаются ли
      два типа, а не является ли значение одним из них: проверка лишних свойств не выполняется, так
      что проходит и ключ, которого тип не объявляет, и обязательное поле, которого в фикстуре нет.
      Оба тайп-гейта молчат, а фикстура потом пинит ключ, которого в контракте нет. Нужен
      `createMock<SomeType>({ … })` — он принимает `DeepPartial<SomeType>` и отвечает `SomeType`, —
      либо просто удалить каст там, где литерал и так стоит в типизированном слоте; сообщает
      [`prefer-create-mock`](/ru/utilities/eslint-rules#prefer-create-mock).
    - **`(TestBed.inject(S).m as Mock).mockReturnValue(…)`.** `Mock` без параметров — это
      `Mock<any>`, поэтому каст не добавляет методы спая, а убирает сигнатуру:
      `toHaveBeenCalledWith` перестаёт сравнивать аргументы. Член и так спай — читайте его как
      `injectSpy(S).m`; каст ловит [`no-mock-cast`](/ru/utilities/eslint-rules#no-mock-cast).
    - **`Reflect.get(component, 'privateField')`, чтобы прочитать мимо модификатора.** Ключ здесь —
      обычный строковый аргумент, и его не проверяет никто: ни компилятор, ни шаблонный гейт, ни
      строгий проход `tsc`. А `Reflect.set` вешает **собственное** свойство поверх прототипа, так что
      после переименования в продакшене спека пишет мёртвое свойство, а ассерты под ней проходят
      вечно. Ведите член через публичный API и проверяйте эффект — на компоненте это отрендеренный
      шаблон; `mockValueProp` — запись, которая регистрирует свой откат, если значение всё-таки
      нужно задать спаю. Ловит
      [`no-reflect-member-access`](/ru/utilities/eslint-rules#no-reflect-member-access), а `window` и
      `globalThis` оставляет в покое — ради них идиома и существует.
    - **Тест, который сам вызывает заспаенный метод, а потом утверждает, что его вызвали.**
      `vi.spyOn(component.output, 'emit')`, затем `component.output.emit(payload)`, затем
      `expect(spy).toHaveBeenCalledWith(payload)` доказывает, что `emit` вызывает `emit`: удалите
      привязку в шаблоне, которую называет заголовок, — тест останется зелёным. Запускайте настоящий
      триггер; выдающий себя порядок ловит
      [`no-self-called-spy`](/ru/utilities/eslint-rules#no-self-called-spy).
    - **Сброс моков в хуке, который раннер и так делает.** При включённых `clearMocks`, `mockReset`
      или `restoreMocks` Vitest сбрасывает их перед каждым тестом — до цепочки `beforeEach` и после
      предыдущего `afterEach`, — так что тот же вызов в хуке делает работу дважды, а читается как
      строка, на которой держится честность тестов. Её надо удалить;
      [`no-redundant-mock-reset`](/ru/utilities/eslint-rules#no-redundant-mock-reset) сообщает про
      неё, когда ему сказали, какие флаги включены, и не трогает сброс внутри теста: там он
      разделяет две подготовки внутри одного теста.
    - **`expect(spy).toHaveBeenCalled()` там, где тест как раз про аргументы.** Голый матчер
      проходит на любых аргументах, поэтому тест с заголовком «…with the host element», который
      больше ничего не утверждает, зелёный и когда передали не тот узел. Назовите их —
      `toHaveBeenCalledWith(…)` или [`mustBeCalledWith(…)`](/ru/core/control-helpers) там, где
      настраивается спай; [`no-unasserted-argument`](/ru/utilities/eslint-rules#no-unasserted-argument)
      сообщает про две формы, в которых сам файл говорит, что аргументы значимы.
