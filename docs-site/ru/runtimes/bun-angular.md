---
title: Angular на Bun
description: Как запускать спеки TestBed из Angular под bun test одной строкой preload - DOM, встроенные шаблоны и zoneless TestBed.
---

# Angular на Bun (`bun:test`)

`vitest-auto-spy/bun-angular` позволяет запускать спеки Angular с `TestBed` через `bun test`. Она
нужна, если ваш раннер тестов — Bun, а у компонентов есть `templateUrl`. Вы добавляете одну строку
preload, и спека компонента работает так же, как на Vitest.

```ts
// profile.component.test.ts (у ProfileComponent есть templateUrl; шаблон выводит "Hello, {{ name }}!")
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'bun:test';
import { injectSpy, provideAutoSpy, stable } from 'vitest-auto-spy/bun-angular';

import { ProfileComponent } from './profile.component';
import { UserService } from './user.service';

describe('ProfileComponent', () => {
  it('renders the name the service returns', async () => {
    TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [provideAutoSpy(UserService)],
    });
    injectSpy(UserService).currentName.mockReturnValue('Ada');

    const fixture = TestBed.createComponent(ProfileComponent);
    await stable(fixture); // ждёт, пока компонент отрисуется

    expect(fixture.nativeElement.textContent).toContain('Hello, Ada!');
  });
});
```

