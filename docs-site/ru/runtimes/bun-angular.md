---
title: Angular на Bun
description: Как настроить Angular TestBed для bun test, в том числе для компонентов с шаблонами в отдельных файлах.
---

# Angular на Bun (`bun:test`)

С `vitest-auto-spy/bun-angular` можно запускать тесты Angular с `TestBed` через `bun test`, даже если
компонент загружает шаблон из файла через `templateUrl`. После [настройки](#setup) тест пишется почти
так же, как на Vitest. В `profile.component.test.ts` проверьте, что компонент показывает имя из
`UserService`:

```ts
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
    await stable(fixture);

    expect(fixture.nativeElement.textContent).toContain('Hello, Ada!');
  });
});
```

Нужны [Angular 20 или новее](/ru/core/compatibility#angular-20), `@angular/platform-browser` (он уже
есть в приложениях Angular CLI) и пакет с DOM.

## Настройка {#setup}

1. Установите библиотеку и пакет с DOM. У Bun нет своего DOM, а тестовой платформе Angular нужен
   `document`.

   ```bash
   bun add -d vitest-auto-spy @happy-dom/global-registrator
   ```

   Вместо `@happy-dom/global-registrator` можно установить `jsdom`. Чтобы редактор видел типы
   `bun:test`, установите `@types/bun`, если его ещё нет. Bun читает настройки декораторов из
   `tsconfig.json`. В проекте Angular CLI менять их не нужно.

2. Добавьте один **preload** в `bunfig.toml` в корне проекта. Bun выполнит его до загрузки тестов.

   ```toml
   # bunfig.toml
   [test]
   preload = ["vitest-auto-spy/bun-angular"]
   ```

::: warning Это обязательно preload
Оставьте строку в `bunfig.toml`, даже если импортируете `vitest-auto-spy/bun-angular` в тесте.
К моменту такого импорта начинать встраивание шаблонов уже поздно.
:::

**Частая ошибка:** запуск останавливается с сообщением
`registerDomGlobals: no DOM could be installed, so Angular's TestBed cannot run.` Установите один из
пакетов с DOM из шага 1.

Preload:

- добавляет `window`, `document` и другие глобальные объекты браузера, если DOM ещё нет. Сначала
  пробует `@happy-dom/global-registrator`, затем `jsdom`;
- читает файлы из `templateUrl`, `styleUrl` и `styleUrls` и встраивает их в код компонента, чтобы
  Angular мог скомпилировать его во время теста;
- настраивает **zoneless** `TestBed`: Angular обнаруживает изменения по сигналам, без Zone.js;
- вызывает `TestBed.resetTestingModule()` после каждого теста. Свой `afterEach` для `TestBed` и спаев
  из `provideAutoSpy` не нужен;
- создаёт спаи через `mock()` из Bun. Используйте знакомые методы вроде `mockReturnValue` и
  `mockResolvedValue`, как у `vi.fn()` в Vitest.

## Как писать спеку {#writing-a-spec}

При переносе теста с Vitest на Bun импортируйте `describe`, `it` и `expect` из `bun:test`.
Хелперы Angular импортируйте из `vitest-auto-spy/bun-angular`, как в полном примере выше.

- Добавьте standalone-компонент в `imports`. Если компонент объявлен в NgModule, добавьте его в
  `declarations`.
- `injectSpy(UserService)` возвращает спай, который внедряет `TestBed`. Настройте возвращаемые
  значения до вызова `createComponent`.
- У `ProfileComponent` в примере есть `templateUrl`. Его шаблон выводит `Hello, {{ name }}!`.

Запустите тесты. Bun найдёт файлы `*.test.ts` и `*.spec.ts`:

```bash
bun test
```

Если тесты проходят по отдельности, но падают вместе, добавьте `--isolate`. Тогда у каждого файла
будут свои глобальные объекты.

**Частая ошибка:** в тесте на Bun нельзя задать входы, объявленные через сигнальный `input()`.
См. [О чём стоит знать](#limits-worth-knowing).

## Что вы получаете {#what-you-get}

| Хелпер                                                                               | Работает на Bun | Примечания                                                             |
| ------------------------------------------------------------------------------------ | :-------------: | ---------------------------------------------------------------------- |
| `provideAutoSpy` / `injectSpy`                                                       |       ✅        | Как на Vitest.                                                         |
| `renderShallow` / `prepareShallow`                                                   |       ✅        | Настоящий `ComponentFixture` без дочерних компонентов.                 |
| `createWithAutoSpies`                                                                |       ✅        | Создаёт экземпляр через DI Angular и подменяет все зависимости спаями. |
| `hostElement` / `queryElement`                                                       |       ✅        | Типизированные элементы фикстуры с проверкой через `instanceof`.       |
| `findDirective`                                                                      |       ✅        | Возвращает единственный экземпляр директивы в фикстуре.                |
| `stable`                                                                             |       ✅        | Ждёт, пока компонент отрисуется.                                       |
| `flushEffects`                                                                       |       ✅        | Выполняет ожидающие эффекты сигналов.                                  |
| `runEffect`, `setInputs`, `settleResource`, `trackEffectRuns`, `trackRecomputations` |       ✅        | Как на Vitest, но `setInputs` не задаёт сигнальный `input()`.          |
| Основной API библиотеки (`createSpyFromClass`, `createAutoMock`, …)                  |       ✅        | Тоже импортируется из `vitest-auto-spy/bun-angular`.                   |
| `registerSignalMatchers`                                                             |       ❌        | Нужен `expect.extend` из Vitest.                                       |
| `registerDirectiveMatchers`                                                          |       ❌        | Нужен `expect.extend` из Vitest.                                       |
| `registerResourceMatchers`                                                           |       ❌        | Нужен `expect.extend` из Vitest.                                       |
| Диагностика TestBed (`instrumentTestBed`)                                            |       ❌        | Нужны хуки Vitest на уровне файла.                                     |
| Остальное из `/angular`                                                              |       ❌        | Только Vitest. Список ниже.                                            |

На Bun `findDirective` позволяет прочитать состояние директивы без матчера `toHaveDirectiveApplied`.
Если компонент отрисовывает ровно одну `HighlightDirective`, найдите её после `await stable(fixture)`:

```ts
import { findDirective, stable } from 'vitest-auto-spy/bun-angular';

import { HighlightDirective } from './highlight.directive';

await stable(fixture);
const highlight = findDirective(fixture, HighlightDirective);
```

Хелпер ищет на хосте фикстуры и во всех его потомках. Если совпадений нет или их несколько, он
бросает ошибку. См. [Тестирование директив](/ru/adapters/angular#a-host-for-a-directive-under-test).

Хелперы из `vitest-auto-spy/angular`, `vitest-auto-spy/angular/diagnostics` и
`vitest-auto-spy/angular/doubles`, которых нет в таблице, доступны только на Vitest. В их числе:

- проверки переопределений и диагностики;
- `extendWithAutoSpies`;
- `provideAutoSpyForToken` и его значения по умолчанию для каждого токена;
- `trackInjections` и `setupAngularTestEnv`;
- фабрики заглушек;
- подмены ресурсов, сигнальных свойств, платформы и диалогов.

## Стили {#stylesheets}

Preload встраивает `.css` как есть, а `.scss`, `.less` и `.styl` заменяет **пустыми** таблицами стилей.
Bun не обрабатывает CSS через препроцессор. В тестах, которые не проверяют стили, компонент всё равно
компилируется и отрисовывается.

Если нужен текст других стилей, [соберите свой preload](#building-your-own-preload). В хуке `onLoad`
плагина `Bun.plugin` передайте текст и путь файла, а также расширения, которые нужно встроить:

```ts
inlineAngularResources(source, path, { inlineStyleExtensions: ['.css', '.scss'] });
```

| Опция                   | Тип                 | По умолчанию | Смысл                                                          |
| ----------------------- | ------------------- | ------------ | -------------------------------------------------------------- |
| `inlineStyleExtensions` | `readonly string[]` | `['.css']`   | Встраивает текст файлов с этими расширениями. Остальные пусты. |

### Шаблон или стили, которые не читаются {#a-template-or-stylesheet-that-cannot-be-read}

Указывайте пути в `templateUrl` и `styleUrl` относительно файла компонента, а не корня проекта. Если
preload не может прочитать файл, он сообщает URL, компонент, полный путь и код ошибки файловой
системы (например, `ENOENT` или `EACCES`):

```text
[vitest-auto-spy] cannot read "./profile.component.html" referenced by src/app/profile.component.ts: ENOENT at /project/src/app/profile.component.html.
The path resolves relative to the component file, not the project root; fix the templateUrl or styleUrl.
```

## Что preload сбрасывает, а что оставляет вам {#what-the-preload-resets-and-what-it-leaves-to-you}

Preload сбрасывает тестовый модуль после каждого теста. `TestBed` удаляет спаи из `provideAutoSpy`
вместе с модулем и создаёт новые для следующего теста.

Ни preload, ни `bun:test` не отменяют изменения, сделанные через `spyOn` из Bun или `mockValueProp`
из библиотеки. `mockValueProp` подменяет значение свойства, а `restoreMockedProps()` возвращает его.

На Vitest обе подмены после каждого теста отменяет `setupAutoSpy()`. На Bun он не работает. Вместо
него добавьте второй preload с `afterEach` (см.
[Bun → Между тестами ничего не восстанавливается](/ru/runtimes/bun#nothing-is-restored-between-tests)):

```toml
# bunfig.toml
[test]
preload = ["vitest-auto-spy/bun-angular", "./bun-test-setup.ts"]
```

Вызывайте `mock.module()` тоже во втором preload, до импорта тестируемого кода. Пути в `mock.module()`
указывайте относительно `bun-test-setup.ts`, как в обычном импорте.

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

Если у вас уже есть свой preload, используйте хелперы ниже для настройки DOM или встраивания файлов.
Пример показывает только вызов хелпера для DOM. Импорт `vitest-auto-spy/bun-angular` также запускает
стандартную настройку, поэтому вызов не меняет уже созданный DOM.

```ts
// bun-preload.ts
import { createJsdomRegistrar, registerDomGlobals } from 'vitest-auto-spy/bun-angular';

await registerDomGlobals({
  registrars: [createJsdomRegistrar({ load: () => import('jsdom'), target: globalThis, url: 'https://app.test/' })],
});
```

| Экспорт                                            | Что делает                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `registerDomGlobals({ registrars, hasDom })`       | Пробует регистраторы по порядку и возвращает имя первого сработавшего.         |
| `createJsdomRegistrar({ load, target, url })`      | Создаёт регистратор для `jsdom`. `url` по умолчанию — `http://localhost/`.     |
| `createGlobalRegistratorRegistrar({ name, load })` | Создаёт регистратор для `@happy-dom/global-registrator`.                       |
| `copyWindowGlobals(source, target)`                | Копирует глобальные объекты окна в `target`.                                   |
| `inlineAngularResources(source, path, options)`    | Встраивает `templateUrl`, `styleUrl` и `styleUrls`. См. [Стили](#stylesheets). |

`registerDomGlobals` возвращает `undefined`, если `hasDom` находит DOM. По умолчанию `hasDom`
проверяет `globalThis.document`. Если не сработает ни один регистратор, в ошибке будут все попытки.

::: details Только для своего preload: что делает copyWindowGlobals
`copyWindowGlobals` всегда пытается перезаписать `window`, `document`, `navigator`, `location` и
`history`. Остальные глобальные объекты он копирует, только если их ещё нет в `target`.

Если среда не даёт перезаписать один из этих пяти объектов, предупреждение называет его и показывает
исходную ошибку. Без предупреждения первым признаком проблемы могла бы стать ошибка
`document is not defined`. Поставьте preload, который настраивает DOM, первым в списке `preload`.
Если среда отклонит любой другой глобальный объект, хелпер сохранит её значение без предупреждения.
:::

## О чём стоит знать {#limits-worth-knowing}

- **Сигнальный `input()` не привязывается.** На Bun Angular компилирует компоненты во время теста
  (JIT) и регистрирует только поля с `@Input()`. Для полей `input()` и `model()` вызов
  `componentRef.setInput('step', 5)` и опция `inputs` у `renderShallow` выводят ошибку привязки
  `NG0303` и не задают значения. `setInputs()` вместо этого бросает ошибку с именем входа.
  Используйте `@Input()` или оставьте тест на Vitest, где плагин Angular компилирует компонент заранее.
- **Встраивание — замена текста, а не разбор кода.** Preload не трогает `templateUrl` внутри
  комментария или строки. Если шаблон не загрузился, поищите рядом с `@Component` интерполяцию `${…}`
  или литерал регулярного выражения: они могут помешать замене.
- **Номера строк не меняются.** Встроенные значения занимают одну строку, поэтому стек ошибки
  по-прежнему указывает на нужную строку компонента.
- **`node_modules` пропускается.** Опубликованные библиотеки Angular уже скомпилированы.
- **Точка входа — только ESM.** Она ждёт DOM через `await` на верхнем уровне. CommonJS этого не
  поддерживает, а Bun выполняет ESM напрямую.

## Подробнее {#in-depth}

### Зачем Angular на Bun нужен preload {#why-bun-needs-a-preload-for-angular}

У Angular нет интеграции с `bun test`. Тест компонента может остановиться по двум причинам:

1. **Нет DOM.** Bun его не предоставляет, а Angular нужен `document`, начиная с
   `platformBrowserTesting()`.
2. **Шаблоны не загружаются.** `@Component({ templateUrl: './x.html' })` указывает путь, но не
   импортирует файл. Без его содержимого компилятор Angular выдаёт `Component X is not resolved`.
   На Vitest `@analogjs/vite-plugin-angular` встраивает шаблон при преобразовании файла компонента.
   На Bun это делает preload.
