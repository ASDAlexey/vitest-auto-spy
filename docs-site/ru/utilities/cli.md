---
title: CLI — doctor, perf и init
description: npx vitest-auto-spy — консольная утилита, которая входит в пакет. doctor находит ошибки тестовой настройки, от которых прогон не падает, perf показывает, куда уходит время тестов, и может ронять CI на медленном тесте, init указывает агентам на библиотеку, а ng-test добавляет Angular-билдеру шарды и прогон только затронутых спек.
---

# CLI

В пакет входит консольная утилита `npx vitest-auto-spy`. Она ищет в тестовой настройке ошибки, от которых тесты не падают,
показывает, куда уходит время тестов, и объясняет агентам, как пользоваться библиотекой. Ей не нужны
конфиг, сеть и токен.

```bash
npx vitest-auto-spy doctor
```

| Команда                                                                          | Когда нужна                                                      | Пишет файлы                |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------- |
| [`doctor`](#doctor-—-defects-that-never-fail)                                    | найти ошибки настройки, при которых прогон остаётся зелёным      | никогда                    |
| [`perf`](#perf-—-where-the-cpu-time-actually-goes)                               | тесты идут медленно, и нужно понять, какие файлы чинить          | никогда                    |
| [`perf --gate`](#the-gate)                                                       | CI должен падать, когда тест или файл стал медленным             | никогда                    |
| [`init`](#init-—-the-pointer-an-agent-actually-reads)                            | агенты в вашем репозитории должны знать о библиотеке             | да, между своими маркерами |
| [`codemod`](#codemod)                                                            | вы переводите тесты с `jest-auto-spies` или `jasmine-auto-spies` | только с `--write`         |
| [`ng-test`](#ng-test-—-sharding-and-changed-only-runs-under-the-angular-builder) | тесты идут через Angular-билдер, и нужны шарды                   | никогда                    |

Готовые джобы для GitLab и GitHub — в разделе [В CI](#in-ci). Каждая находка `doctor` и `perf` заканчивается строкой `Docs:` со ссылкой на её запись на этой
странице.

## Коды выхода {#exit-codes}

У всех команд одни и те же коды выхода, поэтому любую из них можно поставить в CI одной строкой.
Исключение одно: когда `ng-test` передаёт прогон `ng`, он выходит с кодом `ng`.

| Код | Значение                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0` | Команда отработала, сообщить нечего                                                                                                                                                                |
| `1` | Она что-то нашла: ошибку или предупреждение `doctor` (по умолчанию), место, которое `codemod` оставил вам, устаревший блок при `init --check`, подтверждённое превышение бюджета при `perf --gate` |
| `2` | Она не смогла сделать работу: неизвестная команда, флаг или значение, путь без единого файла, `perf` нечего оценивать, `ng-test` не может запуститься (список ниже)                                |

Код 2 значит, что команде нечего было оценивать: неверна командная строка или окружение либо (под
`perf --gate`) сами тесты упали. «Слишком медленно» или «ошибка настройки» он не значит никогда. Сюда
входят:

- неизвестная команда или флаг, которого у команды нет, — ошибка называет флаг и подсказывает, какой,
  скорее всего, имелся в виду;
- значение флага, которое команда не может использовать: `--min-severity loud`, `--max-test-ms abc`
  или `-5`, `--cwd` без директории после него, id в `--ignore`, которого нет среди проверок `doctor`;
- неизвестный id трансформации в `codemod --only` / `--skip` или путь `codemod`, под который не
  подходит ни один файл;
- прогон `perf`, которому нечего оценивать, в том числе упавшие тесты под `--gate`
  ([подробности](#when-there-is-nothing-to-read));
- `ng-test` без unit-test цели, без поддержки `--list-tests`, без `@angular/cli`, с упавшим
  `git diff`, с несколькими целями без `--target` или со списком `--include`, который не влезает в
  командную строку платформы.

Команда останавливается до того, как что-то прочитает или запишет, и печатает `Nothing ran.`. Она
никогда молча не подставляет значение по умолчанию: иначе опечатка вроде `perf --gat` прошла бы CI
вовсе без гейта.

## `doctor` — дефекты, которые никогда не падают {#doctor-—-defects-that-never-fail}

`doctor` находит ошибки тестовой настройки, при которых тесты остаются зелёными. Паттерн в tsconfig,
под который не подходит ни один файл, конфиг раннера, которого уже нет, промис хелпера, который никто не
дождался: тесты проходят, `tsc` показывает ноль ошибок, и ошибка живёт годами. Большинство таких
ошибок разбросаны по нескольким файлам, поэтому линтер их не видит.

```bash
npx vitest-auto-spy doctor
```

`doctor` только читает. Он никогда не правит файлы, и `--fix` у него нет. Он выходит с кодом 1, когда
нашёл ошибку или предупреждение; заметка по умолчанию прогон не роняет.

### Как читать отчёт doctor {#read-the-doctor-report}

```
$ npx vitest-auto-spy doctor
vitest-auto-spy doctor — /work/app
1284 files scanned, 212 of them spec files — runner: vitest, entry: vitest-auto-spy/angular

error  tsconfig-glob-matches-nothing libs/users/tsconfig.spec.json
       The "include" pattern "src*.spec.ts" matches no file.
       → A pattern that matches nothing type-checks nothing, and `tsc --noEmit` still reports
         zero errors. Fix the glob or delete the entry.
       Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/cli#tsconfig-glob-matches-nothing

3 errors, 4 warnings, 1 note
```

У каждой находки четыре части:

1. **Уровень и id проверки** — `error`, `warn` или `info`, затем id, затем файл.
2. **Что найдено** — одно-два предложения.
3. **Как исправить** — после `→`.
4. **`Docs:`** — ссылка на запись проверки в разделе [Проверки doctor](#doctor-checks).

Когда у нескольких файлов одна и та же проблема с одним и тем же исправлением, `doctor` печатает их
одним блоком: сообщение один раз, под ним файлы, затем исправление один раз.

```
info   tsconfig-glob-matches-nothing — 6 files
       The "include" pattern "src/**/*.spec.ts" matches no file, and there is no
       "*.spec.ts" beside this config for it to miss.
         libs/subscription-recovery/data/tsconfig.spec.json
         libs/subscription-recovery/domain/tsconfig.spec.json
         …
       → Nothing is unchecked today: the entry starts matching when the first
         such file is written. Delete it only if none ever will be.
       Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/cli#tsconfig-glob-matches-nothing
```

Отчёт всегда заканчивается строкой итогов, даже когда ничего не найдено. Текст переносится по ширине
терминала, а в пайпе или логе CI — по 80 колонкам; переменная `COLUMNS` меняет ширину. Пути и URL не
разрываются никогда.

### Что печатать и что роняет прогон {#choose-what-prints-and-what-fails}

Отчёт настраивают три флага. Первые два принимает и `perf`.

| Флаг                   | По умолчанию | Что делает                                                                                                    |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `--min-severity <lvl>` | `info`       | Скрывает из печатного отчёта находки ниже этого уровня. Строка итогов их всё равно считает; код выхода тот же |
| `--fail-on <lvl>`      | `warning`    | Минимальный уровень, при котором код выхода 1                                                                 |
| `--ignore <check,…>`   | —            | Убирает эти проверки из отчёта, итогов, кода выхода и `--code-quality`                                        |

Уровень — это `error`, `warning` или `info`; `--fail-on` принимает и `warn`.

```bash
npx vitest-auto-spy doctor --min-severity warning   # скрыть заметки; итоги их всё равно считают
npx vitest-auto-spy doctor --fail-on error          # предупреждения печатаются, но джобу не роняют
npx vitest-auto-spy doctor --fail-on info           # джобу роняет и заметка
npx vitest-auto-spy doctor --ignore angular-build-splitting-off
```

С `--min-severity` строка итогов говорит, что скрыто:

```
0 errors, 1 warning, 3 notes (3 not shown: --min-severity warning)
```

Используйте `--ignore` только для находки, которую вы уже решили способом, невидимым для `doctor`, —
например `angular-build-splitting-off` на билдере, который вы пропатчили, чтобы он снова
делил код. Находка скрывается полностью. Id, которого нет среди проверок `doctor`, останавливает прогон
с кодом 2 и подсказывает, какой id, скорее всего, имелся в виду.

По умолчанию `perf` падает только на гейте. С `--fail-on` код 1 даёт и находка `perf` этого уровня или
выше.

### Вывод для скриптов и merge request {#output-for-scripts-and-merge-requests}

| Флаг                    | Вывод                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `--format json`         | Один JSON-документ в stdout со всеми находками, что бы ни говорил `--min-severity`       |
| `--format markdown`     | Тот же документ markdown-таблицами — для комментария в merge request или сводки джобы CI |
| `--code-quality <path>` | Файл отчёта [GitLab Code Quality](https://docs.gitlab.com/ci/testing/code_quality/)      |

Все три работают в `doctor` и `perf` и сохраняют код выхода текстового прогона.

**Виджет merge request в GitLab.** Укажите файл в `artifacts:reports:codequality`. Виджет покажет,
какие находки новые, а какие исправлены относительно целевой ветки. Он есть на всех тарифах GitLab, и
ему не нужны токен и внешние сервисы.

```yaml
doctor:
  script: npx vitest-auto-spy doctor --code-quality gl-code-quality.json
  artifacts:
    when: always
    reports:
      codequality: gl-code-quality.json
```

В файл попадают те же находки, что и в печатный отчёт с учётом `--min-severity`; `--fail-on` меняет
только код выхода. Поэтому `doctor --fail-on error --code-quality gl-code-quality.json` роняет джобу только на
ошибках и при этом показывает в виджете предупреждения и заметки.

**Сводка джобы в GitHub.** Допишите markdown-вывод в `$GITHUB_STEP_SUMMARY`:

```bash
npx vitest-auto-spy doctor --format markdown >> "$GITHUB_STEP_SUMMARY"
```

Списки полей и подробности форматов — в разделе [Форматы отчёта](#report-formats).

## `perf` — куда на самом деле уходит время CPU {#perf-—-where-the-cpu-time-actually-goes}

`perf` один раз запускает ваши тесты, читает собственные замеры Vitest по каждому файлу и говорит,
какая фаза забирает время и какие файлы менять. Нужен, когда тесты идут медленно, а почему — непонятно.

```bash
npx vitest-auto-spy perf                        # прогнать все тесты и выдать отчёт
npx vitest-auto-spy perf src/cli                # только эти файлы (уходит в Vitest как фильтр)
npx vitest-auto-spy perf --gate                 # ещё и падать на медленном файле или тесте
npx vitest-auto-spy perf --json out/perf.json   # прочитать сохранённый отчёт вместо запуска Vitest
npx vitest-auto-spy perf --out out/perf.json    # сохранить отчёт этого прогона
```

Без `--gate` `perf` только советует и после успешного анализа всегда выходит с кодом 0: медленные тесты
— это не упавшие тесты. Если тесты собирает Angular-билдер, Nx или скрипт, сначала прочитайте раздел
[Когда голый прогон — не ваши тесты](#when-a-bare-run-is-not-your-suite).

**Для CI добавьте `perf --gate`.** Он падает только на файле или теле теста (коде внутри `it`), которые медленны по
сравнению с остальными файлами того же прогона, сначала перемеряет их по отдельности и объясняет причину по
CPU-профилю. См. [Гейт](#the-gate).

### Как читать отчёт perf {#read-the-perf-report}

```
$ npx vitest-auto-spy perf
vitest-auto-spy perf — /work/jsdom-app
30 test files, 50 tests, 1.36s wall clock, 16.91s of CPU time summed over the workers
median test 2ms, median file 3ms
15 lanes busy 15.2% of the 738ms span; src/calc-16.spec.ts ran alone for the last 3ms

  phase          time  share
  environment  15.23s  90.1%  ██████████████████
  transform     692ms   4.1%  ▉
  setup         445ms   2.6%  ▌
  import        293ms   1.7%  ▍
  tests         152ms   0.9%  ▏
  prepare        99ms   0.6%  ▏

info   perf-environment
       Environment setup is 90.1% of the measured CPU time, against 0.9% in the test bodies. No spec
       file could be proved DOM-free, so this names none; 30 were left undecided.
       → Nothing can move while every spec loads `src/test-setup.ts`: a setup file that mentions a
         DOM name keeps every spec on the DOM. Move the DOM part of it into a setup file only the
         DOM specs load. With the DOM part moved out, 20 spec files reach no DOM and could move to
         `node`, freeing 9.86s of environment.
       Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/cli#perf-environment

info   perf-pool
       No `pool` is set, so Vitest 5.0.2 starts a fresh `forks` process for every file and builds
       `jsdom` in each; per-file environment, setup and prepare are 93.3% of the measured CPU time.
       `pool: 'vmThreads'` keeps the workers and gives each file a new VM context instead: measured
       on 30 jsdom files, 1.4–1.85 s went to 0.83–0.88 s.
       → Try `pool: 'vmThreads'` in vitest.config.ts and keep it only if the suite stays green and
         peak memory stays acceptable: a `vm` pool keeps a worker's native modules between files, so
         cap it with `vmMemoryLimit`.
       Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/cli#perf-pool

budgets: a test body 1.00s (--max-test-ms); a file's bodies the largest of 5.00s (--max-file-ms),
  2000 median tests (--max-file-tests, 3.43s here) and 10× the median test for each of its tests
  (--factor).

Nothing over budget: no file over its budget and no test body over 1.00s. Nothing here would fail
  --gate.

0 errors, 0 warnings, 6 notes
```

Читайте сверху вниз:

1. **Шапка**: число файлов и тестов, время по часам и время CPU, сложенное по всем воркерам. Строка
   `lanes` — это дорожки: параллельные слоты, на которых воркеры выполняли файлы. Время CPU
   больше времени по часам, потому что воркеры работают параллельно.
2. **Таблица фаз**: куда ушло время CPU. Самая большая фаза — то, куда смотреть.
3. **Находки**: советы по фазе, которая преобладает, и файлы, которые менять. Каждая описана в разделе
   [Находки perf](#perf-findings).
4. **Бюджеты и таблицы превышений**: что уронил бы `--gate`. Здесь превышений нет.

| Фаза          | Что Vitest измеряет для каждого файла                                             |
| ------------- | --------------------------------------------------------------------------------- |
| `environment` | Импорт и запуск окружения (`jsdom`, `happy-dom`, `node`)                          |
| `prepare`     | Подготовку тестовой обвязки: раннер, моки                                         |
| `import`      | Импорт модуля теста со всем, что он импортирует, и выполнение колбэков `describe` |
| `setup`       | Импорт настроенных setup-файлов                                                   |
| `tests`       | Выполнение тел тестов и хуков                                                     |
| `transform`   | Ожидание, пока Vite преобразует модули: на весь прогон до Vitest 5, по файлу на 5 |

Находки у фазы появляются, только когда ею имеет смысл заниматься: не меньше 30 % от суммы и не меньше
5 с времени CPU на весь прогон. Ниже порога `perf` так и говорит и файлов не называет.

Несколько строк под шапкой появляются, только когда им есть что сказать:

- `` `ng test` took 8.70s end to end, 3.50s of it outside the run Vitest timed `` — когда `perf` сам
  запускал команду и секунда или больше ушла на сборку, бандл, запуск, выход, отчёты покрытия или
  зависание.
- `setupAutoSpy hooks 14ms, 7.2% of the tests phase` — сколько стоят собственные хуки библиотеки на
  каждый тест. Их замеряют только во время прогона `perf`.
- Предупреждение, когда Vitest сообщает, что прогон прерван (Ctrl-C, сигнал или `--bail`).

Когда файл или тело теста выходит за бюджет, их перечисляют две таблицы: **files over budget** и
**test bodies over budget**. Числа идут первыми, полный путь — последним, так что в логе CI шириной 80
колонок путь можно скопировать.

```
files over budget — 2 of 2015; the gate re-measures these and fails on them
   time  budget  over  tests  ms/test  ×median  vs base  file
  1.90s   634ms  3.0×    101     19ms     9.0×     0.8×  apps/web/src/app/catalog/item-card.component.spec.ts
  1.43s   418ms  3.4×      5    285ms     136×      new  apps/web/src/app/checkout/receipt-page.factory.spec.ts
```

| Колонка   | Значение                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| `time`    | Сумма тел тестов файла                                                                                     |
| `budget`  | Бюджет файла в этом прогоне ([как считаются бюджеты](#the-gate))                                           |
| `over`    | `time`, делённое на `budget`                                                                               |
| `tests`   | Тестов в файле                                                                                             |
| `ms/test` | Среднее время тела теста                                                                                   |
| `×median` | Среднее время тела относительно медианного теста прогона                                                   |
| `vs base` | С `--baseline`: во сколько раз файл сейчас больше своей записанной доли, или `new`, если его не записывали |

Заголовок каждой таблицы считает все строки сверх бюджета и говорит, если `--top` часть отрезал.
`--top <n>` ограничивает число строк (по умолчанию 10), `--top 0` выключает обе таблицы. Флаги бюджетов
рисуют таблицы и без `--gate`, так что обычный отчёт и прогон с гейтом согласны в том, что превышено.

### Когда голый прогон — не ваши тесты {#when-a-bare-run-is-not-your-suite}

Голый прогон — это `vitest run` без аргументов. Он читает конфиг в текущей директории. Во многих репозиториях его нет: тесты
собирает Angular-билдер, цель Nx или скрипт. Тогда голый прогон берёт настройки Vitest по умолчанию —
без `globals`, без алиасов путей, со всеми `*.spec.*` в дереве, — и Vitest не может собрать тесты ни из одного
файла, хотя таблица фаз выглядит правдоподобно.

`perf` проверяет это до запуска. Он запускает Vitest сам, только если в корне есть `vite(st).config.*`
или скрипт `test` вызывает `vitest`; иначе останавливается. (На Vitest 2 и 3 конфигом считается и `vitest.workspace.*` или
`vitest.projects.*`; Vitest 4 перестал их читать.) Затем он печатает команду, которую нужно запустить
вместо этого. Если в отчёте не завершилось ни одно тело теста (код внутри `it`), `perf` не выдаёт
такой отчёт за замер: код 2 и сообщение, сколько файлов собрано и сколько тел выполнилось.

**Замерить свою команду** можно через `--command`:

```bash
npx vitest-auto-spy perf --command 'npm test'
npx vitest-auto-spy perf --command 'npm test -- {paths:--include=}' --gate
```

`--command` запускает строку с двумя переменными окружения: `VITEST_AUTO_SPY_PERF_OUT` и
`VITEST_AUTO_SPY_PERF_REPORTER`. Конфиг Vitest, который загрузит команда, должен подключить
репортер. Добавьте две строки там, где объявлены его `reporters`:

```ts
const perf = process.env['VITEST_AUTO_SPY_PERF_REPORTER'];

reporters: perf === undefined ? ['default'] : ['default', perf],
```

**Под unit-test билдером Angular** (`@angular/build:unit-test` или `@nx/angular:unit-test` из Nx,
который его вызывает) конфиг править не нужно. Билдер принимает репортер и фильтр файлов как
опции, так что весь рецепт — одна команда. `perf` печатает её с вашими проектом и целью, когда
отказывается от голого прогона:

```bash
npx vitest-auto-spy perf --command 'npx ng run app:test --reporters=default --reporters="$VITEST_AUTO_SPY_PERF_REPORTER" {paths:--include=}'
npx vitest-auto-spy perf --command 'npx nx run ui:test --reporters=default --reporters="$VITEST_AUTO_SPY_PERF_REPORTER" {paths:--include=}'
```

Одинарные кавычки обязательны: `$VITEST_AUTO_SPY_PERF_REPORTER` должен дойти до оболочки, которую
запускает `perf`, а не раскрыться в той, где вы набираете команду. В строке `script:` в CI команда работает
как есть. Билдер следит за изменениями только в интерактивном терминале (TTY), так что в CI он прогоняет тесты
один раз;
если на вашей машине он продолжает следить, добавьте `--watch=false`. В отчёте пути ваших спек, а не
бандлов билдера, так что гейт работает как под обычным Vitest.

**`{paths}` позволяет гейту перемерить.** Файлы, которые гейт перемеряет, подставляются на место
`{paths}`. `{paths:<prefix>}` ставит флаг перед каждым — для команды, которая принимает
`--include=<glob>`: `{paths:--include=}` превращается в
`--include='src/a.spec.ts' --include='src/b.spec.ts'`. Без этого токена гейт не может запустить только нужные файлы. Он сообщает об этом и не
перезапускает ради перемера все тесты.

**Другой вариант — подключить репортер в конфиге постоянно.** Это удобно, если конфиг нельзя менять под
отдельный прогон. Он ничего не пишет, пока
`VITEST_AUTO_SPY_PERF_OUT` не называет файл, так что обычные прогоны ничего не теряют:

```ts
reporters: ['default', 'vitest-auto-spy/perf-reporter'],
```

На цели билдера передайте `--reporters=vitest-auto-spy/perf-reporter`. Джоба CI тогда задаёт
`VITEST_AUTO_SPY_PERF_OUT` на обычном прогоне тестов, а потом читает этот файл через `perf --json`.

### Когда читать нечего {#when-there-is-nothing-to-read}

`perf` выходит с кодом 2, когда ему нечего читать. У каждого случая своё сообщение:

- в `--cwd` не установлен Vitest или в `dist` пакета нет файла репортера;
- прогон Vitest не записал отчёт — если `--command` вышел не с нулём, прогон упал, сначала почините его;
  если вышел с нулём, конфиг, до которого он дошёл, не подключает репортер, и сообщение печатает
  [две строки, которые нужно добавить](#when-a-bare-run-is-not-your-suite);
- путь `--json` не существует, файл — не JSON, JSON — не отчёт perf или формат отчёта этой версией не
  читается;
- в отчёте не выполнилось ни одно тело теста;
- все файлы отчёта лежат вне `--cwd` — его мерили в другой копии репозитория, передайте в `--cwd` ту
  директорию;
- под `--gate` тесты упали или не доработали до конца.

Если тесты прогнались, но упали, обычный `perf` всё равно печатает замеры с предупреждением, что прогон
не прошёл. `--fail-on-red` превращает это предупреждение в код 1 — для джобы CI, где `perf --command`
единственный шаг с тестами.

**Прогон, который не дошёл до конца, всё равно оставляет отчёт.** Репортер перезаписывает отчёт по мере того, как
файлы заканчиваются, не чаще раза в две секунды, с пометкой `partial: true`. После падения, убийства
процесса или таймаута `perf` печатает то, что намерили завершённые файлы, с предупреждением и числом
файлов в отчёте. Гейт такой отчёт не оценивает: файлов, до которых прогон не дошёл, в нём нет, и
«всё чисто» было бы ложью. Прогон, который Vitest называет прерванным (Ctrl-C, сигнал или `--bail`),
тоже считается не дошедшим до конца.

### Гейт {#the-gate}

Без флагов `perf` только советует; ронять CI его заставляет `--gate`. (Код 1 по другим причинам могут
добавить `--fail-on`, `--fail-on-red` и `--fail-on-flaky`.) Гейт падает на теле теста или файле,
которые заметно медленнее остальных в том же прогоне, и только после того, как перемерил их по отдельности.

```bash
npx vitest-auto-spy perf --gate
npx vitest-auto-spy perf --gate --command 'npm test -- {paths:--include=}'   # своя команда запуска
npx vitest-auto-spy perf --gate --gate-only src/app/cart.spec.ts,src/app/user.spec.ts
```

**Что считается превышением.** Гейт судит только тела тестов и хуки (фазу `tests`) и никогда —
окружение или импорты, которые зависят от машины.

- **Тело теста** выходит за бюджет, если дольше `--max-test-ms` (по умолчанию 1000 мс).
- **Файл** выходит за бюджет, когда сумма его тел больше наибольшего из трёх чисел:
  - `--max-file-tests` (2000) × медианный тест прогона;
  - `--factor` (10) × медианный тест × число тестов в файле;
  - `--max-file-ms` (5000 мс) — так что файл короче 5 с никогда не выходит за бюджет.

Первые два выражены через медианный тест самого прогона, поэтому более медленная машина CI вердикт не
меняет. Если медленно всё подряд, выброса нет и находок по файлам тоже; для бюджета на весь прогон есть
`--max-wall-ms` (по умолчанию выключен).

**Одного замера мало, чтобы уронить.** Каждый кандидат перемеряется отдельно, через тот же
`--command`. Файл, который в одиночку быстрый, получает **not reproduced** — заметку, а не падение: он
был медленным, потому что делил воркер с другими. Когда перемерить нельзя (`--command` без `{paths}`
или `--json` без `--command` на отчёте, где не записан конфиг Vitest), гейт показывает кандидатов
предупреждениями и на них не падает. `--no-confirm` велит судить по одному замеру.

**Один `--json` тоже перемеряет.** Perf-репортёр записывает файл конфига Vitest, с которым шёл прогон.
С `--json` и без `--command` гейт запускает `vitest run --config <этот файл>` только по подозреваемым.
Отчёты с двух конфигов (два набора тестов, у каждого свой `vitest.config.ts`) получают по прогону на
конфиг, а результаты читаются как один:

```bash
vitest run --config libs/tooling/vitest.config.ts   # пишет reports/perf-tooling.json
vitest run                                          # пишет reports/perf-libs.json
npx vitest-auto-spy perf --json 'reports/perf-*.json' --gate
```

Перемер идёт без покрытия, даже если первый замер шёл с ним. Причина: пороги покрытия роняют прогон
из нескольких файлов, а инструментирование — цена обвязки, а не теста. Плата за это: тело, которое
выходит за бюджет только из-за инструментирования, получает not reproduced. Отчёт, записанный до того, как
конфиг стал записываться (формат отчёта версии 5 и ниже), так не перемерить: передайте `--command`
или перезапишите отчёт этой версией.

```
$ npx vitest-auto-spy perf --json out/perf.json --gate --command 'npm test -- {paths:--include=}'

perf gate: re-measuring 1 file on its own before failing anything.

perf gate verdict — 1 judged, 1 fails the run
  kind  first  again  budget  verdict    where
  test  4.31s  4.05s   1.00s  confirmed  libs/a/src/lib/thing.spec.ts › Thing > waits for the retry

error  perf-gate-slow-test libs/a/src/lib/thing.spec.ts
       `Thing > waits for the retry` spent 4.31s in its body, over the 1.00s budget
       (--max-test-ms 1000). Re-measured on its own: 4.05s, still over budget.
       → A test body over a second is usually waiting rather than working: a timer nobody advanced
         (`vi.useFakeTimers()` and `vi.advanceTimersByTime`), a real request or a real animation
         frame, an `await` on something that settles on a schedule, or a fixture rebuilt from
         scratch in every case.

1 error, 0 warnings, 0 notes
```

**Таблица вердиктов** — по строке на кандидата:

| Колонка   | Значение                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`    | `test`, `file`, `grew` (рост относительно базовой линии) или `run` (бюджет на весь прогон)                                                           |
| `first`   | Первый замер                                                                                                                                         |
| `again`   | Замер в одиночку                                                                                                                                     |
| `budget`  | Собственный бюджет кандидата                                                                                                                         |
| `verdict` | `confirmed`, `not reproduced`, `unconfirmed` (перемерить было нечем), `single reading` (`--no-confirm`) или `over budget` для бюджета на весь прогон |

**Подтверждённая находка объясняет причину.** Во время перемера `perf` снимает CPU-профиль каждого
файла. Под находкой он печатает карточку: самые медленные тесты, хуки против тел тестов, куда ушло
время по пакетам и в вашем коде, и вероятную причину.

```
error  perf-gate-slow-file libs/player/src/lib/vod/vod.component.spec.ts
       The test bodies in this file add up to 9.20s, over the 5.00s budget (…). Re-measured on its own: 8.70s, still over budget.

       ┌─ measurements ────────────────────────────────────────────────
       │ first run      9.20s   budget 5.00s   1.8× over
       │ on its own     8.70s   still over budget
       │ tests             38   242ms each   20× the median test
       ├─ slowest tests ───────────────────────────────────────────────
       │  527ms  focus > moves through the controls
       │  332ms  chapters > skips the intro
       │  291ms  chapters > hides the controls after six seconds
       ├─ where the time went · CPU profile, 8.41s sampled ────────────
       │ hooks        ███████████░░░░░░░░░ 54%   test bodies 46%
       │ by package   ██████░░░░░░░░░░░░░░  28%  jsdom
       │              █████░░░░░░░░░░░░░░░  25%  @angular/core
       │              ██░░░░░░░░░░░░░░░░░░  10%  zone.js
       │ in the spec  setUpWith 38%  ·  VodComponent_Template 17%  ·  assertFocus 8%
       │ your code    FocusGroupDirective 4%  ·  TimelineComponent_Template 3%  ·  platformFactory 1%
       │ hottest      (garbage collector) 3%  ·  onScheduleTask (zone.js) 2%  ·  refreshView (@angular/core) 2%
       ├─ likely cause ────────────────────────────────────────────────
       │ Most of the time is set-up that every test repeats: 54% is in hooks — setUpWith alone is 38%. Build what does not change once, in a beforeAll, or render less per test.
       │ The largest single cost is jsdom (28%): rendering and change detection, which grow with the size of the tree each test builds.
       └───────────────────────────────────────────────────────────────

       → Every test in this file costs many times an ordinary test of the same run. (…)
```

Как читать карточку:

- **measurements** — первый замер, замер в одиночку и насколько превышен бюджет.
- **slowest tests** — начинайте с верхнего.
- **where the time went** — доли сэмплированного времени CPU. Функция считается один раз на сэмпл, как
  бы глубоко она ни рекурсировала, поэтому строки в сумме дают больше 100 %: `setUpWith` включает
  обнаружение изменений под ним.
- **likely cause** — не больше двух предложений, каждое по названному правилу: больше половины времени
  в хуках, один тест втрое дольше следующего, DOM- или фреймворк-пакет больше 20 %, сборка мусора больше
  10 %. Если ни одно правило не сработало, строки нет.

**На Angular-спеке** в карточке появляется строка `angular`: настройка TestBed
(`configureTestingModule`, `compileComponents`, `resetTestingModule`, вызовы `override*`), создание
компонента, обнаружение изменений (`refreshView`), JIT-компиляция (время в `@angular/compiler`) и
вычисленные стили (`getComputedStyle` в jsdom). Четыре Angular-причины идут раньше общих: настройка
TestBed и создание компонента вместе от 30 %, JIT-компилятор от 15 %, обнаружение изменений от 30 %,
вычисленные стили от 15 %.

```
       │ hooks        ███████████░░░░░░░░░ 54%   test bodies 46%
       │ angular      TestBed set-up 31%  ·  change detection 22%  ·  component creation 9%
       ├─ slowest imports · with everything under them ────────────────
       │   1.24s  @angular/material
       │   310ms  src/app/player/player.component.ts
       ├─ likely cause ────────────────────────────────────────────────
       │ TestBed rebuilds the testing module and the component for every test: 40% is TestBed set-up and component creation. (…)
```

**slowest imports** (Vitest 4.1 и новее) перечисляет самые тяжёлые прямые импорты спеки со всем, что
они за собой потянули: пакет — по имени, модуль — по пути. Setup-файлы помечены `· setup file`. У
импорта, чьё собственное выполнение меньше итога под ним, стоит `· self 20ms`, так что медленный сам по
себе модуль отличим от модуля, медленного из-за своих импортов. Модуль, который первым импортировал
другой файл, не показывается. Настраивать ничего не нужно; на старом Vitest или в обвязке, где спека —
собранный чанк, этого раздела нет.

`--profile-dir <dir>` сохраняет каждый CPU-профиль в файл `.cpuprofile` для Chrome DevTools или
speedscope.

**Упавший прогон гейт не оценивает.** Упавший тест работает до своего таймаута, а 30 с таймаута
выглядят ровно как 30 с медленного кода. Упавшие или недоработавшие тесты под `--gate` дают код 2.

**Судить только то, что поменяла ветка.** `--gate-only` принимает пути через запятую; гейт судит только
их, а медиана по-прежнему считается по всему прогону.

В терминале карточка и таблицы цветные; когда цвет включён — в разделе [Форматы отчёта](#report-formats).
Почему гейт устроен именно так — в разделе [Почему гейт работает так](#why-the-gate-works-like-this).

### Поймать постепенное замедление базовой линией {#catch-slow-growth-with-a-baseline}

Гейт по сегодняшним числам не замечает медленный рост: файл, который месяц назад шёл 300 мс, а сегодня
900 мс, всё это время укладываясь в бюджеты. `--baseline` сравнивает прогон с записанным:

```bash
npx vitest-auto-spy perf --json out/perf.json --update-baseline    # записать; закоммитьте файл
npx vitest-auto-spy perf --json out/perf.json --gate --baseline perf-baseline.json
```

Базовая линия хранит не миллисекунды, а долю каждого файла относительно медианного файла прогона.
Медленная машина увеличивает оба числа одинаково, так что базовая линия с ноутбука работает и на
медленном раннере CI.

- Файл считается выросшим, когда его доля выросла хотя бы в `--baseline-factor` раз (по умолчанию 2),
  а тела его тестов теперь занимают не меньше `--baseline-floor-ms` (по умолчанию 500 мс). Дальше он
  проходит тот же перемер, что и любой кандидат гейта. Сообщение переводит долю в миллисекунды этого
  прогона.
- Файлы, которых нет в базовой линии, — новые; файлы, которые в ней есть, но в этом прогоне не
  измерены, — из другого шарда. Ни то ни другое не роняет прогон; и то и другое показывается как дрейф.
- Недоработавший прогон никогда не записывается и не сравнивается: `--update-baseline` на нём даёт
  код 2.

**Берите историю `.jsonl` вместо одного снимка**, если доли файлов скачут от прогона к прогону. С путём
`.jsonl` `--update-baseline` дописывает по строке на прогон (доли, время и коммит из `CI_COMMIT_SHA`
или `GITHUB_SHA`) и хранит последние 30. Тогда файл считается выросшим, только если его доля и больше
`--baseline-factor` × его среднего, и выше всех долей, с которыми он когда-либо записывался. Для этого
нужно минимум три записанных прогона. Файл может жить в кэше CI, а не в git: записывайте на основной
ветке, судите в merge request.

```yaml
perf:
  cache:
    key: perf-history
    paths: [perf-history.jsonl]
  script:
    - npx vitest-auto-spy perf --json out/perf.json --gate --baseline perf-history.jsonl
    - if [ "$CI_COMMIT_BRANCH" = "$CI_DEFAULT_BRANCH" ]; then npx vitest-auto-spy perf --json out/perf.json --baseline perf-history.jsonl --update-baseline; fi
```

### Объединить отчёты шардов {#merge-sharded-reports}

Пайплайн с шардами пишет по отчёту на джобу. Каждый шард сам по себе видит только часть тестов, и его
медиана неверна. Передайте в `--json` директорию или паттерн, чтобы сначала их объединить:

```bash
npx vitest-auto-spy perf --json 'coverage/**/perf-*.json' --gate
```

При объединении время CPU складывается, а время по часам — это самый долгий шард (они шли
одновременно). Файл, измеренный в двух шардах, сохраняет более медленный замер и называется в отчёте.
Каждый отчёт приводится к одному корню, потому что джобы CI часто клонируют репозиторий в разные
директории.

### Флаги {#flags}

Позиционный путь (`npx vitest-auto-spy perf src/cli`) уходит в Vitest как фильтр файлов; без него
`perf` замеряет все тесты.

| Флаг                  | По умолчанию         | Что делает                                                                                                                          |
| --------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `--cwd <dir>`         | текущая директория   | Работать в другой директории                                                                                                        |
| `--command <c>`       | —                    | Замерить эту строку оболочки вместо запуска Vitest; `{paths}` / `{paths:<prefix>}` принимают файлы для перемера                     |
| `--json <path>`       | —                    | Читать отчёты вместо запуска Vitest: файл, директорию или паттерн вроде `coverage/**/perf-*.json`                                   |
| `--out <path>`        | временный, удаляется | Сохранить отчёт по этому пути (относительно `--cwd`); в директорию кладётся `perf-report.json`                                      |
| `--gate`              | выключен             | Падать на подтверждённом превышении, код 1                                                                                          |
| `--max-test-ms`       | `1000`               | Бюджет одного тела теста. Тела короче 100 мс не записываются, так что это нижняя граница                                            |
| `--max-file-ms`       | `5000`               | Файл, чьи тела в сумме меньше, никогда не становится находкой                                                                       |
| `--max-file-tests`    | `2000`               | Сколько медианных тестов прогона может набрать сумма тел файла                                                                      |
| `--factor <n>`        | `10`                 | Во сколько медианных тестов может обойтись один тест файла                                                                          |
| `--max-wall-ms`       | выключен             | Бюджет на весь прогон. Время по часам зависит от раннера, поэтому само не выводится                                                 |
| `--gate-only`         | —                    | Пути через запятую, которые гейт может судить; медиана всё равно по всему прогону                                                   |
| `--no-confirm`        | —                    | Пропустить перемер и судить по одному замеру. Один `--json` перемеряет под конфигом из отчёта                                       |
| `--profile-dir <dir>` | —                    | Сохранить CPU-профиль каждого перемеренного файла как `<dir>/<путь спеки с / как __>.cpuprofile`. Нужен `--gate` без `--no-confirm` |
| `--ab-isolate`        | —                    | Прогнать тесты ещё раз с перевёрнутым `isolate` и показать оба времени. Один `--json` даёт предупреждение; с `--command` работает   |
| `--baseline <p>`      | —                    | Сравнить с записанной базовой линией и падать на выросшем. Путь `.jsonl` — история прогонов                                         |
| `--update-baseline`   | `perf-baseline.json` | Записать этот прогон в базовую линию вместо оценки; история `.jsonl` хранит 30 прогонов                                             |
| `--baseline-factor`   | `2`                  | Во сколько раз должна вырасти записанная доля файла                                                                                 |
| `--baseline-floor-ms` | `500`                | Файл, чьи тела занимают меньше, — шум, как бы ни выросла его доля                                                                   |
| `--fail-on-flaky`     | выключен             | Тест, прошедший только с повтора, роняет прогон, код 1                                                                              |
| `--fail-on-red`       | выключен             | Упавшие тесты роняют и `perf`, код 1. Без флага это предупреждение, и `perf` выходит с 0                                            |
| `--top <n>`           | `10`                 | Строк в таблицах превышений; `0` их выключает                                                                                       |
| `--min-severity`      | `info`               | Минимальный уровень, который печатается. Общий с `doctor`                                                                           |
| `--fail-on`           | роняет только гейт   | Минимальный уровень, при котором код 1. Общий с `doctor`                                                                            |
| `--format <f>`        | `text`               | `json` или `markdown`; собственный вывод тестов уходит в stderr. Общий с `doctor`                                                   |
| `--code-quality <p>`  | —                    | Ещё и записать отчёт GitLab Code Quality. Общий с `doctor`                                                                          |

## `init` — указатель, который агент действительно читает {#init-—-the-pointer-an-agent-actually-reads}

`init` пишет короткий блок в файлы инструкций, которые читают агенты, и указывает им на документацию
библиотеки внутри `node_modules`. Запустите его один раз на репозиторий и снова после обновления. Агенты
никогда не сканируют зависимости, так что без этого указателя они не знают правил библиотеки.

```bash
npx vitest-auto-spy init             # записать или обновить блоки
npx vitest-auto-spy init --dry-run   # показать, что изменится
npx vitest-auto-spy init --check     # CI: код 1, если блока нет или он устарел
```

Блок пишется под ваш репозиторий, а не копируется из шаблона. `init` читает `package.json` и конфиг
тестов и пишет только то, что у вас правда: точку входа для вашего раннера и фреймворка, настоящий
setup-файл, который запускают тесты, и строку про rxjs — только если rxjs установлен.

### Что он пишет {#what-it-writes}

**Всегда** — три файла в корне и одна заглушка:

| Файл                                      | Кто читает                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `AGENTS.md`                               | Codex, Cursor, Copilot, Cline, Windsurf, Zed, OpenCode, Qwen, Roo, Junie, Aider   |
| `CLAUDE.md`                               | Claude Code, а также GLM / Kimi, запущенные внутри него                           |
| `GEMINI.md`                               | Gemini CLI, который по умолчанию не читает `AGENTS.md`                            |
| `.claude/skills/vitest-auto-spy/SKILL.md` | Claude Code. Заглушка: frontmatter скилла из пакета и указатель на `node_modules` |

**Только если директория инструмента уже есть** — как правила, привязанные к файлам тестов, чтобы на
других задачах они ничего не стоили: `.cursor/rules/`, `.github/instructions/`, `.windsurf/rules/`,
`.devin/rules/`, `.clinerules/`, `.roo/rules/`.

**Никогда не создаются**: `.rules`, `.cursorrules`, `.windsurfrules` и `.clinerules` в виде файла. Zed
берёт первый найденный файл из списка, который заканчивается на `AGENTS.md`, так что любой из них
заслонил бы весь `AGENTS.md` проекта. Если такой файл уже есть, `init` дописывает в него.

`CLAUDE.md`, который является симлинком на `AGENTS.md` или уже содержит строку импорта `@AGENTS.md`,
остаётся как есть: запись через него продублировала бы блок.

То, что называет блок, берётся из сканирования. Setup-файл — первая запись `setupFiles` цели
`@angular/build:unit-test` или `@nx/angular:unit-test` (с учётом `targetDefaults` из `nx.json`), а
если такой нет — из конфига Vitest; `sequence.setupFiles: 'list'` — это порядок, а не файл.
Angular-репозиторий, который импортирует из `/angular/diagnostics`, `/angular/doubles` или
`/angular/matchers` — или всё ещё импортирует имя, переехавшее туда из `/angular`, — получает ещё одну
строку с ними.

### Запускайте снова после обновления {#run-it-again-after-an-upgrade}

Всё, что пишет `init`, стоит между двумя маркерами:

```md
<!-- vitest-auto-spy:begin v=3.7.0 sha=90452bea -->

…

<!-- vitest-auto-spy:end -->
```

- **Текст между маркерами** на каждом запуске генерируется заново целиком. После обновления `init`
  не меняет ничего или один кусок.
- **Текст вне маркеров** не читается и не переформатируется.
- **Блок, который вы правили руками**, больше не совпадает со своим `sha=`. `init` помечает его как
  `edited`, предупреждает и не трогает; `init --check` на нём падает. Перенесите свой текст за маркеры,
  удалите блок и запустите `init` снова. `--uninstall` удаляет и отредактированный блок. Маркер без
  `sha=` не помечается никогда.
- **Несколько блоков в одном файле**: первый обновляется, остальные удаляются, и заметка говорит,
  сколько.
- **Файл без маркеров** по пути, который принадлежит `init`, написан руками, и `init` его не
  перезаписывает. Об одном случае он сообщает: `.claude/skills/vitest-auto-spy/SKILL.md` с `name:
vitest-auto-spy` во frontmatter — старая копия скилла из пакета. `init` помечает её как `stale` и
  просит удалить и запустить `init` снова; `init --check` на ней выходит с кодом 1.

**`--check` сравнивает блок, а не версию в маркере.** Обновление, которое меняет советы, роняет
`--check`; обновление, которое меняет только `v=` в маркере, — нет. `--check` показывает такой файл
как `unchanged`. `--dry-run` показывает его как `updated` с заметкой _only the version stamp differs_.
Обычный `init` обновит версию, когда в следующий раз будет писать по другой причине.

**Файлы, которые git игнорирует.** Если файл, который `init` создал или обновил, игнорируется и не
отслеживается (например, он в `.git/info/exclude` или в глобальном excludes-файле), его строка
заканчивается заметкой _not tracked by git, so `git diff` will not show this change_. Без этой заметки пустой
`git diff` выглядит как «ничего не изменилось».

**Всё или ничего.** Каждый файл пишется во временный и переименовывается на место. Если одна запись не
удалась, уже записанные файлы возвращаются как были (или удаляются, если их создал `init`). Файл с
ошибкой помечается `failed`, остальные — `skipped` (`rolled back — <path> could not be written`), и
`init` выходит с кодом 1. Файл, который не удалось вернуть, остаётся `failed` с предупреждением
`<path> was written but could not be put back`: восстановите его из git.

**Размер.** Блок меньше 1,6 КБ. Codex читает не больше `project_doc_max_bytes` (по умолчанию 32 768
байт) из всей цепочки `AGENTS.md` и молча обрезает остальное, поэтому `init` предупреждает, когда файл,
в который он дописал, переходит эту границу.

### Флаги {#flags-1}

| Флаг              | Команда       | Что делает                                                                                                                      |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `--check`         | `init`        | Ничего не писать; код 1, если блока нет или он устарел. Форма для CI                                                            |
| `--dry-run`       | `init`        | Показать, что изменится, и ничего не писать                                                                                     |
| `--uninstall`     | `init`        | Удалить управляемые блоки и файлы, которые создал `init`                                                                        |
| `--only <paths>`  | `init`        | Трогать только эти цели, через запятую; директория выбирает то, что `init` пишет в ней. `--check` и `--uninstall` его учитывают |
| `--cwd <dir>`     | любая команда | Работать в другой директории                                                                                                    |
| `-h`, `--help`    | любая команда | Экран справки                                                                                                                   |
| `-v`, `--version` | любая команда | Установленная версия                                                                                                            |

`--only CLAUDE.md,.claude` не пускает блок в отслеживаемые `AGENTS.md` и `GEMINI.md` в репозитории,
который игнорирует только файлы Claude.

Каждая команда принимает флаги своей таблицы плюс `--cwd`, `--help` и `--version`. Флаги `perf` — в
[его таблице](#flags), флаги кодмода — на [его странице](/ru/utilities/codemod#flags).

## `codemod` {#codemod}

`codemod` переводит тесты с `jest-auto-spies` и Jest или с `jasmine-auto-spies` и jasmine. По умолчанию
он печатает дифф и пишет только с `--write`.

```bash
npx vitest-auto-spy codemod            # предпросмотр: печатает дифф, ничего не пишет
npx vitest-auto-spy codemod --write    # применить
npx vitest-auto-spy codemod --verify   # CI: упасть, если остались хвосты
```

Он выходит с кодом 1, пока оставил что-то, что нужно переписать руками. Полное руководство со всеми
трансформациями и флагами — [Кодмод](/ru/utilities/codemod).

## `ng-test` — шарды и прогон только затронутого под Angular-билдером {#ng-test-—-sharding-and-changed-only-runs-under-the-angular-builder}

`ng test` не пропускает собственные флаги Vitest в билдер `@angular/build:unit-test`. `ng-test`
добавляет два, которых не хватает чаще всего: прогон одного шарда спек и прогон только тех спек, до
которых дотягивается изменение.

```bash
npx vitest-auto-spy ng-test --shard 2/4 -- --coverage  # одна джоба CI из четырёх
npx vitest-auto-spy ng-test --changed                  # спеки, до которых дотягивается незакоммиченная и неотслеживаемая работа
npx vitest-auto-spy ng-test --changed origin/main      # спеки, до которых дотягивается ветка
npx vitest-auto-spy ng-test --related src/app/cart/cart.service.ts --dry-run
```

Он получает список спек цели через `ng run <project>:<target> --list-tests` (`@angular/build` 21 и
новее), выбирает те, что достались этому прогону, и передаёт их билдеру путями `--include`. С
`@angular/build` 22.2 билдер компилирует только включённые спеки, так что шард ещё и компилирует меньше.

| Флаг                | Что делает                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--shard <i/n>`     | Прогнать шард `i` из `n`. Делится как `--shard` в Vitest: по хэшу пути, так что каждая спека идёт ровно в одном шарде                             |
| `--changed [ref]`   | Прогнать спеки, чьи импорты дотягиваются до файла, изменённого по `git diff` относительно `ref` (по умолчанию `HEAD`), плюс неотслеживаемые файлы |
| `--related <files>` | То же для перечисленных через запятую файлов                                                                                                      |
| `--target <p[:t]>`  | Unit-test цель, если их в workspace несколько                                                                                                     |
| `--dry-run`         | Напечатать команду `ng` вместо запуска                                                                                                            |
| `-- <options>`      | Передаётся в `ng run <project>:<target>` как есть, после `--watch=false`                                                                          |

- **Что значит «дотягивается»**: относительные импорты, алиасы `compilerOptions.paths`, а шаблон или
  стиль — через компонент, который их называет.
- **Изменения, после которых идёт всё**: конфиг, lock-файл, `angular.json`, `tsconfig` или файл, до
  которого дотягиваются `setupFiles` / `providersFile` цели. Изменение, которое не задело ни одной
  спеки, ничего не запускает и выходит с кодом 0.
- **Несколько целей**: без `--target` выбор неоднозначен, и `ng-test` выходит с кодом 2, перечислив их.
  Единственная цель берётся без флага.
- **`--include` после `--`** сужает список.
- **Слишком длинный список** (на Windows больше 32 767 символов) сворачивается: директория, все спеки
  которой выбраны, становится одним глобом `dir/**/*.spec.ts`. Если и так не влезает, `ng-test` выходит
  с кодом 2 и просит больше шардов или `test.shard` в конфиге раннера.
- **Код выхода** — тот, с которым вышел `ng`.

**Без `ng-test`** две опции Vitest всё же доходят до билдера — простыми ключами `test` в конфиге
раннера (читается с Angular 21). Шард, заданный так, всё равно компилирует все спеки, поэтому
`ng-test --shard` быстрее. `shard` нет в типе конфига, отсюда приведение типа:

```ts
// vitest-base.config.mts — runnerConfig цели
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...(process.env['VITEST_SHARD'] ? { shard: process.env['VITEST_SHARD'] } : {}),
    repeats: Number(process.env['VITEST_REPEATS'] ?? 0),
  } as never,
});
```

`VITEST_REPEATS=20 ng test --include src/app/cart` ловит нестабильный тест, а `VITEST_SHARD=1/4 ng test`
прогоняет четверть файлов. Флага `--repeats` у `ng-test` нет: `test.repeats` в конфиге раннера доходит
до Vitest как есть.

**Замерьте каждый шард через `perf`**, а потом объедините отчёты:

```bash
npx vitest-auto-spy perf --out perf-2.json \
  --command 'npx vitest-auto-spy ng-test --shard 2/4 -- --reporters=default --reporters="$VITEST_AUTO_SPY_PERF_REPORTER"'
npx vitest-auto-spy perf --json 'perf-*.json' --gate
```

Два инструмента Vitest с тестами билдера не работают вовсе. `vitest doctor` (команда самого Vitest, а
не `doctor` этого пакета) запускает Vitest без билдера, и каждый файл падает с `describe is not defined`; используйте `perf --command`. Вложенные
`projects` отбрасываются: билдер отдаёт один проект из своего бандла, поэтому заводите вторую цель.

## В CI {#in-ci}

**GitLab CI** для Angular CLI проекта `app` с тестовой целью `test`:

```yaml
doctor:
  script: npx vitest-auto-spy doctor --fail-on error --code-quality gl-code-quality.json
  artifacts:
    when: always
    reports:
      codequality: gl-code-quality.json

perf:
  script:
    - npx vitest-auto-spy perf --gate --command 'npx ng run app:test --reporters=default --reporters="$VITEST_AUTO_SPY_PERF_REPORTER" {paths:--include=}'

agent-instructions:
  script: npx vitest-auto-spy init --check

migration:
  script: npx vitest-auto-spy codemod --verify # на уже переведённых тестах
```

Если Vitest запускается с корневым `vitest.config.*`, строка `perf` — просто
`npx vitest-auto-spy perf --gate`; про Nx и скрипты — в разделе
[Когда голый прогон — не ваши тесты](#when-a-bare-run-is-not-your-suite).

**GitHub Actions** для тестов с корневым конфигом Vitest:

```yaml
- run: npx vitest-auto-spy doctor
- run: npx vitest-auto-spy init --check
- run: npx vitest-auto-spy codemod --verify # на уже переведённых тестах
- run: npx vitest-auto-spy perf --out perf.json # без --gate выходит с 0; сохраните отчёт как артефакт
- run: npx vitest-auto-spy perf --gate # код 1 на подтверждённом медленном файле или тесте, с причиной под ним
```

Ни одной из них не нужны сеть, конфиг или токен. CLI входит в пакет, и у него нет собственных
зависимостей во время выполнения.

Любую команду безопасно пускать в пайп. `npx vitest-auto-spy codemod | head` закрывает пайп на
полпути; команда перестаёт писать и выходит с тем кодом, который уже решила, без стектрейса `EPIPE`.

## Проверки doctor {#doctor-checks}

Каждая находка `doctor` ссылается на свою запись здесь. Каждая запись говорит, что проверка находит,
почему это важно и как исправить. Проверки сгруппированы по темам:

| Тема                                                      | Проверки                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Конфиги TypeScript](#typescript-configs)                 | [`tsconfig-glob-matches-nothing`](#tsconfig-glob-matches-nothing), [`tsconfig-file-missing`](#tsconfig-file-missing)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [Спеки и импорты](#spec-files-and-imports)                | [`spec-imported-by-non-spec`](#spec-imported-by-non-spec), [`spec-exports-fixture`](#spec-exports-fixture)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [Остатки другого раннера](#leftovers-from-another-runner) | [`foreign-runner-pragma`](#foreign-runner-pragma), [`dead-runner-config`](#dead-runner-config), [`orphan-runner-file`](#orphan-runner-file), [`jasmine-era-project`](#jasmine-era-project)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [Angular-билдер](#angular-builder)                        | [`angular-build-splitting-off`](#angular-build-splitting-off), [`angular-build-splitting-deprecated`](#angular-build-splitting-deprecated), [`angular-build-istanbul-module-cache`](#angular-build-istanbul-module-cache), [`angular-build-happy-dom`](#angular-build-happy-dom), [`angular-cache-off-in-ci`](#angular-cache-off-in-ci), [`builder-setup-unreached`](#builder-setup-unreached), [`runner-dom-differs-from-builder`](#runner-dom-differs-from-builder)                                                                                                                                                                                                                                                                                                                              |
| [Analog](#analog)                                         | [`analog-behind-angular-build`](#analog-behind-angular-build), [`analog-fast-compile-ctor-injection`](#analog-fast-compile-ctor-injection), [`analog-module-cache-inline-styles`](#analog-module-cache-inline-styles), [`analog-testbed-laxer-than-builder`](#analog-testbed-laxer-than-builder), [`angular-testbed-split`](#angular-testbed-split)                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [Моки и общее окружение](#mocks-and-shared-environments)  | [`module-mock-leak`](#module-mock-leak), [`shared-env-without-restore`](#shared-env-without-restore), [`mock-reset-config-unread`](#mock-reset-config-unread), [`mock-registry-capture-drops-sentinel`](#mock-registry-capture-drops-sentinel)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [Покрытие](#coverage)                                     | [`coverage-all-removed`](#coverage-all-removed), [`coverage-include-recompiles-globs`](#coverage-include-recompiles-globs), [`coverage-include-misses-bundle`](#coverage-include-misses-bundle)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [Переход на Vitest 5](#vitest-5-upgrade)                  | [`vitest-5-removed`](#vitest-5-removed), [`vitest-5-deprecated`](#vitest-5-deprecated), [`vitest-5-clear-mocks`](#vitest-5-clear-mocks), [`vitest-5-available`](#vitest-5-available), [`fs-module-cache-not-persisted`](#fs-module-cache-not-persisted), [`vitest-5-bundled-package`](#vitest-5-bundled-package), [`vitest-5-matchers-augmentation`](#vitest-5-matchers-augmentation), [`vitest-5-nested-hoist`](#vitest-5-nested-hoist), [`vitest-5-empty-throw-message`](#vitest-5-empty-throw-message), [`vitest-5-prune-mock-registry`](#vitest-5-prune-mock-registry), [`vitest-5-project-own-server`](#vitest-5-project-own-server), [`vitest-5-extends-restated`](#vitest-5-extends-restated), [`vitest-5-report-path`](#vitest-5-report-path), [`vitest-5-vite-peer`](#vitest-5-vite-peer) |
| [Эта библиотека](#this-library)                           | [`vitest-entry-without-vitest`](#vitest-entry-without-vitest), [`helper-from-wrong-entry`](#helper-from-wrong-entry), [`no-unawaited-helper`](#no-unawaited-helper), [`no-agent-instructions`](#no-agent-instructions), [`scan-cap-reached`](#scan-cap-reached)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### Конфиги TypeScript {#typescript-configs}

#### `tsconfig-glob-matches-nothing` {#tsconfig-glob-matches-nothing}

**Находит** паттерн `include` в tsconfig, под который не подходит ни один файл. Это ошибка, когда рядом
с конфигом лежат спеки, и заметка для библиотеки, в которой их пока нет.

**Почему важно:** паттерн, который ни с чем не совпадает, ничего и не проверяет, а `tsc` всё равно
сообщает об успехе. Редактор показывает в спеке `Cannot find name 'vi'`, а CI остаётся зелёным.

**Как исправить:** поправьте глоб или удалите запись.

```diff
- "include": ["src*.spec.ts"]
+ "include": ["src/**/*.spec.ts"]
```

Не сообщается:

- глоб только для деклараций (`src/**/*.d.ts`) — часто это заготовка под типы, которых ещё нет;
- паттерн внутри директории, которую сканирование пропускает (`dist`, `out-tsc`, `coverage` или
  игнорируемая git), даже если её ещё нет — паттерн в `src/generated/` в порядке до запуска генератора;
- запись выше сканируемой директории (`../shared/**/*.ts`);
- любой паттерн, если сканирование упёрлось в предел ([`scan-cap-reached`](#scan-cap-reached)).

Запись-директория (`src`, `src/**/*`) учитывает не только TypeScript, но и файлы `.vue` и `.svelte`.

#### `tsconfig-file-missing` {#tsconfig-file-missing}

**Находит** запись `files` в tsconfig, которая называет несуществующий файл.

**Почему важно:** когда раннер тестов перестаёт использовать конфиг, его читают только редакторы, и
об отсутствующем файле никто не сообщает.

**Как исправить:** удалите запись или укажите новый путь к файлу.

Файл проверяется на диске, так что запись с `../`, файл из `.gitignore` и упёршееся в предел
сканирование обрабатываются верно. Как и для `include`, не сообщается об отсутствующем `.d.ts`
(сгенерированном `auto-imports.d.ts` или `next-env.d.ts`) и о пути внутри пропускаемой или
игнорируемой директории.

### Спеки и импорты {#spec-files-and-imports}

#### `spec-imported-by-non-spec` {#spec-imported-by-non-spec}

**Находит** рабочий модуль, который импортирует файл `*.spec.ts`.

**Почему важно:** в общем окружении такой импорт — цикл, и спека теряет собственные тесты.

**Как исправить:** вынесите то, что нужно модулю, из спеки в обычный файл и импортируйте его.

#### `spec-exports-fixture` {#spec-exports-fixture}

**Находит** спеку, которая импортирует другую спеку.

**Почему важно:** тесты импортированного файла собираются дважды, а его хуки выполняются в контексте
чужого файла.

**Как исправить:** вынесите общую фикстуру в файл, который не является спекой.

```ts
// user.fixture.ts — не спека, поэтому импорт не собирает тестов
export const aUser = { id: 1, name: 'Ada' };
```

### Остатки другого раннера {#leftovers-from-another-runner}

#### `foreign-runner-pragma` {#foreign-runner-pragma}

**Находит** docblock-прагмы Jest, оставшиеся в спеке, с номерами строк.

**Почему важно:** одни не читает никто, а остальные выглядят как недоделанная миграция.

**Как исправить:**

- `@jest-config` и `@jest-environment` без имени: здесь их не читает ни один раннер. Предупреждение;
  удалите их.
- `@jest-environment <name>` и `@jest-environment-options`: Vitest 5 и Rstest читают их так же, как
  написание `@vitest-`. Заметка; переименуйте их.

```diff
- /** @jest-environment jsdom */
+ /** @vitest-environment jsdom */
```

#### `dead-runner-config` {#dead-runner-config}

**Находит** `jest.config.*` или `karma.conf.*` для раннера, который не установлен. Предупреждение.

**Почему важно:** это первый файл, который читает новичок или агент, чтобы понять, как запускаются
тесты.

**Как исправить:** удалите его.

#### `orphan-runner-file` {#orphan-runner-file}

**Находит** setup-файл, на который ссылался только мёртвый конфиг раннера.

**Почему важно:** он ничего не настраивает, но выглядит как часть тестовой настройки. Один такой файл
год был пустым.

**Как исправить:** удалите его вместе с мёртвым конфигом.

#### `jasmine-era-project` {#jasmine-era-project}

**Находит** репозиторий, в котором ещё есть jasmine: `jasmine-core`, `@types/jasmine`,
`jasmine-auto-spies`, `@hirez_io/observer-spy`, пакет `karma*`, файл `karma.conf.*` или
`"types": ["jasmine"]` в tsconfig. Заметка, никогда не ошибка.

**Почему важно:** от порядка миграции зависит, переписываете вы зелёные тесты или красные.

**Как исправить:** переводите в таком порядке:

1. Переключите спеки на [`vitest-auto-spy/jasmine`](/ru/migrating-jasmine) и добейтесь зелёного прогона.
2. Запустите `codemod --from jasmine` и уберите этот импорт.

### Angular-билдер {#angular-builder}

#### `angular-build-splitting-off` {#angular-build-splitting-off}

**Находит** `@angular/build` от 22.1.5 и до 22.1.7, не включая её.

**Почему важно:** эти версии собирают бандл unit-тестов без разделения кода. С `--coverage` память
растёт на сотни мегабайт без плато и без предупреждений: прогон идёт долго или его убивают.

**Как исправить:** обновите `@angular/build` до 22.1.7 или новее, где разделение включено по умолчанию.
Затем уберите `"splitting": false` из целей, которые называет находка (22.2.0 объявляет опцию
устаревшей). `setupAutoSpy()` тоже предупреждает об этом раз на воркер внутри затронутого прогона.
Подробности и обходной путь — [когда сборка unit-тестов идёт без разделения кода](/ru/guides/angular-unit-test-builder#when-the-unit-test-build-has-code-splitting-off).

#### `angular-build-splitting-deprecated` {#angular-build-splitting-deprecated}

**Находит** unit-test цель на `@angular/build` 22.2.0 или новее, которая задаёт `"splitting"` — в
`options`, конфигурации или значении по умолчанию для цели в Nx.

**Почему важно:** 22.2.0 объявляет опцию устаревшей («No longer needed with Vitest 5»).

- `"splitting": true` — значение по умолчанию и ничего не меняет. Заметка.
- `"splitting": false` по-прежнему собирает каждую спеку отдельным самодостаточным бандлом, с той ценой
  по памяти, которую описывает [`angular-build-splitting-off`](#angular-build-splitting-off).
  Предупреждение.

**Как исправить:** уберите ключ из цели, которую называет находка.

#### `angular-build-istanbul-module-cache` {#angular-build-istanbul-module-cache}

**Находит** цель `@angular/build:unit-test` или `@nx/angular:unit-test` на `@angular/build` 21 или новее
и Vitest 5, которая считает покрытие через istanbul, а её конфиг раннера не включает `fsModuleCache`.
Istanbul засчитывается, когда конфиг раннера задаёт `coverage.provider: 'istanbul'` или когда
`@vitest/coverage-istanbul` установлен без `@vitest/coverage-v8`.

**Почему важно:** билдер уже собрал код в бандл, так что единственный медленный шаг, который осталось
кэшировать, — инструментирование istanbul. Тёплый кэш сокращал такие прогоны на 19–46 %.

**Как исправить:** добавьте `fsModuleCache: true` в конфиг раннера, который называет находка. Если у
цели его нет, сначала добавьте ей `"runnerConfig"`: своей опции для этого у билдера нет.

```ts
// vitest-base.config.mts — runnerConfig цели
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { fsModuleCache: true } });
```

- Если ваш CI не сохраняет `node_modules/.vitest-cache` между прогонами, исправление предложит
  кэшировать и его, как [`fs-module-cache-not-persisted`](#fs-module-cache-not-persisted). Каждый
  свежий checkout начинает с холодного кэша.
- Альтернатива — `coverage.provider: 'v8'`, которому кэш не нужен. С v8 кэш ничего не даёт, и проверка
  молчит.
- Тёплый кэш подхватывал правки `.ts`-импортов и `.html` компонентов с обоими провайдерами.

Молчит на `@angular/build` 20 (конфиг раннера не читается), на Vitest 4 (не замерялось) и для цели,
которая идёт в `browsers`, если её конфиг раннера сам не называет istanbul. Цели с общим конфигом
раннера сообщаются один раз.

#### `angular-build-happy-dom` {#angular-build-happy-dom}

**Находит** unit-test цель на `@angular/build` 21 или новее, которая идёт на jsdom только потому, что
`happy-dom` не установлен: `jsdom` установлен, цель не идёт в `browsers`, а её конфиг раннера не
задаёт `environment`. Заметка.

**Почему важно:** с 21 билдер сам выбирает happy-dom, когда может его найти. happy-dom немного быстрее
и ест меньше памяти.

**Как исправить:** установите его; строка в конфиге не нужна.

```bash
npm i -D happy-dom
```

happy-dom реализует меньше браузерной платформы, чем jsdom. После установки прогоните тесты один раз;
если какая-то спека падает на том, чего в happy-dom нет, удалите его обратно.

#### `angular-cache-off-in-ci` {#angular-cache-off-in-ci}

**Находит** `angular.json` с целями `@angular/build:unit-test`, конфиг CI и кэш сборки, которым CI
так и не пользуется. Заметка.

**Почему важно:** `cli.cache.environment` по умолчанию `local`, так что на каждом прогоне CI билдер
компилирует все тесты с нуля.

**Как исправить:** включите кэш для CI и сохраняйте `.angular/cache` (или ваш `cli.cache.path`) между
прогонами CI с ключом по хэшу lock-файла.

```json
{ "cli": { "cache": { "environment": "all" } } }
```

Проверка срабатывает и тогда, когда `environment` уже `all` или `ci`, но ни один конфиг CI эту
директорию не кэширует: тогда каждый прогон начинает с пустого кэша. `environment: none` и
`enabled: false` считаются осознанным решением и не сообщаются.

#### `builder-setup-unreached` {#builder-setup-unreached}

**Находит** цель `@angular/build:unit-test` или `@nx/angular:unit-test`, в опциях которой (с учётом
`targetDefaults` из `nx.json`) нет ни `setupFiles`, ни `runnerConfig`, хотя у проекта есть setup-файл:
его перечисляет конфиг Vitest (включая `vitest-base.config.*`) или существует `src/test-setup.ts`.

**Почему важно:** билдер этот setup-файл никогда не запускает. Под этой целью нет `setupAutoSpy()`, его
опции `strict`, ваших матчеров и адаптера моков.

**Как исправить:** добавьте цели опцию `setupFiles`.

```json
"test": {
  "builder": "@angular/build:unit-test",
  "options": { "setupFiles": ["src/test-setup.ts"] }
}
```

`targetDefaults` в `nx.json` может задать её всем проектам с той же раскладкой. Подойдёт и
`runnerConfig`, указывающий на конфиг Vitest.

#### `runner-dom-differs-from-builder` {#runner-dom-differs-from-builder}

**Находит** `vitest.config.*` или `vite.config.*`, где задано `environment: 'jsdom'`, в workspace, где
установлены и `jsdom`, и `happy-dom`, а unit-test цель идёт на happy-dom. Предупреждение.

**Почему важно:** этот конфиг читают `vitest run` и ваша IDE, а билдер — нет, и он выбирает happy-dom.
Одни и те же спеки идут на двух разных DOM, так что спека может пройти под `vitest run` и упасть под
`ng test` / `nx test`, или наоборот.

**Как исправить:** используйте happy-dom в обоих местах — `environment: 'happy-dom'` в конфиге раннера.
Спека, которой нужен jsdom, оставляет его комментарием в начале файла:

```ts
// @vitest-environment jsdom
```

Конфиг в корне репозитория покрывает все цели, конфиг в директории проекта — цели под ней. Молчит для
цели, которая идёт в `browsers`, и для конфига, который цель называет своим `runnerConfig`: его билдер
читает.

### Analog {#analog}

#### `analog-behind-angular-build` {#analog-behind-angular-build}

**Находит** `@angular/build` 22.2.0 или новее рядом с `@analogjs/vite-plugin-angular` старше 2.7.5.

**Почему важно:** прогон умирает на старте, до сбора первой спеки, с ошибкой, которая не называет ни
один из пакетов:

```
TypeError: cache.has is not a function
```

**Как исправить:** обновите `@analogjs/vite-plugin-angular` и `@analogjs/vitest-angular` до 2.7.5 или
новее.

Проверка молчит, если один из пакетов не установлен.

#### `analog-fast-compile-ctor-injection` {#analog-fast-compile-ctor-injection}

**Находит** включённый `fastCompile` Analog в JIT-режиме (`jit` не равен `false` — это умолчание под
Vitest) вместе с классом `@Injectable`, у которого параметр конструктора известен только по типу.

**Почему важно:** в этом режиме Analog не выдаёт метаданных параметров для классов `@Injectable`, и у
Angular нет токена для параметра. `TestBed.inject`, `Injector.create` и `createWithAutoSpies` бросают
NG0202 («dependency at index N of the parameter list is invalid»).

**Как исправить:** один из вариантов:

```ts
import { Inject, Injectable, inject } from '@angular/core';

@Injectable()
export class CartService {
  private readonly tax = inject(TaxService); // 1. поле с inject()
}

@Injectable()
export class OrderService {
  constructor(@Inject(TaxService) private readonly tax: TaxService) {} // 2. явный токен
}
```

`ng generate @angular/core:inject` переводит на вариант 1 весь проект. Третий вариант — не включать
`fastCompile`, пока плагин не начнёт выдавать метаданные. Компоненты, директивы и пайпы не затронуты;
параметр с `@Inject(X)` или значением по умолчанию не сообщается. Проверено на
`@analogjs/vite-plugin-angular` 2.7.5.

#### `analog-module-cache-inline-styles` {#analog-module-cache-inline-styles}

**Находит** включённый `fsModuleCache` (на верхнем уровне, в `experimental` или `--fsModuleCache` в
скрипте) на Vitest 4 или новее, в репозитории, где конфиг Vite или Vitest импортирует
`@analogjs/vite-plugin-angular` или `@analogjs/vitest-angular` без `jit: false`, и есть компонент со
встроенными `styles`.

**Почему важно:** в JIT-режиме — умолчании плагина для тестов — тёплый кэш не может загрузить
виртуальный модуль с этими стилями. Первый прогон проходит; со второго каждая спека, которая доходит до
такого компонента, падает с:

```
Cannot find module '/@id/__x00__virtual:angular:jit:style:inline;<hash>'
```

**Как исправить:** выключите кэш модулей, пока тесты идут через Analog.

Проверено на Analog 2.7.5, Angular 22.2 и Vitest 5.0.0; проверка действует для всех версий Analog, пока
релиз это не исправит. У `@angular/build:unit-test` такой проблемы нет: он собирает код в бандл до
того, как его увидит Vitest.

#### `analog-testbed-laxer-than-builder` {#analog-testbed-laxer-than-builder}

**Находит** вызов `setupTestBed()` из `@analogjs/vitest-angular/setup-testbed` без
`errorOnUnknownElements` или `errorOnUnknownProperties` в workspace, где есть и цель
`@angular/build:unit-test` / `@nx/angular:unit-test`. Предупреждение.

**Почему важно:** Analog по умолчанию оставляет обе проверки выключенными, а билдер включает обе.
Опечатка в элементе или привязке input в шаблоне тогда только пишет в лог под `vitest run` и роняет тест
под `ng test` / `nx test`.

**Как исправить:** сделайте тот же вызов, что и билдер.

```ts
setupTestBed({ errorOnUnknownElements: true, errorOnUnknownProperties: true });
```

Флаг с любым значением считается решением и не сообщается. Вызов, чьи опции — не объектный литерал, не
читается. Переименованный импорт (`setupTestBed as setup`) отслеживается.

#### `angular-testbed-split` {#angular-testbed-split}

**Находит** конфиг раннера, который называет пакет Analog, в Angular-репозитории, где какой-то файл
импортирует `vitest-auto-spy/angular` или `/angular-http`, а ни один конфиг раннера не инлайнит этот
пакет. Предупреждение.

**Почему важно:** Vitest-плагин Analog инлайнит `@angular/core/testing`, а Vitest выносит
`vitest-auto-spy` во внешние зависимости (грузит его из `node_modules` как есть). Тогда `/angular`
получает второй `TestBed`, который никто не инициализировал, и `injectSpy` бросает ошибку, хотя ваш
setup-файл его инициализирует:

```
Need to call TestBed.initTestEnvironment() first
Cannot read properties of null (reading 'ngModule')
```

**Как исправить:** инлайните пакет в блоке `test`.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { server: { deps: { inline: ['vitest-auto-spy'] } } } });
```

`inline: true` или `noExternal`, который называет пакет, тоже засчитываются.

### Моки и общее окружение {#mocks-and-shared-environments}

#### `module-mock-leak` {#module-mock-leak}

**Находит** модуль, который в одной спеке замокан фабрикой, а в другой — автомоком или
`{ spy: true }`, когда файлы делят окружение. Находка говорит, какая настройка его делит:

- `isolate: false` в конфиге Vitest;
- умолчание unit-test билдера Angular с `@angular/build` 21, если опция `isolate` цели или её конфиг
  раннера не задают `isolate: true`. 20.x сохраняет изоляцию Vitest по файлам.

**Почему важно:** Vitest отдаёт фабрику более позднему автомоку. Когда два файла попадают в один воркер,
автомок падает с `No "X" export is defined on the mock`; иначе прогон проходит.

**Как исправить:** мокайте модуль одинаково в обоих файлах или вызывайте `vi.resetModules()` перед
импортом.

```ts
vi.mock('./api', () => ({ fetchUser: vi.fn() })); // эта форма — в каждой спеке, которая мокает ./api
```

Находка перечисляет файлы с фабрикой и называет модуль так, как его назовёт ошибка.

#### `shared-env-without-restore` {#shared-env-without-restore}

**Находит** Angular-тесты, которые используют этот пакет и делят одно окружение между файлами, без
опций `setupAutoSpy`, которые убирают за файлом. Заметка. Общее окружение — это `isolate: false` в
конфиге раннера, `--no-isolate` / `--isolate=false` в скрипте или умолчание unit-test билдера с
Angular 21.

**Почему важно:** `vi.spyOn`, отложенный таймер, слушатель на `window` или вручную заданная глобальная
переменная из одного файла роняют следующий файл, который их не трогал.

**Как исправить:** включите опции, которые называет находка (она перечисляет только ещё выключенные):

```ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ restoreMocks: true, strayTimers: true, strayListeners: true, restoreGlobals: true });
```

`preset: 'strict'` засчитывается за `strayTimers`. Помогает и возврат изоляции для файлов, которые
протекают.

#### `mock-reset-config-unread` {#mock-reset-config-unread}

**Находит** запись правила линтера `no-redundant-mock-reset`, в опциях которой есть `configFile` и нет
флагов, а этот файл экспортирует не `defineConfig(…)` / `defineProject(…)`, а что-то другое — вашу
фабрику или `mergeConfig(…)`. Заметка.

**Почему важно:** правило читает конфиг как текст и не видит флагов, которые ставит фабрика. Тогда оно
считает `clearMocks` выключенным до Vitest 4 и включённым с Vitest 5, что бы ни делала фабрика.

**Как исправить:** запишите флаги рядом с `configFile`. Запись с `configFlags` не сообщается.

```js
'vitest-auto-spy/no-redundant-mock-reset': ['error', { configFile: 'vitest.config.ts', configFlags: { clearMocks: true } }],
```

Читается только `configFile`-литерал, относительно корня репозитория.

#### `mock-registry-capture-drops-sentinel` {#mock-registry-capture-drops-sentinel}

**Находит** тесты, которые сами перехватывают реестр моков Vitest — патчат `Set.prototype.forEach`
(присваиванием, `defineProperty` или `vi.spyOn`) и вызывают `vi.clearAllMocks()`, пока патч стоит, — в
файле, где ни разу не упомянут `vitest-auto-spy.sweepSentinel`. Предупреждение.

**Почему важно:** через одну запись реестра `vi.clearAllMocks()` и `clearMocks: true` добираются до
спаев этого пакета. Чистильщик, который её выбрасывает, молча перестаёт очищать все авто-спаи.

**Как исправить:** пропускайте эту запись в своём чистильщике:

```ts
if (Symbol.for('vitest-auto-spy.sweepSentinel') in mock) continue;
```

Или замените свой перехват на `setupAutoSpy({ pruneMockRegistry: true })`, который эту запись
сохраняет. На Vitest 5 реестр держит `WeakRef` и не растёт, так что перехват можно удалить.

### Покрытие {#coverage}

#### `coverage-all-removed` {#coverage-all-removed}

**Находит** `coverage.all` в конфиге на Vitest 4 или новее.

**Почему важно:** Vitest 4 удалил ключ без переименования. Его никто не читает и никто не предупреждает,
так что отчёт молча покрывает только те файлы, которые импортировал прогон.

**Как исправить:** удалите его и перечислите исходники, которые должен покрывать отчёт, в
`coverage.include`.

#### `coverage-include-recompiles-globs` {#coverage-include-recompiles-globs}

**Находит** область покрытия из множества глобов на Vitest 4.

**Почему важно:** Vitest 4 заново компилирует каждый глоб для каждого проверяемого файла. Ничего не
падает, просто шаг покрытия идёт медленно. Vitest 5 компилирует список один раз.

**Как исправить:** перейдите на Vitest 5. Под `@angular/build:unit-test` для этого нужен
`@angular/build` 22.2.0 или новее, и исправление об этом скажет. На Vitest 4 используйте рецепт со
своим провайдером из раздела [сопоставление покрытия дороже самого покрытия](/ru/guides/angular-unit-test-builder#coverage-matching-costs-more-than-coverage).

#### `coverage-include-misses-bundle` {#coverage-include-misses-bundle}

**Находит** `coverage.include` только из глобов исходников в конфиге раннера цели
`@angular/build:unit-test`: в файле, который называет её `runnerConfig`, или — при
`runnerConfig: true` — в `vitest-base.config.*` в корне проекта или workspace.

**Почему важно:** под билдером покрытие сопоставляется дважды — сначала с выполненными чанками бандла,
потом с исходниками после ремаппинга. Список глобов `.ts` теряет все счётчики на первом шаге, и прогон
остаётся зелёным с пустым отчётом.

**Как исправить:** см. [покрытие под unit-test билдером](/ru/guides/angular-unit-test-builder#coverage-under-the-unit-test-builder).

### Переход на Vitest 5 {#vitest-5-upgrade}

Эти проверки находят то, что ломается или меняется при переходе с Vitest 4 на 5. Если в записи не
сказано иное, находка — **ошибка на Vitest 5** (сломано уже сейчас) и **заметка на Vitest 4** (почините
до перехода; код выхода не меняется).

Каждая проверка читает версию Vitest из ближайшего `node_modules` вверх по дереву. Vitest также
считается установленным, если его объявляет `package.json` корня workspace — подъём останавливается на
первой директории с полем `workspaces`, `.git` или `pnpm-workspace.yaml`, — так что `doctor` работает
и внутри пакета workspace.

#### `vitest-5-removed` {#vitest-5-removed}

**Находит** то, что удалил Vitest 5:

| Найдено                                                      | Вместо этого                          |
| ------------------------------------------------------------ | ------------------------------------- |
| импорт из `vitest/reporters` или `vitest/coverage`           | `vitest/node`                         |
| импорт из `vitest/environments` или `vitest/snapshot`        | `vitest/runtime`                      |
| импорт из `vitest/runners` или `vitest/suite`                | `TestRunner` из `vitest`              |
| импорт из `vitest/mocker`                                    | `@vitest/mocker`                      |
| `.sequential` у `test`, `it`, `describe` или `suite`         | `{ concurrent: false }`               |
| `--outputJson` или `--compare` в скрипте, запускающем Vitest | `--reporter=json --outputFile=<path>` |
| `benchmark.outputJson` или `benchmark.compare` в конфиге     | `writeResult` с `bench.from()`        |

**Почему важно:** на Vitest 5 каждое из этого ломается: импорт перестаёт разрешаться, сбор тестов
бросает ошибку, команда останавливается с `Unknown option` или ключ молча игнорируется.

**Как исправить:** используйте замену. Новые импорты и `{ concurrent: false }` работают уже на Vitest
4.1, так что правку можно внести до перехода. До Vitest 4 проверка молчит: сначала пройдите миграцию
на Vitest 4. Опция теста `{ sequential: true }` не читается.

**Также сообщается:** `poolOptions` в конфиге на Vitest 4 или новее — предупреждением. Vitest 4 удалил
эту опцию, печатает одну строку об устаревании и работает без всего, что внутри, так что `singleFork`
или ограничение потоков там ничего не делают. Перенесите каждую опцию на верхний уровень, как велит
гайд миграции Vitest 4.

**Не сообщается:**

- `test.workspace` — Vitest 4 и 5 оба бросают ошибку на старте и называют `test.projects`, так что в
  зелёных тестах его не бывает;
- переименованные ключи, которые Vitest 5 ещё понимает (`experimental.fsModuleCache` и
  `experimental.fsModuleCachePath`, теперь на верхнем уровне; `browser.isolate`,
  `browser.fileParallelism` и `browser.api`, теперь верхнеуровневые `isolate`, `fileParallelism`,
  `api`; `deps.optimizer.web`, теперь `deps.optimizer.client`; `cache.dir`, теперь `cacheDir` из Vite),
  — Vitest 5 на каждом прогоне печатает предупреждение с заменой, а на Vitest 4 нового написания ещё
  нет.

#### `vitest-5-deprecated` {#vitest-5-deprecated}

**Находит** `experimental_clearCache()` или `experimental_parseSpecifications()` на Vitest 5. Заметка.

**Почему важно:** Vitest 5 их переименовал. Старые имена ещё работают, но во время прогона никто не
предупреждает; `@deprecated` есть только в типе.

**Как исправить:** вызывайте `clearCache()` и `parseSpecifications()`. На Vitest 4, где других имён
нет, проверка молчит.

#### `vitest-5-clear-mocks` {#vitest-5-clear-mocks}

**Находит**, в зависимости от версии:

- **на Vitest 5** — явный `clearMocks: true` в конфиге: он повторяет умолчание;
- **на Vitest 4** — репозиторий, где конфиги нигде не задают `clearMocks` (и `mockReset: true`, который
  тоже очищает), а скрипты Vitest не передают `--clearMocks`.

**Почему важно:** Vitest 5 включает `clearMocks` по умолчанию. Он вызывает `vi.clearAllMocks()` перед
каждым тестом, а тот стирает записанные вызовы каждого мока и оставляет реализацию. После перехода тест,
который считает вызовы из `beforeAll` или из предыдущего `it`, начинает падать.

**Как исправить:** на Vitest 5 удалите лишнюю строку. На Vitest 4 узнайте цену заранее:

```bash
npx vitest run --clearMocks
```

Под `@angular/build:unit-test` задайте `clearMocks: true` в конфиге раннера на этот один прогон.
`clearMocks: false` сохранит сегодняшнее поведение и после перехода.

#### `vitest-5-available` {#vitest-5-available}

**Находит**, на Vitest 4, можно ли перейти на Vitest 5. Заметка.

**Почему важно:** с покрытием Vitest 5 прогнал Angular 22.2 проект из 700 спек на 35–46 % быстрее; без
покрытия версии идут вровень. Подробности — в разделе
[Vitest 5 под unit-test билдером Angular](/ru/core/performance#vitest-5-under-the-angular-unit-test-builder).

**Как исправить:** если переходу ничего не мешает, переходите. Иначе заметка называет, что мешает, и
как это исправить:

- `@angular/build` старше 22.2.0 рядом с целью `@angular/build:unit-test` — 22.2.0 первый билдер,
  который запускает Vitest 5;
- `@analogjs/vite-plugin-angular` или `@analogjs/vitest-angular` старше 2.7.5;
- `vite` старше 6.4;
- Node старше 22.12 в `.nvmrc`, `.node-version`, конфиге CI (`node-version:` или образ `node:`) или в
  `engines` приватного пакета. `engines` публикуемого пакета не учитывается: он описывает его
  пользователей, а не то, где идут его тесты.

Vitest 2 и 3 заметки не получают: замер сравнивает Vitest 4 с 5.

#### `fs-module-cache-not-persisted` {#fs-module-cache-not-persisted}

**Находит** включённый `fsModuleCache` (на верхнем уровне, в `experimental` или `--fsModuleCache` в
скрипте) на Vitest 4 или новее, когда ни один конфиг CI не кэширует директорию кэша. Конфиги CI — это
`.github/workflows/*.yml`, `.gitlab-ci.yml`, `.gitlab/**/*.yml`, `.circleci/config.yml`,
`azure-pipelines.yml` и `bitbucket-pipelines.yml`.

**Почему важно:** каждый прогон CI начинает с пустого кэша и платит полное преобразование, так что
настройка помогает только локально.

**Как исправить:** кэшируйте директорию в CI с ключом по хэшу lock-файла (Vitest сам очищает кэш, когда
меняется lock-файл). Директория — это `fsModuleCachePath`, а по умолчанию `node_modules/.vitest-cache`
на Vitest 5 и `node_modules/.experimental-vitest-cache` на Vitest 4.

```yaml
test:
  cache:
    key:
      files: [package-lock.json]
    paths: [node_modules/.vitest-cache]
```

- Конфиг CI считается кэширующим, если называет путём эту директорию или родительскую, например
  `node_modules`.
- `cache: npm` в `actions/setup-node` не считается: он хранит кэш загрузок npm, а не `node_modules`.
- `npm ci` удаляет `node_modules` перед установкой. Если CI его запускает, направьте
  `fsModuleCachePath` за пределы `node_modules` и кэшируйте ту директорию.

#### `vitest-5-bundled-package` {#vitest-5-bundled-package}

**Находит** импорт `@vitest/expect` или `@vitest/runner` или `declare module '@vitest/expect'`.

**Почему важно:** Vitest 5 встраивает оба пакета в себя и больше от них не зависит. Импорт разрешается в
устаревшую отдельную копию или никуда: `expect.extend` через него ничего не регистрирует на том
`expect`, который вызывают ваши тесты, а расширение типов ничего не типизирует.

**Как исправить:** импортируйте из `vitest` (`expect`, `MatcherState`, `ExpectationResult`,
`getCurrentTest`, `getCurrentSuite`, `createTaskCollector`), пишите `declare module 'vitest'` и уберите
пакеты из `package.json`.

#### `vitest-5-matchers-augmentation` {#vitest-5-matchers-augmentation}

**Находит** `interface Matchers<T = any>` с одним параметром внутри `declare module 'vitest'` или
матчеры, объявленные на глобальном `jest.Matchers`.

**Почему важно:** Vitest 5 объявляет `Matchers<R, T>`, так что форма с одним параметром больше не
сливается. В файле `.ts` это TS2428; в `.d.ts` под `skipLibCheck` ошибки нет вовсе, а ваши матчеры
возвращают не тот тип. Глобального `jest.Matchers` тоже больше нет, так что объявленных там матчеров
при вызове нет (TS2339).

**Как исправить:** объявите оба параметра. Эта форма компилируется только на Vitest 5, так что меняйте
её вместе с переходом.

```ts
declare module 'vitest' {
  interface Matchers<R, T> {
    toBeFoo(): R;
  }
}
```

#### `vitest-5-nested-hoist` {#vitest-5-nested-hoist}

**Находит** `vi.mock`, `vi.unmock` или `vi.hoisted` внутри блока: `describe`, хука, вспомогательной
функции.

**Почему важно:** Vitest 4 предупреждал; Vitest 5 бросает ошибку при сборе файла («… defined outside of
the module's top level scope»).

**Как исправить:** перенесите вызов на верхний уровень файла — Vitest всё равно поднимает его туда.
Если мок должен различаться от теста к тесту, используйте `vi.doMock` и динамический `import()` внутри
этого теста. Файл с тестами в исходниках (`import.meta.vitest`) исключён, как и в самом Vitest.

#### `vitest-5-empty-throw-message` {#vitest-5-empty-throw-message}

**Находит** `.toThrow('')`. Предупреждение.

**Почему важно:** Vitest 4 читал пустую строку как «пустое сообщение». На Vitest 5 пустая строка входит
в любое сообщение, так что `.toThrow('')` проходит на любой ошибке, а `.not.toThrow('')` падает на любой.

**Как исправить:**

```ts
expect(run).not.toThrow(); // «ничего не бросает»
expect(run).toThrow(/^$/); // «бросает с пустым сообщением»
```

#### `vitest-5-prune-mock-registry` {#vitest-5-prune-mock-registry}

**Находит** `pruneMockRegistry: true` или `trackMockRegistry()` на Vitest 5. Заметка, только Vitest 5.

**Почему важно:** там это ничего не делает. Реестр держит `WeakRef`, а очистка обходит только моки,
вызванные с последней очистки, так что расти нечему.

**Как исправить:** удалите после перехода. На Vitest 4 с `isolate: false` это ещё помогает.

#### `vitest-5-project-own-server` {#vitest-5-project-own-server}

**Находит** встроенный проект со своей опцией Vite: `plugins`, `resolve`, любым ключом верхнего уровня,
кроме `test`, `extends` и `define`, или `test.alias`, `test.browser`, `test.css`, `test.mode` или
`test.root`. Заметка, только Vitest 5.

**Почему важно:** на Vitest 5 встроенные проекты делят Vite-сервер конфига, который их объявил
(`sharedViteServer`). Проект со своими опциями Vite на каждом прогоне поднимает ещё один сервер и
наполняет ещё один кэш преобразований.

**Как исправить:** держите опции Vite в корневом конфиге, откуда их наследует каждый встроенный проект,
и удалите те, что повторяют корень. Пустой `plugins: []` не считается, а конфиг с
`sharedViteServer: false` не сообщается.

#### `vitest-5-extends-restated` {#vitest-5-extends-restated}

**Находит** `extends: true` у встроенного проекта. Заметка, только Vitest 5.

**Почему важно:** с Vitest 5 встроенный проект наследует объявивший его конфиг, если не сказано
`extends: false`, так что строка повторяет умолчание.

**Как исправить:** удалите её.

#### `vitest-5-report-path` {#vitest-5-report-path}

**Находит** скрипт или строку CI, которые полагаются на старые пути отчётов. Предупреждение.

**Почему важно:** на Vitest 5 `--reporter=json` или `junit` без `--outputFile` пишет в
`.vitest/json/output.json` или `.vitest/junit/output.xml`, а не в stdout, так что перенаправление или
пайп получают пустоту. Blob-отчёты и `--merge-reports` переехали из `.vitest-reports` в `.vitest/blob`.

**Как исправить:** передайте `--outputFile.<reporter>=<path>` и читайте этот файл; на Vitest 4 это
работает так же. Для blob используйте `.vitest/blob` или сохраните старую директорию через
`--outputFile.blob` на каждом шарде и `--merge-reports .vitest-reports` при объединении.

```bash
npx vitest run --reporter=json --outputFile.json=reports/vitest.json
```

Проверка читает скрипты и строки CI, а также любое упоминание `.vitest-reports`, если туда не пишет
какой-нибудь `outputFile`.

#### `vitest-5-vite-peer` {#vitest-5-vite-peer}

**Находит** репозиторий на Yarn (`yarn.lock`), который не объявляет `vite`.

**Почему важно:** Vitest 5 берёт `vite` как peer-зависимость, а Yarn peer-зависимости не ставит. Прогон
получает ту версию, которую притащил другой пакет (предупреждение), или никакую (ошибка).

**Как исправить:** добавьте `vite` в `devDependencies` в диапазоне, который принимает Vitest 5:
`^6.4.0`, `^7` или `^8`.

```bash
yarn add -D vite@^7
```

### Эта библиотека {#this-library}

#### `vitest-entry-without-vitest` {#vitest-entry-without-vitest}

**Находит** файл, который импортирует точку входа, загружающую `vitest`, — корневой `vitest-auto-spy`,
`/angular`, `/angular/*`, `/angular-http`, `/angular-router`, `/dom-stubs`, `/jasmine`, `/react`,
`/setup`, `/signal-forms`, `/svelte` или `/vue`, — в репозитории, где `vitest` не установлен. Ошибка.

**Почему важно:** импорт падает с «Cannot find package 'vitest'» раньше, чем выполнится код библиотеки,
так что сама библиотека не может объяснить причину. Может только `doctor`.

**Как исправить:** импортируйте точку входа своего раннера: `/bun` или `/bun-angular` на Bun, `/node` на
`node:test`, `/rstest` на Rstest.

```ts
import { createSpyFromClass } from 'vitest-auto-spy/node';
```

`/rxjs`, `/console`, `/nestjs`, `/zone`, `/observer-spy` и другие точки входа, не привязанные к раннеру,
грузятся где угодно и не сообщаются.

#### `helper-from-wrong-entry` {#helper-from-wrong-entry}

**Находит** хелпер, импортированный из точки входа, которая его не экспортирует, — например
`provideAutoSpy` из корня или `flushEventLoop` из `/angular`.

**Почему важно:** импорт падает там, где выполняется. Срабатывает обычно в файлах, которые не покрывает
ни одна программа `tsc`, так что проверка типов их не видела.

**Как исправить:** импортируйте из точки входа, которую называет находка.

```ts
import { provideAutoSpy } from 'vitest-auto-spy/angular';
```

`doctor` знает, какая точка входа владеет каким именем, из карты экспортов установленного пакета. См.
[Две проверки, которые разрешают имя](#the-two-checks-that-resolve-a-name).

#### `no-unawaited-helper` {#no-unawaited-helper}

**Находит** `expectEmission`, `expectError`, `stable`, `flushEventLoop` и похожие хелперы, вызванные
отдельной инструкцией без ожидания результата, с номерами строк.

**Почему важно:** возвращённый промис завершается после конца теста, так что его проверка отчитывается в
следующий тест или никуда. Прогон зелёный, и спека выглядит так, будто что-то проверила.

**Как исправить:** добавьте `await`.

```diff
- expectEmission(users.load$, [user]);
+ await expectEmission(users.load$, [user]);
```

Сообщается только вызов, который и начинает, и заканчивает инструкцию. Что именно считается — в разделе
[Две проверки, которые разрешают имя](#the-two-checks-that-resolve-a-name).

#### `no-agent-instructions` {#no-agent-instructions}

**Находит** репозиторий, где ни один `AGENTS.md`, `CLAUDE.md` или `GEMINI.md` не упоминает пакет.
Заметка.

**Почему важно:** агенты никогда не читают `node_modules`, поэтому не знают правил библиотеки.

**Как исправить:** запустите [`init`](#init-—-the-pointer-an-agent-actually-reads). Исправление читает
`.gitignore`:

- если часть файлов инструкций не в git, оно называет отслеживаемые для `init --only`;
- если не в git все, оно предлагает запустить `init` на своей машине.

Под `CI` (задан чем угодно, кроме пустой строки, `false` или `0`) проверка молчит, когда `.gitignore`
убирает из git все файлы инструкций: в CI их всё равно нет.

#### `scan-cap-reached` {#scan-cap-reached}

**Находит**, что сканирование файлов остановилось на страховочном пределе в 50 000 файлов.
Предупреждение, код 1.

**Почему важно:** все остальные проверки прочитали только часть дерева, и чистый результат был бы
ложью.

**Как исправить:** сузьте дерево через `--cwd` или поднимите предел:

```bash
VITEST_AUTO_SPY_SCAN_CAP=200000 npx vitest-auto-spy doctor
```

## Находки perf {#perf-findings}

Каждая находка `perf` ссылается на свою запись здесь. Находки гейта (`perf-gate-*`) описаны в разделе
[Гейт](#the-gate).

**Куда вписывать настройку.** `perf` читает конфигурацию, которую Vitest на самом деле собрал (на
Vitest 5), и никогда не советует против опции, которую вы задали сами. Под `@angular/build:unit-test`
билдер не читает `vitest.config.*`, поэтому находка называет конфиг раннера: файл из `--runner-config` в
`--command`, затем `runnerConfig` цели (`true` значит `vitest-base.config.*`). Цели без него сначала
советуют добавить `"runnerConfig": "vitest-base.config.mts"`. `@angular/build` 20.x конфиг раннера не
читает, и находка говорит, что настройка там недоступна.

### Советы по фазам {#advice-on-the-phases}

#### `perf-environment` {#perf-environment}

**Находит**, когда преобладает фаза `environment`, спеки, которым гарантированно не нужен DOM, по
убыванию времени окружения, которое они стоили.

**Почему важно:** строить DOM для спеки, которая его не трогает, — чистая потеря.

**Как исправить:** переведите эти спеки на окружение `node` — по комментарию на файл или через проект с
окружением `node`:

```ts
// @vitest-environment node
```

- **Называются только доказанные файлы.** Спека — кандидат, только если она, setup-файлы и все модули
  репозитория, которые они импортируют, прочитаны, ни один не упоминает имя из DOM, а каждый
  импортируемый пакет есть в коротком списке заведомо безопасных (`vitest`, `rxjs`, `date-fns`,
  `lodash`, `zod`, …). Всё, что правило не может разобрать, — **undecided**, а не «наверное, можно»:
  ошибочная догадка уронила бы ваши тесты с `document is not defined`.
- **Setup-файл может держать все спеки.** Когда setup-файл упоминает имя из DOM, все спеки дотягиваются
  до DOM. Тогда находка считает, что даст его разделение: ``With the DOM part moved out, 20 spec files
reach no DOM and could move to `node`, freeing 9.86s of environment.``
- **Экономия считается честно.** Окружение воркера экономится, только если все файлы, которые он
  выполнил, обходятся без DOM; когда из-за соседа с DOM перенос ничего не освобождает, находка так и
  говорит.

Спека, которая уже объявляет `@vitest-environment <name>` (или написание Jest, которое Vitest тоже
читает), кандидатом не считается.

#### `perf-environment-engine` {#perf-environment-engine}

**Находит**, когда преобладает построение DOM, что прогон идёт на `jsdom`, а ни один конфиг не
упоминает `happy-dom`. Называет конфиг, где задан `jsdom`.

**Почему важно:** спеки, которым DOM действительно нужен, всё равно за него платят. happy-dom строит его
дешевле по CPU; сколько вы выиграете, зависит от того, какую долю файла занимает окружение.

**Как исправить:** попробуйте happy-dom — по одному проекту, держа тесты зелёными после каждого:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'happy-dom' } });
```

happy-dom реализует меньше платформы, чем jsdom, так что это замена, которую надо проверить, а не
флаг, который можно просто переключить. Под `@angular/build:unit-test` с 21 билдер сам выбирает
happy-dom, когда может его найти, поэтому находка советует установить `happy-dom` и называет конфиг
раннера, только если тот сам задаёт `jsdom`. На `@angular/build` 20.x молчит.

#### `perf-transform` {#perf-transform}

**Находит**, на Vitest 5 при выключенном кэше модулей, что файлы 30 % и больше времени CPU ждали, пока
Vite преобразует модули. Печатает, сколько секунд они ждали.

**Почему важно:** эти модули преобразуются заново на каждом прогоне.

**Как исправить:** включите кэш модулей. Следующий прогон прочитает преобразованные модули из
`node_modules/.vitest-cache`, так что напечатанное ожидание — потолок экономии.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { fsModuleCache: true } });
```

В CI кэш помогает, только если джоба сохраняет эту директорию между пайплайнами. На Vitest 4 опция
называется `experimental.fsModuleCache`, а директория — `node_modules/.experimental-vitest-cache`.
Находка не срабатывает, если вы сами задали `fsModuleCache` — с любым значением.

Под `@analogjs/vite-plugin-angular` с компонентом, у которого есть встроенные `styles`, находка
становится предупреждением: тёплый кэш ломает эти спеки, как описано в
[`analog-module-cache-inline-styles`](#analog-module-cache-inline-styles). Под
`@angular/build:unit-test` совет в силе.

#### `perf-import` {#perf-import}

**Находит**, когда преобладает фаза `import`, каждую спеку, которая добирается до тестируемого кода
через баррель — модуль `index` или `public-api`, который только реэкспортирует.

**Почему важно:** спека, импортирующая баррель, грузит всё, что он реэкспортирует, ради одного экспорта.

**Как исправить:** импортируйте модуль напрямую.

```diff
- import { CartService } from '../shared';
+ import { CartService } from '../shared/cart.service';
```

Не находит, когда правка ничего бы не сэкономила: тот же баррель и так грузит другой импорт спеки,
обычно тестируемый модуль, или баррель — точка входа другого пакета: цель алиаса из tsconfig `paths`,
импортированная снаружи его каталога.

На Vitest 5 ожидание преобразования идёт в `transform`, так что `import` здесь — только выполнение
модулей. Под `@angular/build:unit-test` выключена: билдер раскрывает баррели в бандл ещё до того, как
Vitest что-то импортирует.

#### `perf-isolation` {#perf-isolation}

**Находит**, когда вместе преобладают `environment` + `setup` + `prepare`, что может помочь
`isolate: false`. На Vitest 5 ещё печатает, сколько воркеров запущено и их суммарное время старта, и
сколько времени по часам как минимум сэкономит переиспользование воркеров.

**Почему важно:** `isolate: false` платит за эти три фазы раз на воркер, а не раз на файл. Но по одному
прогону выигрыш не виден: на некоторых тестах работа переезжает внутрь файлов, а не исчезает.

**Как исправить:** сначала замерьте. `--ab-isolate` прогоняет тесты ещё раз с перевёрнутым `isolate` и
показывает оба времени как `perf-isolation-ab`:

```bash
npx vitest-auto-spy perf --ab-isolate
```

- Оставляйте `isolate: false`, только если пиковая память приемлема: без изоляции каждая подмена,
  созданная файлом, живёт до конца его воркера. См.
  [память при isolate: false](/ru/core/performance#memory-under-isolate-false).
- Разница меньше 5 % считается шумом, и каждая сторона — один замер.
- Если перевёрнутый прогон падает, это и есть находка (предупреждение): какой-то файл зависит от свежего
  графа модулей или от состояния, оставленного другим файлом.

Не предлагается, когда в прогоне уже `isolate: false`, когда пул — `vmThreads` или `vmForks` (каждый
файл и так получает свежий контекст) или когда `isolate` вы задали сами. `@angular/build:unit-test`
передаёт `isolate: false` с 21.0, но `test.isolate: true` в его конфиге раннера побеждает, а с 22.1
собственная опция `isolate` цели побеждает обоих.

#### `perf-pool` {#perf-pool}

**Находит**, на Vitest 5, прогон без заданного `pool` (значит, `forks`), с `isolate` не равным `false`,
окружением `jsdom` или `happy-dom` и фазами environment, setup и prepare на файл от 30 % времени CPU.

**Почему важно:** Vitest запускает для каждого файла новый процесс и в каждом строит DOM.
`pool: 'vmThreads'` сохраняет воркеры и вместо этого даёт каждому файлу новый VM-контекст.

**Как исправить:** попробуйте и оставьте, только если тесты зелёные, а пиковая память приемлема:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { pool: 'vmThreads' } });
```

Пул `vm` держит нативные модули воркера между файлами, так что ограничьте его через `vmMemoryLimit`.
Подтвердите через `npx vitest doctor` ([`perf-vitest-doctor`](#perf-vitest-doctor)).

#### `perf-workers` {#perf-workers}

**Находит**, на прогоне больше минуты суммарного времени CPU без заданного `maxWorkers`, что тесты берут
по воркеру на ядро. Советует половину ядер — в том конфиге раннера, который нашёл. Это единственная
находка о памяти, а не о времени.

**Почему важно:** каждый воркер — целая среда выполнения со своей памятью. Ограничение половиной ядер
стоило на замеренных проектах нескольких процентов времени по часам и экономило гигабайты памяти.

**Как исправить:**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { maxWorkers: 4 } }); // половина ядер 8-ядерной машины
```

Правильное число зависит от машины, а не от тестов: сравните время по часам до и после. На Vitest 5
число берётся из прогона (собранный `maxWorkers` или самая старшая использованная дорожка), так что
прогону, который никогда не занимал больше половины ядер, ограничивать их не советуют.

#### `perf-long-pole` {#perf-long-pole}

**Находит**, на Vitest 5, файл, который работал ещё не меньше 2 с и не меньше 30 % прогона после того,
как все остальные дорожки простаивали. Строка про дорожки есть в шапке в любом случае:

```text
15 lanes busy 40.5% of the 2.58s span; src/cli/report.spec.ts ran alone for the last 10ms
```

**Почему важно:** весь этот хвост время прогона по часам — это один файл.

**Как исправить:** разбейте файл, чтобы его тесты разошлись по нескольким дорожкам, или сохраняйте кэш
результатов Vitest между прогонами CI: его планировщик запускает известные медленные файлы первыми.

Время файла на дорожке — это `prepare` + `setup` + `import` + `tests`; окружение не учитывается, потому
что переиспользованный воркер не платит за него на каждый файл.

#### `perf-coverage` {#perf-coverage}

**Находит** покрытие, которое заняло секунду или больше и 20 % или больше времени по часам после
завершения последнего файла.

**Почему важно:** карта покрытия и отчёты строятся после прогона, поэтому в таблице фаз их нет. Тесты
могут выглядеть быстрыми во всех фазах и всё равно тратить здесь большую часть минут CI.

**Как исправить:**

- собирайте покрытие только в той джобе, которая его читает;
- сузьте `coverage.include` до исходников, о которых отчёт;
- уберите форматы `coverage.reporter`, которые никто не открывает, — каждый это ещё один проход по всем
  покрытым файлам.

#### `perf-vitest-doctor` {#perf-vitest-doctor}

**Находит**, на Vitest 5, что `npx vitest doctor` может подтвердить переключатель, который советует
другая находка (`perf-isolation`, `perf-environment-engine`, `perf-transform` или `perf-workers`).
Одна строка.

**Почему важно:** `vitest doctor` — собственный A/B-раннер **Vitest**, а не `doctor` этого пакета. Он
прогоняет тесты по разу на каждый вариант пула, изоляции, DOM-движка и кэша модулей, уменьшает
`maxWorkers` вдвое, пока это помогает, и советует только то, что на вашей машине оказалось быстрее.

**Как исправить:** запустите его, прежде чем оставлять изменение:

```bash
npx vitest doctor
```

Не под `@angular/build:unit-test`: там `vitest doctor` идёт без билдера и роняет каждый файл с
`describe is not defined`. Вместо этого находка даёт ваш собственный A/B — изменение в копии конфига
раннера, замеренное как `ng run <project>:<target> --watch=false --runner-config=<variant>` против
оригинала, по нескольку раундов. На `@angular/build` 20.x молчит. `perf-environment` её не вызывает.

### Зависания, нестабильные тесты и куча {#hangs-flaky-tests-and-the-heap}

Эти находки появляются на каждом прогоне, каким бы быстрым он ни был.

#### `perf-hung` {#perf-hung}

**Находит**, что Vitest закончил, но процесс не вышел, так что Vitest подождал `teardownTimeout` и
завершил его принудительно. Предупреждение.

**Почему важно:** каждый прогон тестов заканчивается этим ожиданием.

**Как исправить:** найдите, что держит процесс, — сервер, сокет, интервал, воркер — и закройте это в
`afterAll` того файла или setup-файла, который это запускает.

```bash
npx vitest run --reporter=hanging-process
```

#### `perf-flaky` {#perf-flaky}

**Находит** каждый файл с тестом, который прошёл только с повтора, и сами тесты по именам.
Предупреждение; прогон остаётся зелёным.

**Почему важно:** повтор, скрывающий настоящую гонку, — это тест, который упадёт в чужом merge request.
Неудачные попытки ещё и входят во время файла, так что гейт считает такой файл медленнее, чем он есть.

**Как исправить:** почините гонку. Чтобы CI на этом падал, добавьте `--fail-on-flaky` (код 1):

```bash
npx vitest-auto-spy perf --fail-on-flaky
```

Когда отчёт записывает повторы, исправление говорит, сколько попыток упало и во что обошёлся повторённый
тест за все попытки. Вычесть попытки нельзя: Vitest меряет повторённый тест от первой попытки до
успешной как одно время. По той же причине `perf-gate-slow-test` на повторённом тесте говорит, что его
время покрывает все попытки.

#### `perf-heap` {#perf-heap}

**Находит** пять файлов, после которых занято больше всего кучи, и тесты, которые удержали память.
Заметка.

**Почему важно:** тест, который держит память — незакрытая подписка, слушатель на глобальном объекте,
заполненный кэш модуля, — утяжеляет каждый следующий файл в своём воркере.

**Как исправить:** начните с первого теста в списке.

- **По файлам.** Голый прогон сам передаёт `--logHeapUsage`; прогону через `--command` нужен
  `logHeapUsage: true` в конфиге, до которого он доходит. При `isolate: false` на Vitest 5 `perf`
  показывает, сколько каждый файл **добавил** к предыдущему файлу той же дорожки. Иначе — кучу после
  каждого файла.
- **По тестам.** Тест, чей прирост (1 МБ и больше) остаётся и после следующего теста, — это ступенька
  кучи; такие тесты перечисляются по именам, от большей к меньшей. Первый тест файла не оценивается: его
  прирост — это загрузка модулей файла.
- **Первые загрузки отделяются.** Переиспользованный воркер загружает модуль один раз, так что первый
  файл дорожки, импортирующий тяжёлый пакет, за него и платит. Файл, чей прирост пришёл вместе с первой
  загрузкой от 50 мс, попадает во вторую заметку:

```text
info  perf-heap  Heap growth that comes with modules a worker evaluated for the first time, largest first:
                 libs/utils/capture-exception.util.spec.ts: first load of `@sentry/angular` in this worker (+8 MB),
                 not retained by the spec.
```

Как прирост делится между загрузками и спеками — в разделе [Как perf считает время](#how-perf-counts-time).

## Подробнее {#in-depth}

### Что сканирование считает этим репозиторием {#what-the-scan-counts-as-this-repository}

Все проверки `doctor` читают один список файлов. Первая строка отчёта — его длина. Список строят четыре
правила:

- **Директории сборки и пакетов пропускаются**: `node_modules`, `dist`, `build`, `coverage`, `out-tsc`,
  `.git`, `.angular`, `.nx`, `.next`, `.nuxt`, `.output`, `.svelte-kit`, `.turbo`, `.yarn`, `.cache`,
  `bower_components`, `out`, `tmp`, `vendor`, а также хранилища пакетных менеджеров, которые CI держит
  внутри checkout: `.bun`, `.npm`, `.pnpm-store`.
- **Директории, которые игнорирует git, пропускаются** (`src/generated/`, `/reports`, `tmp-*/`,
  `**/cache`), а `!` возвращает директорию, как в самом git. Правила читаются оттуда же, откуда их
  читает git, от меньшего приоритета к большему: пользовательские исключения (`core.excludesFile` из
  глобального конфига или конфига репозитория, иначе `$XDG_CONFIG_HOME/git/ignore`; `GIT_CONFIG_GLOBAL`
  учитывается, `[include]` — нет), `.git/info/exclude` (в том числе через файл `.git` worktree),
  корневой `.gitignore` и каждый `.gitignore` ниже — каждый относительно своей директории. Учитываются
  только директории: игнорируемый файл всё равно попадает в список. Паттерн с экранированием `\` или
  POSIX-классом отбрасывается (сканирование просто читает больше), а правило `!`, которое нельзя
  разобрать, делает свой файл игнорируемым целиком. `.gitignore` выше корня сканирования не читается,
  так что запускайте из корня репозитория.
- **Во вложенный репозиторий не заходим**: git worktree (у которого `.git` — файл) или вложенный клон.
  Его файлы — из другой ветки, и их подсчёт удваивает каждый граф импортов. То же правило не пускает
  `codemod --write` в рабочую копию другой ветки.
- **Сканирование останавливается на 50 000 файлов.** `doctor` сообщает
  [`scan-cap-reached`](#scan-cap-reached); `codemod` пишет об этом в stderr.
  `VITEST_AUTO_SPY_SCAN_CAP` поднимает предел.

Проверки, которые идут по импортам (`spec-imported-by-non-spec`, `orphan-runner-file` и другие), читают
один граф импортов, построенный по этому списку. Он игнорирует спецификаторы внутри комментариев и
строк и учитывает `paths` и `baseUrl` из `tsconfig.json` и `tsconfig.base.json` по их цепочкам
`extends`.

### Две проверки, которые разрешают имя {#the-two-checks-that-resolve-a-name}

`helper-from-wrong-entry` и `no-unawaited-helper` отвечают на вопрос об имени, и ни одна не гадает.
Таблица, какая точка входа что экспортирует, **генерируется из собственной карты `exports` пакета**:
баррели компилируются, экспортированные имена берутся у компилятора, а хелперы, возвращающие промис, —
из их сигнатур. Таблица, написанная руками, разошлась бы с пакетом при первом же переезде хелпера. У
линтера, который смотрит один файл, такой таблицы нет, поэтому это проверки `doctor`, а не правила
линтера.

Обе осторожны:

- **Одна мажорная версия.** `doctor` читает версию, установленную в вашем репозитории, и молчит, если
  мажоры различаются. Хелперы переезжают между точками входа и внутри мажора — в 5.21.0 тридцать два из
  них ушли из `/angular` в три новые точки входа, — поэтому `helper-from-wrong-entry` читает ещё и
  `exports` той копии пакета, до которой разрешается каждый файл, и называет только точки входа, которые
  эта копия публикует. Более новый CLI (`npx vitest-auto-spy@latest doctor`) против старой установки
  ничего не сообщает о хелпере, чьей новой точки входа в установке нет. Если манифест установленного
  пакета не читается, проверка молчит.
- **Одна форма.** `no-unawaited-helper` сообщает только о вызове, который и начинает, и заканчивает
  инструкцию. `await`, `return`, присваивание, аргумент, `.then`, короткое тело стрелочной функции и
  явный `void` его не трогают. Как и метод с тем же именем и любой вызов, чью функцию файл не
  импортировал из этого пакета. `expectEmission`, переименованный через `as`, всё равно распознаётся;
  чужой `stable` — никогда.
- **Только код.** Строки, шаблонные литералы и комментарии пропускаются до любого сопоставления, так что
  фикстура кодмода, генератор документации, фрагмент в заголовке `describe` или закомментированная
  строка не сообщаются никогда. Комментарии пропускаются первыми, потому что апостроф в тексте иначе
  открыл бы строку.

**По-прежнему только чтение.** Обе находки называют механическую правку — сменить спецификатор, добавить
`await`, — и ни одна не применяется. `--fix` у `doctor` нет сознательно: инструмент, который только что
показал вам то, чего не видел никто, ещё не заслужил права писать в ваши файлы.

### Как perf считает время {#how-perf-counts-time}

**Итоги по фазам — это время CPU, сложенное по воркерам**, а не время по часам. Прогон, который по
часам занял 1,36 с, может показать 16,91 с CPU, потому что работа шла на нескольких воркерах.

**Числа Vitest, а не вывод терминала.** Vitest печатает одну итоговую строку на прогон (`Duration 8.91s
(transform 26.20s, setup 14.70s, import 55.27s, tests 27.24s, environment 155.65s)`). Какие файлы за
это отвечают, она не говорит. `perf` читает те же числа по каждому файлу через `TestModule.diagnostic()`
— публичный API Vitest — с помощью репортера, который входит в пакет. На Vitest 5 голый прогон ещё и
передаёт `--experimental.diagnostics=false`, чтобы собственные подсказки Vitest после прогона не
повторяли `perf`.

**Собранный конфиг на Vitest 5.** Отчёт записывает конфигурацию, которую собрал Vitest, — `isolate`,
`pool`, `maxWorkers`, `environment`, `fsModuleCache` — и какие из них вы задали сами (`providedOptions`
Vitest). Советы читают эти значения, а не ищут их в тексте конфигов, так что считается и настройка из
билдера, проекта workspace или командной строки. Прогон считается прогоном билдера, когда `--command`
(или вызываемый им скрипт `npm`) запускает `ng` или `nx` либо когда в workspace есть unit-test цель и
нет корневого конфига Vitest. `isolate` и `environment`, которые билдер передаёт в Vitest, — его
решения, а не ваши, поэтому находку они не глушат. Под билдером Vitest сообщает модули `spec-*.js` и
`chunk-*.js`; карточка подтверждённой находки называет собственный бандл спеки по имени спеки и опускает
чанки.

**Окружение считается раз на воркер.** Vitest строит окружение раз на воркер, а потом копирует это число
в отчёт каждого файла, который воркер выполнил. Сумма по файлам умножает один старт на число файлов.
`perf` считает каждое различное значение один раз — на Vitest 5 раз на дорожку (`concurrencyId`), чтобы
две дорожки с одинаковым числом не слились. Vitest 5 сообщает и `workerId`, но он новый для каждого
файла даже при переиспользованном воркере, поэтому `perf` по нему не группирует.

**Оценка изоляции.** На Vitest 5 `perf-isolation` берёт ту же оценку, что и собственная подсказка
Vitest 5 про изоляцию: `startup ÷ lanes − startup ÷ workers`, где дорожек — меньшее из числа файлов и
`maxWorkers` (или самая старшая использованная дорожка). Печатается «как минимум», потому что выполнение
модулей, которое переиспользованные воркеры тоже экономят, сюда не входит.

**Transform на Vitest 5.** Каждый файл сообщает, сколько сбор и setup ждали Vite
(`collectFetchDuration` + `setupFetchDuration`). Таблица фаз считает это ожидание как `transform`, а не
внутри `import` и `setup`, — так же делит и итоговая строка Vitest. `isolate: false` на это не влияет:
сервер преобразует каждый модуль один раз в любом случае.

**Куча и первые загрузки.** После каждого файла репортер записывает модули, которые воркер выполнил
впервые, — те, которых не было у предыдущего файла дорожки. Если один и тот же модуль впервые
загружался на нескольких дорожках, каждый такой файл — один замер цены загрузки. Файл, выросший больше
чем вдвое против среднего замера, остаётся в первой заметке как `+21 MB beyond the first load of
@sentry/angular`; файл, который ничего нового не загрузил, остаётся там со всем приростом. При
единственном замере весь прирост относится на загрузку. Замеряемый прогон просит у Vitest тридцать
самых тяжёлых импортов при `isolate: false` (иначе десять); первая загрузка, слишком лёгкая для этого
списка, не распознаётся, и её прирост считается удержанным.

**Самые медленные импорты.** На Vitest 4.1 и новее замеряемый прогон просит десять самых медленных
импортов каждого файла (тридцать при `isolate: false`), если конфиг не задаёт
`experimental.importDurations.limit`. Перемер поднимает меньший предел только для своего прогона.

**CPU-профиль.** Во время перемера гейта `perf` задаёт `VITEST_AUTO_SPY_PERF_PROFILE`; репортер только
на этот проход добавляет профилировщик пакета в `setupFiles` каждого проекта, и тот записывает каждый
файл через собственную сессию `node:inspector` воркера с шагом 500 мкс. `--cpu-prof` здесь ничего не
записал бы: воркер пула завершают принудительно, а Node пишет такой профиль при выходе. Тот же проход
записывает все тела тестов, а не только дольше 100 мс, так что карточка может назвать самые медленные.
В долях не учитываются такты простоя. Профиль, который не удалось прочитать, оставляет находку без этих
строк и ничего не роняет.

**Хуки `setupAutoSpy`.** Во время замеряемого прогона `setupAutoSpy()` засекает свои `beforeEach` и
`afterEach` в `task.meta.autoSpyMs`. Вне прогона `perf` ничего не замеряется.

### Почему гейт работает так {#why-the-gate-works-like-this}

Советы `perf` никогда не должны ронять merge request. Гейт должен — поэтому каждая его находка должна
быть тем, что автор диффа сделал и может отменить. Отсюда три решения.

- **Он судит тела тестов, а не машину.** `environment`, `prepare`, `setup` и `transform` растут с числом
  файлов и мощностью CPU; автор спеки их не уменьшит. `import` трудно отнести к кому-то: в общем воркере
  первый файл, дошедший до модуля, платит за всех. `tests` — единственная фаза, которая чей-то код.
- **Бюджеты считаются в медианном тесте прогона.** Загруженный раннер замедляет все тесты одинаково,
  поэтому вердикт один и тот же на ноутбуке и на раннере в девять раз медленнее. Порог `--max-file-ms`
  может только пощадить файл. Прежнее правило — порог в миллисекундах и кратное медианного **файла** —
  судило размер файла и скорость раннера: тот же отчёт, проигранный на всё меньшей скорости, помечал всё
  больше файлов, а разбиение файла его обходило.
- **Одного замера мало, чтобы уронить.** «Ваш тест медленный» и «ваш тест делил воркер с четырьмя
  другими» — разные утверждения. Гейт, который их не различает, отключают через неделю.

Таблицы превышений строятся теми же функциями, которыми судит гейт, и `--gate-only` сужает их так же,
так что таблица и вердикт не расходятся. Карточка сравнивает кандидата с его собственным бюджетом, а не
с бюджетом файла.

### Форматы отчёта {#report-formats}

**`--format json`** печатает в stdout один документ и больше ничего. Собственный вывод тестов уходит в
stderr, так что stdout остаётся разбираемым. Поля только добавляются; поле, которое меняет смысл или
исчезает, поднимает `schema`.

- **`doctor`**: `schema`, `command`, `version`, `cwd`, `runner`, `entry`, `scanned` (`files`,
  `specFiles`, `truncated`), `exitCode`, `tally` (`errors`, `warnings`, `notes`) и каждая находка с
  `check`, `severity`, `file`, `message`, `fix` и `details`. `--min-severity` влияет только на текст; в
  документе всегда все находки.
- **`perf`**: `run` (файлы, тесты, миллисекунды по часам и CPU, две медианы, фазы и `slowestFiles` —
  `--top` самых медленных файлов, по умолчанию 10, каждый с путём относительно репозитория, суммой
  миллисекунд, числом тестов и миллисекундами по фазам), `budgets`, `gate` (`status`, `confirmation` и
  строки вердиктов), `tally` и каждая находка. Прогон, которому нечего оценивать, всё равно печатает
  документ — с `error` и `run: null`.
- **`perf`, когда в отчёте есть данные**: `run.vitest` (версия Vitest), `run.partial`, `run.config`
  (собранные опции и `provided`), `run.startup` (`{ ms, workers }`), `run.lanes`
  (`{ lanes, spanMs, busy, longPole?: { file, aloneMs } }`), а на Vitest 5 — запись `transform` в
  каждом `slowestFiles[].phases`, с `import` и `setup` за его вычетом. Когда есть что сказать: `end`
  (`passed`, `failed` или `interrupted`), `hung: true`, `coverageMs`, `libraryHooksMs` и `endToEndMs`.
  Формат отчёта — версия 6; читаются версии с 1 по 6. Каждое поле, добавленное в версии 5 (у прогона
  `end`, `hung` и `coverage`, у файла `heapStep`, `setupImports` и `autoSpy`, у импорта `self`), и
  `configFile` прогона из версии 6 (файл конфига Vitest относительно `root`) необязательны.

**`--format markdown`** выводит тот же документ в markdown для GitHub/GitLab: таблицу находок (уровень,
проверка, файл, сообщение, исправление) и итоги; для `perf` ещё таблицу фаз, самые медленные файлы (с
колонкой `Transform` на Vitest 5), строку дорожек, версию Vitest и вердикты гейта. `|` и переводы строк
внутри ячейки экранируются. Недоработавший прогон говорит «the run did not finish» там, где упавший
говорит «the suite did not pass».

**`--code-quality <path>`** пишет отчёт GitLab Code Quality. Находка о файле записывается на этот файл,
находка обо всём репозитории — на `package.json`. Файл пишется и пустым: пустой отчёт — это то, как
виджет узнаёт, что проблемы прошлого прогона ушли. Он учитывает `--min-severity`. На `perf` он содержит
советы, гейт и нестабильные тесты. Виджет узнаёт находку по отпечатку: цифры в сообщении обнуляются,
потому что длительности и счётчики меняются от прогона к прогону, а текст в обратных кавычках
сохраняется, потому что там сообщение называет тест, файл или флаг. Так `` `returns 200` `` и
`` `returns 404` `` остаются двумя находками, а `3.90s` по-прежнему нормализуется.

**Цвет.** В терминале `error` красный, `warn` жёлтый, `info` без цвета, а строка вердикта гейта красная,
когда что-то роняет прогон. В таблицах perf время строк красное, заголовки приглушены. Карточка красит
превышения бюджета и тела дольше `--max-test-ms` в красный, остальные времена — в жёлтый, полосы долей —
в жёлтый с 20 % и в красный с 40 %, рамка приглушена. В пайпе или файле цвет выключен, если его не
просит `FORCE_COLOR` или прогон не идёт в джобе GitLab CI (`GITLAB_CI`) или GitHub Actions
(`GITHUB_ACTIONS`), чьи логи цвет показывают. `NO_COLOR`, `FORCE_COLOR=0` и `TERM=dumb` выключают его
везде. JSON, markdown и Code Quality никогда не содержат управляющих последовательностей. Каждая строка
находки, кроме первой, с отступом, так что обвязка, которая собирает находку как строку `error` плюс
строки с отступом под ней, получает её целиком, вместе с карточкой.