Нужны Angular 20 или новее с `@angular/platform-browser` (он есть в любом приложении Angular CLI) и
пакет с DOM ([почему Angular 20](/ru/core/compatibility#angular-20)). Настройка — два шага.

## Настройка {#setup}

1. Поставьте библиотеку и DOM. В Bun нет DOM, а тестовой платформе Angular нужен `document`.

   ```bash
   bun add -d vitest-auto-spy @happy-dom/global-registrator   # или jsdom вместо happy-dom
   ```

   Чтобы редактор знал типы `bun:test`, добавьте `@types/bun`, если его ещё нет. Настройки декораторов Bun берёт из вашего `tsconfig.json`, так что проекту Angular CLI ничего менять не нужно.

2. Добавьте точку входа как **preload** в `bunfig.toml` в корне проекта. Preload — файл, который Bun
   выполняет до всех файлов тестов.

   ```toml
   # bunfig.toml
   [test]
   preload = ["vitest-auto-spy/bun-angular"]
   ```

Это вся конфигурация. При запуске preload:

1. поднимает DOM (`window`, `document` и другие глобальные объекты браузера) через
   `@happy-dom/global-registrator`, а если его нет — через `jsdom`. Если DOM уже есть, шаг
   пропускается;
2. встраивает `templateUrl`, `styleUrl` и `styleUrls` каждого компонента прямо в его исходник, чтобы
   Angular мог скомпилировать компонент во время теста;
3. настраивает **zoneless** `TestBed` (Angular без zone.js; обнаружение изменений работает на сигналах);
4. вызывает `TestBed.resetTestingModule()` после каждого теста. Свой `afterEach` для `TestBed` и спаев
   из `provideAutoSpy` не нужен;
5. делает каждый спай функцией `mock()` из Bun. У неё те же методы, что у `vi.fn()` в Vitest: `mockReturnValue`, `mockResolvedValue` и другие.

::: warning Это обязательно preload
Не заменяйте строку в `bunfig.toml` импортом в спеке. Встраивание шаблонов должно начаться раньше, чем
Bun загрузит первый файл тестов, а так рано выполняется только preload.
:::

**Частая ошибка:** не поставлен пакет с DOM. Запуск останавливается с
`registerDomGlobals: no DOM could be installed, so Angular's TestBed cannot run.` Поставьте один из двух
пакетов из шага 1.

## Как писать спеку {#writing-a-spec}

Спека выглядит так же, как на Vitest, только `describe`, `it` и `expect` берутся из `bun:test`. Пример
в начале страницы — полная спека:

- standalone-компонент кладётся в `imports`, компонент из NgModule — в `declarations`;
- `injectSpy(UserService)` возвращает спай, который внедряет `TestBed`. Задайте его ответы до
  `createComponent`;
- `bun test` находит файлы `*.test.ts` и `*.spec.ts`.

Запустите её командой `bun test`. Если спеки проходят по одной, но падают вместе, добавьте `--isolate`:
тогда каждый файл тестов получает свежие глобальные объекты.

```bash
bun test
```

**Частая ошибка:** если входы компонента объявлены через сигнальный `input()`, спека под Bun не сможет
их задать. См. [О чём стоит знать](#limits-worth-knowing).

## Что вы получаете {#what-you-get}

| Хелпер                                                                               | Работает на Bun | Примечания                                                           |
| ------------------------------------------------------------------------------------ | :-------------: | -------------------------------------------------------------------- |
| `provideAutoSpy` / `injectSpy`                                                       |       ✅        | как на Vitest                                                        |
| `renderShallow` / `prepareShallow`                                                   |       ✅        | настоящий `ComponentFixture` без дочерних компонентов                |
| `createWithAutoSpies`                                                                |       ✅        | создаёт класс через DI Angular, все зависимости — спаи               |
| `hostElement` / `queryElement`                                                       |       ✅        | типизированные элементы фикстуры, проверенные `instanceof`           |
| `stable`                                                                             |       ✅        | ждёт, пока компонент отрисуется                                      |
| `flushEffects`                                                                       |       ✅        | выполняет ожидающие эффекты сигналов                                 |
| `runEffect`, `setInputs`, `settleResource`, `trackEffectRuns`, `trackRecomputations` |       ✅        | как на Vitest (`setInputs` не задаёт сигнальный `input()`, см. ниже) |
| основной API библиотеки (`createSpyFromClass`, `createAutoMock`, …)                  |       ✅        | тоже экспортируется из этой точки входа                              |
| `registerSignalMatchers`                                                             |       ❌        | нужен `expect.extend` из Vitest                                      |
| `registerDirectiveMatchers`                                                          |       ❌        | нужен `expect.extend` из Vitest                                      |
| `registerResourceMatchers`                                                           |       ❌        | нужен `expect.extend` из Vitest                                      |
| диагностика TestBed (`instrumentTestBed`)                                            |       ❌        | нужны хуки Vitest на уровне файла                                    |
| остальное из `/angular`                                                              |       ❌        | только Vitest, список ниже                                           |

«Остальное из `/angular`» — всё из `vitest-auto-spy/angular`, `vitest-auto-spy/angular/diagnostics` и
`vitest-auto-spy/angular/doubles`, чего нет в таблице. Эта точка входа ничего из этого не экспортирует:

- проверки переопределений и диагностики;
- `extendWithAutoSpies`;
- `provideAutoSpyForToken` и его значения по умолчанию для токенов;
- `trackInjections` и `setupAngularTestEnv`;
- фабрики заглушек;
- подмены для ресурсов, сигнальных свойств, платформы и диалогов.

## Стили {#stylesheets}

Тесты не проверяют стили, а у Bun нет CSS-препроцессора. Поэтому preload встраивает `.css` как есть, а
`.scss`, `.less` и `.styl` превращает в **пустую** таблицу стилей. Компонент всё равно компилируется и
рендерится.

Если нужен текст других стилей, соберите свой preload (см.
[Как собрать собственный preload](#building-your-own-preload)). В его хуке `Bun.plugin` `onLoad`
вызовите `inlineAngularResources` с текстом и путём файла и перечислите расширения в
`inlineStyleExtensions`:

```ts
inlineAngularResources(source, path, { inlineStyleExtensions: ['.css', '.scss'] });
```

| Опция                   | Тип                 | По умолчанию | Смысл                                            |
| ----------------------- | ------------------- | ------------ | ------------------------------------------------ |
| `inlineStyleExtensions` | `readonly string[]` | `['.css']`   | эти стили встраиваются текстом, остальные пустые |

### Шаблон или стили, которые не читаются {#a-template-or-stylesheet-that-cannot-be-read}

Путь в `templateUrl` и `styleUrl` отсчитывается от файла компонента. Если файл не читается, preload
называет URL, компонент, код ошибки файловой системы (`ENOENT`, `EACCES`) и полный путь, по которому
искал:

```text
[vitest-auto-spy] cannot read "./profile.component.html" referenced by src/app/profile.component.ts: ENOENT at /project/src/app/profile.component.html.
The path resolves relative to the component file, not the project root; fix the templateUrl or styleUrl.
```

## Что preload сбрасывает, а что оставляет вам {#what-the-preload-resets-and-what-it-leaves-to-you}

Спаям из `provideAutoSpy` ничего дополнительно не нужно. Каждый `TestBed` создаёт новые, а сброс после
теста их выбрасывает.

Preload сбрасывает тестовый модуль после каждого теста, и больше ничего. `bun:test` тоже ничего не
восстанавливает. Это важно, если в спеках есть:

- `spyOn` из Bun;
- `mockValueProp` из библиотеки — он подменяет значение свойства. Отменяет его `restoreMockedProps()`.

На Vitest всё это после каждого теста восстанавливает `setupAutoSpy()` из библиотеки. На Bun он не
работает (см. [Bun → Между тестами ничего не восстанавливается](/ru/runtimes/bun#nothing-is-restored-between-tests)),
поэтому добавьте второй файл preload с `afterEach`. Туда же кладите `mock.module()`: мок модуля должен
примениться до импорта тестируемого кода. Путь в `mock.module()` считается от файла `bun-test-setup.ts`, как в обычном импорте.

```toml
# bunfig.toml
[test]
preload = ["vitest-auto-spy/bun-angular", "./bun-test-setup.ts"]
```

```ts
// bun-test-setup.ts
import { afterEach, mock } from 'bun:test';
import { restoreMockedProps } from 'vitest-auto-spy/bun-angular';

mock.module('./src/app/analytics', () => ({ track: () => undefined }));

afterEach(() => {
  restoreMockedProps();
  mock.restore();
});
```

## Как собрать собственный preload {#building-your-own-preload}

Если в проекте уже есть свой preload, настройку можно собрать из экспортируемых частей вместо точки
входа. Этот пример ставит только DOM:

```ts
// bun-preload.ts
import { createJsdomRegistrar, inlineAngularResources, registerDomGlobals } from 'vitest-auto-spy/bun-angular';

await registerDomGlobals({
  registrars: [createJsdomRegistrar({ load: () => import('jsdom'), target: globalThis, url: 'https://app.test/' })],
});
```

| Экспорт                                            | Что делает                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `registerDomGlobals({ registrars, hasDom })`       | пробует регистраторы по порядку и возвращает имя сработавшего (подробности ниже) |
| `createJsdomRegistrar({ load, target, url })`      | регистратор на `jsdom`; `url` по умолчанию `http://localhost/`                   |
| `createGlobalRegistratorRegistrar({ name, load })` | регистратор на `@happy-dom/global-registrator`                                   |
| `copyWindowGlobals(source, target)`                | копирует глобальные объекты окна в `target`                                      |
| `inlineAngularResources(source, path, options)`    | встраивает `templateUrl` / `styleUrl` / `styleUrls`; см. [Стили](#stylesheets)   |

`registerDomGlobals` возвращает `undefined`, если DOM уже есть. Это решает `hasDom`; по умолчанию он
проверяет `globalThis.document`. Если не сработал ни один регистратор, функция бросает ошибку со списком
всех попыток.

::: details Только для своего preload: что делает copyWindowGlobals
`copyWindowGlobals` всегда перезаписывает пять глобальных объектов: `window`, `document`, `navigator`,
`location` и `history`. Остальные копируются, только если в `target` их ещё нет. Если среда выполнения
не даёт переопределить один из пяти, вы получите предупреждение с его именем и исходной ошибкой. Без
предупреждения прогон упал бы позже с `document is not defined`. Если вы видите это предупреждение, поставьте preload, который поднимает DOM, первым в списке `preload`. Если среда не даёт переопределить другой глобальный объект, копирование молча его пропускает, и остаётся версия самой среды.
:::

## О чём стоит знать {#limits-worth-knowing}

- **Сигнальный `input()` не привязывается.** Под Bun Angular компилирует компоненты во время теста
  (JIT), а этот компилятор регистрирует только поля с `@Input()`. Поэтому `componentRef.setInput('step', 5)`
  и `inputs` у `renderShallow` печатают `NG0303` (ошибка Angular «не удалось привязать») и ничего не устанавливают в поле `input()` или
  `model()`. Объявите такой вход через `@Input()` или оставьте эту спеку на Vitest: там плагин сборки
  Angular компилирует компонент заранее. Хелпер библиотеки `setInputs()` упирается в то же ограничение, но бросает ошибку с именем входа, а не молчит.
- **Встраивание — замена текста, а не разбор кода.** `templateUrl`, который стоит внутри комментария или внутри другой строки, остаётся как есть. Интерполяция `${…}` или литерал регулярного выражения может сбить эту замену. Если шаблон не загрузился, поищите их рядом с декоратором `@Component`.
- **Номера строк не меняются.** Каждое встроенное значение — однострочный литерал, поэтому стек ошибки
  указывает на нужную строку компонента.
- **`node_modules` пропускается.** Опубликованные Angular-библиотеки уже скомпилированы.
- **Точка входа — только ESM.** Она ждёт DOM через `await` на верхнем уровне, а в CommonJS так нельзя.
  Bun выполняет ESM напрямую, так что вы ничего не теряете.

## Подробнее {#in-depth}

### Зачем Angular на Bun нужен preload {#why-bun-needs-a-preload-for-angular}

У Angular нет интеграции с `bun test`. Не хватает двух вещей, и любая из них ломает каждую спеку
компонента:

1. **Нет DOM.** В Bun его нет, а всё, начиная с `platformBrowserTesting()`, читает `document`.
2. **Шаблоны не загружаются.** `@Component({ templateUrl: './x.html' })` — не импорт, поэтому HTML-файл
   никто не загружает. Тогда компилятор Angular отказывается собирать компонент
   (_«Component X is not resolved»_). На Vitest `@analogjs/vite-plugin-angular` встраивает шаблон, пока
   преобразует файл. У Bun такого шага нет, поэтому это делает preload.
