---
title: Билдер unit-test в Angular
description: Как запускать спеки с vitest-auto-spy через ng test и билдер unit-test из @angular/build - setup-файлы, правила vi.mock, покрытие, шарды и разделение кода.
---

# Билдер unit-test в Angular

Эта страница для проектов, которые запускают тесты командой `ng test` через билдер
`@angular/build:unit-test` из Angular CLI. Билдер собирает спеки в бандл до того, как их запустит
Vitest, поэтому `vi.mock`, покрытие, шарды и `--changed` работают не так, как в обычном проекте на
Vitest. Начните с того, что добавьте setup-файл библиотеки в тестовую цель:

```jsonc
// angular.json
"test": {
  "builder": "@angular/build:unit-test",
  "options": {
    "setupFiles": ["src/test-setup.ts"]
  }
}
```

```ts
// src/test-setup.ts
import { registerResourceMatchers, registerSignalMatchers } from 'vitest-auto-spy/angular/matchers';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy();
registerSignalMatchers();
registerResourceMatchers();
```

Дальше пишите спеки, как показано на странице [Angular](/ru/adapters/angular). Разделы ниже — о том,
что делать, когда билдер мешает. Большую часть из этого за вас проверяет
`npx vitest-auto-spy doctor`; см. [CLI](/ru/utilities/cli).

## Что компилирует билдер {#what-the-builder-compiles}

Начиная с `@angular/build` 22.2.0 тестовая программа состоит только из:

- файлов спек;
- `providersFile` и `setupFiles`;
- `.d.ts`-файлов, которые включает `tsconfig.spec.json`;
- всего, что они импортируют.

Обычный `.ts`-файл, который просто лежит в `include` у tsconfig, больше не компилируется. Если в нём
`import 'vitest-auto-spy/rxjs'` или [расширение типов](/ru/glossary) через `declare module`, это
объявление пропадает из всех спек.

Перенесите такой файл в setup-файл, в спеку или в `.d.ts`. В `.d.ts` с расширением типов нужен
`import` или `export {}`, иначе он перестанет быть расширением. Билдеры до 22.2.0 компилируют весь
`include`.

## Моки модулей под unit-test-билдером {#module-mocks-under-the-unit-test-builder}

`vi.mock('@angular/core')` под билдером работает, даже когда в графе есть `TestBed` и код
приложения. Действуют два правила.

### Правило: в фабрике `vi.mock` нельзя пользоваться спредом объекта {#the-rule-a-vi-mock-factory-must-not-use-object-spread}

Внутри фабрики `vi.mock` пишите `Object.assign({}, actual, { … })` вместо `{ ...actual, … }`:

```ts
// ❌ падает
vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();

  return { ...actual, effect: (fn: () => void) => fn };
});

// ✅ тот же мок, без спреда
vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();

  return Object.assign({}, actual, { effect: (fn: () => void) => fn });
});
```

Билдер всегда компилирует спред объекта во вспомогательную функцию, что бы ни было написано в
`.browserslistrc`. Эта функция объявлена внутри тестового бандла, а фабрики `vi.mock` переносятся в
самое его начало, поэтому фабрика вызывает функцию раньше, чем та появилась. Текст ошибки зависит от
разделения кода и не упоминает ни спред, ни фабрику:

| Разделение кода | Ошибка                                                  |
| --------------- | ------------------------------------------------------- |
| включено        | `Cannot access '__vi_import_1__' before initialization` |
| выключено       | `__spreadValues is not a function`                      |

### Относительный путь заблокирован, и навсегда {#a-relative-path-is-blocked-permanently}

Билдер отвергает `vi.mock('./thing')` намеренно. `vi.mock`, `vi.doMock`, `vi.importMock`,
`vi.unmock` и `vi.doUnmock` бросают ошибку для любого пути, который начинается с `.` или `/`:

```text
The "vi.mock" and related methods are not supported for relative imports with the Angular
unit-test system. Please use Angular TestBed for mocking dependencies.
```

