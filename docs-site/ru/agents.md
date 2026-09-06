---
title: Для ИИ-агентов
description: llms.txt, llms-full.txt, вложенный AGENTS.md и скилл для Claude Code — как навести Claude Code, Codex, Cursor или любого другого агента на эту библиотеку.
---

# Для ИИ-агентов

Большинство тестов сейчас пишется с ассистентом в контуре. Документация, из которой API приходится
_выводить_, стоит токенов на каждой задаче и раз за разом порождает одну и ту же горстку ошибок,
поэтому пакет везёт с собой вторую, сжатую форму своей документации, написанную для машинного
читателя: дерево решений, семантику настроек, таблицу «ошибка → починка» и антипаттерны.

## Пять точек входа {#the-five-entry-points}

| Что                                                                               | Где                                                                       | Для чего лучше всего                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`llms.txt`](/llms.txt)                                                        | корень сайта                                                              | краулеру, выбирающему единственную нужную страницу              |
| [`llms-full.txt`](/llms-full.txt)                                              | корень сайта                                                              | прочитать всю документацию одним запросом                       |
| [`AGENTS.md`](https://github.com/ASDAlexey/vitest-auto-spy/blob/master/AGENTS.md) | `node_modules/vitest-auto-spy/AGENTS.md`                                  | любому агенту, **без сети** — файл едет в тарболе               |
| [Паттерны спек](/ru/recipes)                                                      | сайт документации                                                         | формы, к которым пришла живая сюита, с частотами                |
| Скилл для Claude Code                                                             | [плагин](#claude-code-plugin) или `.claude/skills/`, который пишет `init` | Claude Code — грузится, только когда спека упоминает библиотеку |

[`llms.txt`](https://llmstxt.org) — соглашение, которое краулер, работающий на LLM, ищет в корне
сайта документации: карта из одних ссылок, чтобы агент забирал одну страницу вместо того, чтобы
скрести отрендеренный HTML десяти. Оба файла генерируются из сайдбара этого сайта и проверяются в CI,
так что разъехаться они не могут.

## Что доезжает до агента без всякой настройки {#what-reaches-an-agent-with-no-setup}

Два канала доходят до агента ровно в тот момент, когда `npm install` закончился, и без единой строки,
записанной в ваш репозиторий:

- **Ошибки, которые называют, чем чинить.** Каждое исключение и каждое предупреждение этого пакета
  заканчивается строкой `Docs:` со ссылкой на страницу, где это разобрано. Стек-трейс агент читает
  куда чаще, чем README, так что именно этот канал реально срабатывает —
  [примеры ниже](#errors-that-name-their-own-fix).
- **TSDoc в `dist/*.d.ts`.** Каждый экспорт задокументирован там, куда и так смотрят редактор,
  языковой сервер и агентское «перейти к определению», а типы — высшая инстанция везде, где любой
  документ расходится с кодом.

Всему остальному нужна одна строка, куда-нибудь записанная, и стоит честно сказать почему.

::: warning Скилл, приехавший в тарболе, сам собой не находится
`skills/vitest-auto-spy/SKILL.md` едет внутри npm-пакета, и Claude Code никогда не найдёт его там:
`node_modules/**/skills/` не входит в список мест, где он ищет скиллы (это `~/.claude/skills/`,
собственная `.claude/skills/` проекта и `skills/` установленного плагина). Никакой трюк с упаковкой
этого не меняет, и то же верно для директории правил любого другого инструмента — **у зависимости
нет пути в контекст инструкций агента без настройки.** Так что скилл приезжает одним из двух
способов: через [плагин](#claude-code-plugin) или через заглушку, которую `npx vitest-auto-spy init`
пишет в `.claude/skills/vitest-auto-spy/SKILL.md` — frontmatter поставляемого скилла (та часть,
которая решает, грузиться ли ему) поверх тела, которое лишь указывает на тарбол, так что копия
устареть не может.
:::

`AGENTS.md` — самый дешёвый из остального: он тоже едет в тарболе, так что
`node_modules/vitest-auto-spy/AGENTS.md` лежит на диске без всякой сети и той версии, которая
действительно установлена. Но что-то всё равно должно сказать агенту его прочитать. Ровно эту строку
и пишет `init`.

## Более дешёвый вывод прогона — `--reporter=agent` {#cheaper-run-output-—-reporter-agent}

В Vitest 4.1 приехал репортер, написанный ровно для этого: те же падения, но без переклички
прошедших тестов и повторяющихся баннеров, из-за которых вывод прогона дорого читать и дорого нести в
контексте.

```bash
npx vitest run --reporter=agent src/app/cart.component.spec.ts
```

Он собственный витестовский, а не этого пакета, — настраивать здесь ничего не нужно. Сочетайте его с
фильтром по пути: агенту почти никогда не нужна вся сюита, а на его вопрос отвечает тот файл, который
он только что правил.

## Одна команда {#one-command}

```bash
npx vitest-auto-spy init
```

Она записывает указатель, приведённый ниже, в те файлы, которые агенты _этого_ репозитория реально
читают, и специализирует его: какой подпуть соответствует вашему раннеру, какой адаптер —
фреймворку, каков настоящий путь до setup-файла, куда нужен `import 'vitest-auto-spy/rxjs'`, — а
если rxjs не установлен, строку про него она вовсе опускает. Всё записанное лежит между маркерами и
перегенерируется на следующем запуске, так что обновление — это диф в один хунк, а `init --uninstall`
возвращает файл как было.

`npx vitest-auto-spy init --check` — форма для CI: команда падает, когда блок на диске не совпадает
с тем, что записала бы установленная версия. Полностью команда описана на странице
[CLI](/ru/utilities/cli); остаток этой страницы — про то, что именно она пишет и как сделать это
руками.

## Наведите агента один раз {#point-your-agent-at-it-once}

Одна строка с наибольшим рычагом — в том файле инструкций, который ваш агент действительно читает:
корневой `AGENTS.md` для Codex, Cursor, Copilot и большей части поля, `CLAUDE.md` для Claude Code и
для GLM или Kimi, запущенных внутри него, `GEMINI.md` для Gemini CLI:

```md
When writing or fixing tests that use `vitest-auto-spy`, first read
`node_modules/vitest-auto-spy/AGENTS.md`. It is the authoritative reference for the API,
the configuration semantics and the common mistakes.
```

Этот файл уже лежит на диске в каждом проекте, который поставил пакет, так что агент не платит за
поход в сеть и получает ту версию, которая у него действительно установлена, а не то, что вернул веб.

## Какой файл читает ваш агент {#which-file-your-agent-reads}

Фрагмент выше одинаков для всех инструментов, меняется только имя файла. **Три корневых файла
покрывают всё поле, и содержимое есть лишь в одном из них: `AGENTS.md` — источник, `CLAUDE.md` и
`GEMINI.md` — указатели на него.** `AGENTS.md` выиграл войну форматов: его читают Codex, Cursor,
Copilot, Cline, Windsurf/Cascade, Zed, OpenCode, Qwen, Junie, Roo и Aider. Двое несогласных стоят
каждый на своём имени: Claude Code читает `CLAUDE.md` и не читает `AGENTS.md`, а Gemini CLI читает
`GEMINI.md`, если только `context.fileName` не назовёт второй файл. Напишите блок один раз, укажите
на него дважды — и обслужены все агенты из этой таблицы, включая те, которыми пользуются ваши коллеги,
а вы нет.

| Агент                                                               | Какой файл инструкций читает                                                                                                                                                                          | Читает ли `AGENTS.md`?                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Claude Code**                                                     | `CLAUDE.md` — проектный, `.claude/CLAUDE.md` и `~/.claude/CLAUDE.md`, все склеиваются                                                                                                                 | **Нет.** Свяжите строкой импорта `@AGENTS.md` или симлинком                     |
| **OpenAI Codex** — CLI `codex`, расширение для IDE, облачный Codex  | `AGENTS.md`, по одному на директорию от корня git вниз до cwd ([ниже](#openai-codex))                                                                                                                 | нативно                                                                         |
| **GLM (тарифный план z.ai)**, **Kimi K2**                           | то, что читает их клиент — внутри Claude Code это `CLAUDE.md` ([ниже](#glm-z-ai-kimi-k2-and-other-claude-compatible-models))                                                                          | через клиент                                                                    |
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
Zed разрешает `.rules` → `.cursorrules` → `.windsurfrules` → `.clinerules` → … **по первому
совпадению и без слияния**, так что только что созданный legacy-файл молча перекроет `AGENTS.md`, на
котором держится весь остальной проект. Дописывайте в такой файл, только если он уже существует.
:::

## Как поставить это своему агенту {#install-it-in-your-agent}

`npx vitest-auto-spy init` пишет всё это сам. Руками достаточно трёх файлов в корне репозитория,
чтобы покрыть все инструменты из той таблицы:

```bash
# 1 — AGENTS.md: источник. Codex, Cursor, Copilot, Cline, Windsurf, Zed, OpenCode, Qwen, Roo, Junie, Aider…
cat >> AGENTS.md <<'MD'

## Tests that use `vitest-auto-spy`

When writing or fixing tests that use `vitest-auto-spy`, first read
`node_modules/vitest-auto-spy/AGENTS.md`. It is the authoritative reference for the API,
the configuration semantics and the common mistakes.
MD

# 2 — CLAUDE.md: Claude Code и GLM / Kimi внутри него. Одна строка, вторую копию поддерживать не надо
printf '\n@AGENTS.md\n' >> CLAUDE.md

# 3 — GEMINI.md: Gemini CLI, который по умолчанию не читает AGENTS.md
printf '\nRead `AGENTS.md` in this directory — it is the single source.\n' >> GEMINI.md
```

`@AGENTS.md` — собственный синтаксис импорта Claude Code, так что инструкции живут ровно в одном
файле. Симлинк (`ln -s AGENTS.md CLAUDE.md`) делает то же самое, если второй файл вам не нужен вовсе.
У Gemini CLI синтаксиса импорта нет, поэтому `GEMINI.md` либо несёт указывающую фразу выше, либо
заменяется правкой `.gemini/settings.json` [ниже](#gemini-cli). Какую бы форму вы ни выбрали,
держите содержимое в одном месте: две копии справочника по API расходятся в пределах одного релиза.

Дальше — по инструментам; всё, что в правой колонке, необязательно и идёт поверх этих двух файлов:

| Агент                                       | Установка                                                                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code**                             | `/plugin marketplace add ASDAlexey/vitest-auto-spy`, затем `/plugin install vitest-auto-spy@vitest-auto-spy` — [скилл](#claude-code-plugin), файлы проекта не трогаются |
| **OpenAI Codex**                            | больше ничего; по желанию `~/.codex/config.toml` [отсюда](#openai-codex)                                                                                                |
| **GLM (z.ai)**, **Kimi K2**                 | как у Claude Code — тот же клиент, та же команда плагина                                                                                                                |
| **Cursor**                                  | `.cursor/rules/vitest-auto-spy.mdc`, чтобы грузить его только для файлов спек (см. ниже)                                                                                |
| **GitHub Copilot**                          | `.github/instructions/vitest-auto-spy.instructions.md` (см. ниже)                                                                                                       |
| **Cline**                                   | `.clinerules/vitest-auto-spy.md` — те же три строки плюс `paths: ["**/*.spec.ts","**/*.test.ts"]`                                                                       |
| **Windsurf / Cascade**                      | `.windsurf/rules/vitest-auto-spy.md` с `trigger: glob` (см. ниже)                                                                                                       |
| **Roo Code**                                | `.roo/rules/vitest-auto-spy.md` — всегда включён, так что ограничьтесь указателем в три строки                                                                          |
| **Gemini CLI**                              | `GEMINI.md` или правка `.gemini/settings.json` [отсюда](#gemini-cli)                                                                                                    |
| **Aider**                                   | `.aider.conf.yml`: `read: [AGENTS.md]`                                                                                                                                  |
| **Zed, OpenCode, Qwen Code, Junie, Jules…** | ничего — корневой `AGENTS.md` и есть вся установка                                                                                                                      |

Варианты с glob-областью — для трёх инструментов, чей формат не является чистым Markdown. Тело у всех
одно и то же, отличается только frontmatter:

```md
## <!-- .cursor/rules/vitest-auto-spy.mdc -->

description: How to write tests with vitest-auto-spy
globs: **/\*.spec.ts, **/_.spec.tsx, \*\*/_.test.ts, \*_/_.test.tsx
alwaysApply: false

---

Read `node_modules/vitest-auto-spy/AGENTS.md` before writing or fixing a spec that uses
`vitest-auto-spy` — the API, the configuration semantics and the common mistakes.
```

```md
## <!-- .github/instructions/vitest-auto-spy.instructions.md -->

## applyTo: '**/\*.spec.ts,**/_.spec.tsx,\*\*/_.test.ts,\*_/_.test.tsx'

Read `node_modules/vitest-auto-spy/AGENTS.md` before writing or fixing a spec that uses
`vitest-auto-spy`.
```

```md
## <!-- .windsurf/rules/vitest-auto-spy.md — .devin/rules/ when that directory exists -->

trigger: glob
globs: **/\*.spec.ts, **/\*.test.ts

---

Read `node_modules/vitest-auto-spy/AGENTS.md` before writing or fixing a spec that uses
`vitest-auto-spy`.
```

`globs` у Cursor — это **строка через запятую, а не YAML-массив**, а файл правила Windsurf ограничен
12 000 символами; и то и другое — причины, по которым правило указывает на справочник, а не копирует
его.

## OpenAI Codex {#openai-codex}

Codex — CLI `codex`, расширение для IDE и облачный Codex — читает открытое соглашение `AGENTS.md`,
так что корневой `AGENTS.md` и есть вся интеграция. Дойдёт ли это вообще до модели, решают две
детали:

- **Цепочка идёт от корня git к cwd, максимум по одному файлу на директорию** (`AGENTS.override.md`
  сильнее `AGENTS.md`) и склеивается. В монорепозитории кладите блок ещё и в собственный `AGENTS.md`
  пакета, если этот пакет гоняет другой раннер, — иначе никак не сказать «вот тут `bun test`, а по
  соседству Vitest», а именно это различие и решает, [какую точку
  входа](#point-it-at-the-subpath-not-only-at-the-package) агент импортирует.
- **Вся цепочка ограничена** параметром `project_doc_max_bytes`, **32 768 байт по умолчанию**; всё
  сверх бюджета обрезается с предупреждением. Если ваш `AGENTS.md` и так длинный, держите указатель
  ближе к его началу.

Если репозиторий держит инструкции в `CLAUDE.md`, научите Codex откатываться на него. Это глобальный
конфиг на вашей машине, коммитить нечего:

```toml
# ~/.codex/config.toml
project_doc_fallback_filenames = ["CLAUDE.md"]   # по директориям, где нет AGENTS.md
project_doc_max_bytes = 65536                    # поднять бюджет в 32 КБ для цепочки монорепозитория
```

Облачный Codex читает тот же корневой `AGENTS.md`, а его агент **по умолчанию без доступа в
интернет** — именно поэтому справочник едет внутри тарбола, а не живёт только на этом сайте.
`node_modules/vitest-auto-spy/AGENTS.md` лежит на диске с того момента, как setup-скрипт поставил
зависимости, так что скачивать ничего не нужно.

## GLM (z.ai), Kimi K2 и другие Claude-совместимые модели {#glm-z-ai-kimi-k2-and-other-claude-compatible-models}

GLM — это **модель**, а не агент; файлы читает тот клиент, в котором вы её запускаете.

Тарифный план z.ai запускает GLM **внутри Claude Code**, направляя `ANTHROPIC_BASE_URL` (вместе с
`ANTHROPIC_AUTH_TOKEN`) на Anthropic-совместимый эндпоинт z.ai. Обнаружение файлов это никак не
меняет: `CLAUDE.md`, `.claude/skills/` и [плагин](#claude-code-plugin) ниже ведут себя ровно так же,
как на Claude, потому что клиент тот же самый. С Kimi K2, запущенной через Claude Code, история та
же — и там скилл и плагин ценнее вставленного фрагмента, потому что грузятся, только когда спека
действительно упоминает библиотеку, и всё остальное время не стоят ни токена контекста.

Запустите GLM через другой клиент — и решает он: OpenCode, Cline, Roo Code и Kilo Code читают
корневой `AGENTS.md`. Собственный `kimi-cli` от Moonshot читает свою цепочку `AGENTS.md`, включая
`.kimi/AGENTS.md`.

## Gemini CLI {#gemini-cli}

Gemini CLI читает `GEMINI.md` и **не** читает `AGENTS.md` по умолчанию. Либо вставьте фрагмент в
`GEMINI.md`, либо один раз назовите оба файла:

```json
// .gemini/settings.json
{ "context": { "fileName": ["GEMINI.md", "AGENTS.md"] } }
```

Qwen Code сделан на базе Gemini CLI и принимает ту же настройку `context.fileName`, но и сам по себе
уже откатывается на `AGENTS.md`.

## Плагин для Claude Code {#claude-code-plugin}

Репозиторий заодно работает маркетплейсом плагинов Claude Code. Это тот путь, которому не нужно ни
одного файла в вашем проекте, — и, вместе с заглушкой в `.claude/skills/`, которую пишет `init`, один
из всего двух способов, какими скилл вообще находится, поскольку [копия в тарболе
не находится](#what-reaches-an-agent-with-no-setup):

```
/plugin marketplace add ASDAlexey/vitest-auto-spy
/plugin install vitest-auto-spy@vitest-auto-spy
```

В описании скилла перечислены экспорты библиотеки и четыре самых частых её сообщения об ошибках, так
что он грузится, когда задача действительно про этот пакет, и не мешается в остальное время. Его тело
— короткое дерево решений плюс таблица «возьмите это, прежде чем городить руками», ключ в которой —
_симптом_: текст ошибки или форма падения, потому что именно это у агента на руках в начале работы.

## Наводите на подпуть, а не только на пакет {#point-it-at-the-subpath-not-only-at-the-package}

Каждая точка входа при импорте регистрирует собственный mock-адаптер, и три из них включаются
намеренно вручную. Агент, который знает только голый спецификатор, напишет спеку, падающую на первом
же хелпере:

| Подпуть                                      | Нужен для                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `vitest-auto-spy/rxjs`                       | `nextWith`, `observablePropsToSpyOn`, `throwWith` — импортируется один раз, в setup       |
| `vitest-auto-spy/bun`                        | любой спеки, которую гоняет `bun test` (`/bun-angular` — для тамошнего `TestBed` Angular) |
| `vitest-auto-spy/node`                       | сюиты на `node --test`, ESM или CJS                                                       |
| `vitest-auto-spy/angular`                    | `provideAutoSpy`, `injectSpy`, `renderShallow`, хелперов переопределения                  |
| `vitest-auto-spy/setup`                      | `setupAutoSpy`, хелперов часов, `installPerTest`, матчеров фокуса                         |
| [`vitest-auto-spy/zone`](/ru/utilities/zone) | `fakeAsync` / `waitForAsync` на Vitest — zone.js не попадает ни в одну другую точку входа |

## Ошибки, которые называют, чем чинить {#errors-that-name-their-own-fix}

Стек-трейс агент читает куда чаще, чем README, поэтому каждая ошибка и каждое предупреждение этого
пакета заканчиваются ссылкой на страницу, где это разобрано:

```
Observable spies require rxjs. Import 'vitest-auto-spy/rxjs' once (e.g. in your test setup)
to enable observablePropsToSpyOn / nextWith / nextWithValues / throwWith / complete / returnSubject.
Docs: https://asdalexey.github.io/vitest-auto-spy/runtimes/rxjs
```

То же самое — для отсутствующего mock-адаптера, метода, которого нет на прототипе, `advanceTimers()`
без фейковых таймеров, преднастройки `bun-angular` без DOM-пакета, неразрешимого `templateUrl`,
нарушения `mustBeCalledWith` и отчёта о дублирующейся установке.

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
    файлами — в дикой природе это `@angular/build:unit-test` под `--coverage`, — отдаёт их первому
    файлу каждого воркера и больше никому. Никто об этом не сообщает; симптом — утёкший глобал или
    настоящие таймеры в спеке, которая сама по себе проходит. Гоняйте покрытие с `--isolate` или
    вызывайте [`setupAutoSpy()`](/ru/utilities/setup) из чего-то, что вычисляется на каждый файл.
