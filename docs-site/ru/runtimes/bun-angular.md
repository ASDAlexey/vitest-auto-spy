---
title: Angular на Bun
description: Как запускать TestBed из Angular под bun test — DOM, JIT-шаблоны и zoneless-обнаружение изменений из одного preload.
---

# Angular на Bun (`bun:test`)

У Angular нет собственной интеграции с `bun test`. Не хватает двух вещей, и каждая из них фатальна сама
по себе:

1. **Нет DOM.** Bun его не поставляет, а всё, начиная с `platformBrowserTesting()`, читает `document`.
2. **Не разрешаются шаблоны.** `@Component({ templateUrl: './x.html' })` — это не импорт, ничто в графе
   модулей не указывает на HTML-файл, — поэтому JIT-компилятор Angular отказывается собирать компонент
   (_«Component X is not resolved»_). Под Vitest `@analogjs/vite-plugin-angular` подставляет шаблон на
   этапе трансформации. У Bun такой трансформации нет.

`vitest-auto-spy/bun-angular` закрывает обе дыры и всю обвязку вокруг них из одного preload.

## Настройка {#setup}

```toml
# bunfig.toml
[test]
preload = ["vitest-auto-spy/bun-angular"]
```

```bash
bun add -d @happy-dom/global-registrator   # или: bun add -d jsdom
```

Это вся конфигурация. При загрузке точка входа:

1. ставит DOM — `@happy-dom/global-registrator`, если он есть, иначе `jsdom`, и вообще ничего, если DOM
   уже на месте;
2. регистрирует хук `onLoad` через `Bun.plugin`, который встраивает `templateUrl` / `styleUrl` /
   `styleUrls` прямо в исходник компонента;
3. поднимает **zoneless**-окружение `TestBed` и сбрасывает тестовый модуль после каждого теста;
4. регистрирует mock-адаптер Bun, так что каждый хелпер спая — уже от Bun.

::: warning Это обязательно preload
Хук `Bun.plugin` видит только модули, загруженные **после** его регистрации. Импортировать эту точку входа
изнутри спеки поздно для тестируемого компонента: его шаблон не будет встроен. Импортировать её из спеки
**дополнительно** — нормально: модуль кешируется, и каждый шаг защищён проверкой.
:::

## Как писать спеку {#writing-a-spec}

Дальше спека читается ровно так же, как её аналог на Vitest.

```ts
// greeting.test.ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'bun:test';
import { injectSpy, provideAutoSpy, stable } from 'vitest-auto-spy/bun-angular';

import { GreetingComponent } from './greeting.component';
// объявлен через templateUrl
import { GreetingService } from './greeting.service';

describe('GreetingComponent', () => {
  it('renders the name the service returns', async () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(GreetingService)] });

    injectSpy(GreetingService).currentName.mockReturnValue('external user');

    const fixture = TestBed.createComponent(GreetingComponent);

    await stable(fixture);

    expect(fixture.nativeElement.textContent).toContain('Hello, external user!');
  });
});
```

```bash
bun test              # добавьте --isolate, чтобы получить свежий глобальный объект на файл
```

## Что вы получаете {#what-you-get}

| Хелпер                                    | Работает на Bun | Примечания                                                     |
| ----------------------------------------- | :-------------: | -------------------------------------------------------------- |
| `provideAutoSpy` / `injectSpy`            |       ✅        | идентично точке входа Vitest, спаи по умолчанию ленивые        |
| `renderShallow`                           |       ✅        | настоящий `ComponentFixture`, поддерево потомков отброшено     |
| `createWithAutoSpies`                     |       ✅        | собирает класс через DI Angular со всеми зависимостями в спаях |
| `stable` / `flushEffects`                 |       ✅        | ожидание в zoneless-режиме                                     |
| всё ядро (`createSpyFromClass`, …)        |       ✅        | реэкспортируется из этой точки входа                           |
| `registerSignalMatchers`                  |       ❌        | нужен `expect.extend` раннера — только Vitest                  |
| диагностика TestBed (`instrumentTestBed`) |       ❌        | нужны хуки раннера уровня набора — только Vitest               |

## Стили {#stylesheets}

У тест-раннера нет CSS-препроцессора, и ни одна спека не проверяет стили. Поэтому `.css` встраивается как
есть, а всё остальное (`.scss`, `.less`, `.styl`) превращается в **пустую** таблицу стилей — компонент
всё равно компилируется и рендерится. Переопределите это, если текст стилей вам действительно нужен:

```ts
inlineAngularResources(source, path, { inlineStyleExtensions: ['.css', '.scss'] });
```

## Как собрать собственный preload {#building-your-own-preload}

Экспортируется каждая деталь, поэтому проект со своим preload может собрать их сам, а не брать значения по
умолчанию:

```ts
// bun-preload.ts
import { createJsdomRegistrar, inlineAngularResources, registerDomGlobals } from 'vitest-auto-spy/bun-angular';

await registerDomGlobals({
  registrars: [createJsdomRegistrar({ load: () => import('jsdom'), target: globalThis, url: 'https://app.test/' })],
});
```

`registerDomGlobals` возвращает имя регистратора, который поставил DOM, либо `undefined`, если DOM уже
был, и бросает ошибку со списком всех попыток, если не сработал ни один.

Лежащий под ним шаг копирования, `copyWindowGlobals`, **называет тот обязательный глобальный объект,
который хост отказался переопределить** — `document` и остальные четыре, без которых DOM бесполезен, — с
исходной ошибкой рядом, вместо того чтобы дать прогону упасть позже с `document is not defined` в спеке,
где не упомянут ни хелпер, ни свойство. Отказ по ключу вне этой пятёрки проходит молча: встроенный объект
хоста, сохранивший свою реализацию, — задокументированный исход, а не проблема.

## О чём стоит знать {#limits-worth-knowing}

- **Сигнальный `input()` не привязывается.** Bun компилирует компонент JIT-компилятором, а тот
  заполняет `ɵcmp.inputs` только из `@Input()` — поля `input()` и `model()` туда не попадают, поэтому
  `componentRef.setInput('step', 5)`, как и `inputs` у `renderShallow`, печатают `NG0303` и ничего не
  устанавливают. Объявляйте вход, которым управляет спека под `bun:test`, через `@Input()` — или
  оставьте такую спеку на точке входа Vitest, где Angular-плагин сборки компилирует компонент
  заранее. `setInputs()` хотя бы падает с понятным сообщением, а не оставляет значение прежним.
- **Подстановка текстовая, а не разбор кода.** Она пропускает комментарии и строковые литералы —
  `templateUrl`, упомянутый в прозе, остаётся нетронутым, — но не отслеживает интерполяцию `${…}` и
  регулярные литералы.
- **Номера строк сохраняются.** Каждое встроенное значение — однострочный литерал, поэтому стек упавшей
  спеки по-прежнему указывает на нужную строку самого компонента.
- **`node_modules` пропускается.** Опубликованные Angular-библиотеки уже скомпилированы.
- **Эта точка входа — только ESM.** Она ждёт свой регистратор DOM на верхнем уровне, а у этого нет формы
  для CommonJS. Bun выполняет ESM нативно, так что ничего не теряется.