Никакая опция сборки этого не меняет. Подменяйте зависимость через провайдеры `TestBed`, с помощью
[`provideAutoSpy`](/ru/adapters/angular#replace-a-service-provideautospy-and-injectspy).

::: danger Псевдоним пути из tsconfig молча игнорируется
`vi.mock('@app/thing')` не начинается с `.` или `/`, поэтому билдер не бросает ошибку. Мок
игнорируется, и работает настоящий модуль. Потом спека падает на проверке, которая выглядит как баг
в вашем коде. Здесь тоже подменяйте зависимость через `TestBed`.
:::

### На чём проверены эти правила {#what-the-measurement-does-not-cover}

Эти правила выведены на маленьком тестовом проекте: без компонентов, шаблонов, баррелей и
`externalDependencies`, на jsdom, а не на happy-dom. Этот проект показывает, что
`vi.mock('@angular/core')` в целом не заблокирован и что фабрику ломает именно спред. Он не
обещает, что любой мок любого модуля заработает в большом приложении. Опцию `splitting` из
следующего раздела на нём не проверяли.

## Когда в unit-test-сборке выключено разделение кода {#when-the-unit-test-build-has-code-splitting-off}

**Если у вас `@angular/build` 22.1.5 или 22.1.6, обновитесь до 22.1.7 или новее** и уберите
`"splitting": false` из тестовой цели, если он там есть.

В этих версиях билдер выключает разделение кода в esbuild, и включить его обратно нельзя. Каждая
спека становится отдельным бандлом, и под `--coverage` память растёт на сотни мегабайт, пока
CI-задачу не убьют. Билдер ничего не сообщает.

Ошибка спреда `__spreadValues is not a function` — признак того, что разделение выключено. Это две
отдельные проблемы: ошибку чинит `Object.assign` (см. выше), а рост памяти — обновление.

- В 22.1.7 опция `splitting` вернулась и по умолчанию включена.
- С 22.2.0 опция устарела и по-прежнему включена по умолчанию. Оставшийся ключ `"splitting"`
  `doctor` сообщает как
  [`angular-build-splitting-deprecated`](/ru/utilities/cli#angular-build-splitting-deprecated).

Как о проблеме сообщается:

- `npx vitest-auto-spy doctor` сообщает
  [`angular-build-splitting-off`](/ru/utilities/cli#angular-build-splitting-off).
- [`setupAutoSpy()`](/ru/utilities/setup#_13-the-builder-version-that-eats-memory-named-in-the-run)
  печатает в stderr одну строку на воркер с версией и обоими способами решения. Он читает только
  `node_modules/@angular/build/package.json`. Отключается через
  `setupAutoSpy({ angularBuildHint: false })`.

### Запасной ход и почему его здесь нет {#the-escape-hatch-and-why-it-is-not-shipped-here}

Если обновиться с 22.1.5 или 22.1.6 нельзя, остаётся только пропатчить установленный билдер. Ниже —
скрипт `postinstall` с проверкой версии. Скопировав его, вы берёте его на себя: этот репозиторий его
не запускает и не тестирует, а работает он, пока в билдере есть одна конкретная строка.

```js
// scripts/patch-angular-build.cjs — delete this once you are on @angular/build 22.1.7
const { readdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', 'node_modules', '@angular', 'build');
const { version } = require(join(root, 'package.json'));
const [major, minor, patch] = version.split('.').map(Number);
const affected = major === 22 && minor === 1 && patch >= 5 && patch < 7;

if (!affected) {
  process.stdout.write(`@angular/build ${version} needs no patch\n`);
  process.exit(0);
}

const NEEDLE = 'disableCodeSplitting: true,';
let patched = 0;

const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (full.endsWith('.js')) {
      const source = readFileSync(full, 'utf8');

      if (source.includes(NEEDLE)) {
        writeFileSync(full, source.split(NEEDLE).join('disableCodeSplitting: false,'));
        patched += 1;
      }
    }
  }
};

walk(join(root, 'src'));

// Fail loudly rather than silently doing nothing: the literal moving is the expected way this breaks.
if (patched === 0) {
  throw new Error(`@angular/build ${version}: "${NEEDLE}" not found — the patch needs revisiting`);
}
```

Этот пакет патч не поставляет и не будет. Тестовая библиотека, которая переписывает файлы чужого
пакета в `node_modules`, — риск для цепочки поставок, а правка по строке молча ломается, когда
билдер меняется. Почему так — на странице
[Как устроены хелперы Angular](/ru/adapters/angular-how-it-works#why-the-angular-build-patch-is-not-shipped).

## Покрытие под unit-test-билдером {#coverage-under-the-unit-test-builder}

::: tip Vitest 5 заметно ускоряет прогон с покрытием
Начиная с `@angular/build` 22.2.0 билдер работает на Vitest 5, и прогон с покрытием занимает на
треть-половину меньше времени. Обновляйте `vitest` и `@vitest/coverage-*` до 5 вместе; для Analog
нужна 2.7.5 или новее. Старые билдеры продолжают работать на Vitest 4. Цифры:
[Производительность → Vitest 5 под unit-test-билдером Angular](/ru/core/performance#vitest-5-under-the-angular-unit-test-builder).
:::

Две настройки покрытия выглядят как конфигурация, но под билдером ничего не делают. Прогон зелёный,
отчёт есть, только не тот, что вы просили. `npx vitest-auto-spy doctor` сообщает об обеих.

**Ставьте `coverageInclude` в цель билдера, а не в конфиг Vitest.** Билдер запускает Vitest поверх
бандла, поэтому покрытие сначала сверяет ваши шаблоны с файлами бандла (`spec-*.js`,
`chunk-*.js`). Билдер сам добавляет шаблоны бандла к своей опции `coverageInclude`, поэтому шаблоны
`.ts` там работают. К `coverage.include` в конфиге раннера он их не добавляет: там те же шаблоны ни с
чем не совпадают, и отчёт выходит **пустым**. Поэтому перенесите список: задайте `coverageInclude` в цели и удалите
`coverage.include` из конфига раннера. Список, оставшийся в конфиге раннера, `doctor` сообщает как
[`coverage-include-misses-bundle`](/ru/utilities/cli#coverage-include-misses-bundle).

```jsonc
// angular.json
"test": {
  "builder": "@angular/build:unit-test",
  "options": {
    "runnerConfig": "tools/vitest-runner.config.ts",
    "coverageInclude": ["libs/**/*.ts", "apps/**/*.ts"]
  }
}
```

**`coverage.all` больше нет** (убран в Vitest 4). Непротестированные файлы теперь попадают в отчёт,
только когда задан список include. Под билдером этот список — `coverageInclude` в цели. Конфиг из
Vitest 3 с `all: true` и без списка include покажет только файлы, которых коснулся прогон, и ничего не скажет.
`doctor` сообщает это как [`coverage-all-removed`](/ru/utilities/cli#coverage-all-removed).

**С псевдонимами путей из tsconfig берите провайдер `v8`.** Когда задан список include,
`@vitest/coverage-istanbul` ищет непротестированные файлы через Vite, а не через псевдонимы
билдера. Первый же импорт через псевдоним останавливает весь прогон:

```text
Error: Failed to resolve import "@workspace/api" from
"apps/app/src/main.server.ts?cache=…&vitest-uncovered-coverage=true". Does the file exist?
```

Пакет в сообщении от прогона к прогону разный: это просто первый ненайденный импорт. `v8` отбрасывает
файлы, которые не смог разобрать, с предупреждением и оставляет прогон зелёным.

## Шарды и прогон только изменённого под unit-test билдером {#shards-and-changed-only-runs-under-the-unit-test-builder}

`ng test` не пропускает флаги Vitest. `test.repeats` и `test.shard` из конфига раннера до Vitest
доходят. `--changed` и `--related` не работают, потому что Vitest видит бандлы билдера, а не ваши
исходники.

[`npx vitest-auto-spy ng-test`](/ru/utilities/cli#ng-test-—-sharding-and-changed-only-runs-under-the-angular-builder)
делает и то и другое через `--include` билдера. Начиная с `@angular/build` 22.2 билдер
компилирует только те спеки, которые запускаются:

```sh
npx vitest-auto-spy ng-test --shard 2/4
npx vitest-auto-spy ng-test --changed origin/main
```

## Сопоставление покрытия стоит дороже самого покрытия {#coverage-matching-costs-more-than-coverage}

**На Vitest 4 и более старых длинный список include (под билдером — `coverageInclude`) может замедлить покрытие, а не ускорить.**
Лечится обновлением до Vitest 5: он компилирует шаблоны один раз. Под unit-test-билдером Vitest 5
требует `@angular/build` 22.2.0 или новее; для Analog — 2.7.5 или новее. `doctor` сообщает это как
[`coverage-include-recompiles-globs`](/ru/utilities/cli#coverage-include-recompiles-globs), и
только на Vitest старше 5.

Причина: `@vitest/coverage-v8` заново компилирует каждый шаблон для каждого проверяемого файла. На
большом репозитории финальная фильтрация может занять половину этапа покрытия. Цифры:
[Производительность](/ru/core/performance).

### Лечится обёрткой над провайдером в вашем собственном конфиге {#the-fix-is-a-provider-wrapper-in-your-own-config}

Если остаётесь на Vitest 4, оберните провайдер v8 и компилируйте шаблоны один раз.
`coverage.provider: 'custom'` — поддерживаемая опция:

```ts
// tools/coverage-provider.ts
import * as v8 from '@vitest/coverage-v8';
import { cleanUrl, slash } from '@vitest/utils/helpers';
import pm from 'picomatch';

export * from '@vitest/coverage-v8';

const workspaceRoot = slash(process.cwd()); // корень репозитория
const projectRoot = workspaceRoot; // или абсолютный путь проекта внутри него

export async function getProvider() {
  const provider = await v8.getProvider();
  const original = provider.isIncluded.bind(provider);
  let match;

  provider.isIncluded = (filename) => {
    const { include, exclude, allowExternal } = provider.options ?? {};

    // A `--changed` run selects by its own file list, and a config with no `include` has nothing
    // to compile: the only two questions this wrapper genuinely cannot answer.
    if (!include) {
      return original(filename);
    }

    match ??= pm(include, { contains: true, dot: true, ignore: exclude });

    const path = slash(cleanUrl(filename));

    // Inline, NOT delegated — see the note below.
    if (!allowExternal && !path.startsWith(workspaceRoot) && !path.startsWith(projectRoot)) {
      return false;
    }

    return match(path);
  };

  return provider;
}
```

Подключите его в конфиге Vitest (под билдером — в файле из `runnerConfig`):

```ts
// tools/vitest-runner.config.ts
coverage: {
  provider: 'custom',
  customProviderModule: './tools/coverage-provider.ts',
}
```

Отчёт получается тем же, что и раньше: те же файлы и те же проценты.

::: danger Не возвращайте случай `allowExternal: false` исходному методу
`@angular/build:unit-test` выставляет `allowExternal: false`, поэтому каждый вызов пошёл бы по
медленному пути, и обёртка как будто ничего бы не делала. Проверяйте на месте, двумя `startsWith` по
корню репозитория и корню проекта.
:::

Ещё две детали:

- `getProvider()` выполняется **до** того, как Vitest вызовет `initialize()`, поэтому
  `provider.options` ещё нет. Создавайте сопоставитель лениво, при первом вызове.
- Нормализуйте имя файла точно так же, как исходный метод: `slash(cleanUrl(filename))` из
  `@vitest/utils/helpers`. Иначе на части путей они разойдутся.

### Сужение области — не только про скорость {#narrowing-the-scope-is-not-only-about-speed}

GitLab молча игнорирует отчёт cobertura больше **10 МБ**: задача зелёная, проценты в логе, а в
merge request нет подсветки покрытия по строкам. Список include (под билдером —
`coverageInclude`) уменьшает отчёт, и это может увести его под этот предел.
