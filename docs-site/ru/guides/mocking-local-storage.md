---
title: Мок localStorage в Vitest
description: Подмена localStorage или sessionStorage на один тест через stubWebStorage - начальные данные, проверка того, что сохранено, автоматическое восстановление; когда лучше спай на setItem или другой подход.
---

# Мок `localStorage` в Vitest

`stubWebStorage` подменяет `localStorage` или `sessionStorage` новым хранилищем в памяти на один
тест. Начальные данные задаются в том же вызове, а всё сохранённое проверяется одним `toEqual`.

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { type WebStorageStub, stubWebStorage } from 'vitest-auto-spy/dom-stubs';

import { forgetUser, loadTheme, saveTheme } from './preferences';

describe('preferences', () => {
  let local: WebStorageStub;

  beforeEach(() => {
    local = stubWebStorage('localStorage', { items: { theme: 'dark', token: 'abc' } });
  });

  it('reads the saved theme', () => {
    expect(loadTheme()).toBe('dark');
  });

  it('writes the theme back', () => {
    saveTheme('light');

    expect(local.snapshot()).toEqual({ theme: 'light', token: 'abc' });
  });

  it('forgets the user in both storages', () => {
    const session = stubWebStorage('sessionStorage', { items: { draft: '{}' } });

    forgetUser();

    expect(local.snapshot()).toEqual({ theme: 'dark' });
    expect(session.snapshot()).toEqual({});
  });
});
```

**Восстановление после каждого теста.** Вызовите [`setupAutoSpy()`](/ru/utilities/setup) один раз в
сетап-файле (файл из `setupFiles` конфига Vitest). После каждого теста он восстанавливает исходное
хранилище, и `afterEach` писать не нужно:

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy();
```

Без `setupAutoSpy()` восстановите хранилище сами:

```ts
import { afterEach } from 'vitest';
import { restoreMockedProps } from 'vitest-auto-spy';

afterEach(() => restoreMockedProps());
```

## Аргументы и что возвращается {#options-and-return-value}

`stubWebStorage(key?, options?)`

| Аргумент        | Тип                                  | По умолчанию           | Смысл                                                                         |
| --------------- | ------------------------------------ | ---------------------- | ----------------------------------------------------------------------------- |
| `key`           | `'localStorage' \| 'sessionStorage'` | `'localStorage'`       | какой глобал подменить                                                        |
| `options.items` | `Record<string, string>`             | пусто                  | начальное содержимое; записывается через `setItem`                            |
| `options.view`  | `object \| null`                     | `document.defaultView` | ещё один объект окна, куда поставить подмену; `null` — только на `globalThis` |

`view` нужен редко. По умолчанию подмена ставится на `globalThis` и ещё на `document.defaultView`
(`window` из `jsdom` или `happy-dom`), если это другой объект. `view` меняет эту вторую цель:

- передайте другой объект окна, если код читает хранилище из него, например фейковый `window`,
  который вы внедряете;
- передайте `null`, чтобы поставить подмену только на `globalThis`; тогда `window.localStorage`
  останется хранилищем окружения.

Здесь и дальше **хранилище окружения** — настоящий `localStorage`, который даёт тестовое окружение
(`jsdom` или `happy-dom`).

**Начальные значения задавайте через `items`.** `getItem` — настоящий метод, а не спай. Если всё же
нужен принудительный ответ, поставьте на него спай:
`vi.spyOn(local.storage, 'getItem').mockReturnValue('dark')`.

Возвращается `WebStorageStub`:

| Поле         | Что это                                                              |
| ------------ | -------------------------------------------------------------------- |
| `storage`    | установленный объект `Storage`; его возвращает глобал до конца теста |
| `snapshot()` | копия текущего содержимого хранилища в виде обычного объекта         |

## Как ведёт себя подмена {#what-the-stub-behaves-like}

- **Настоящий `Storage`.** `getItem`, `setItem`, `removeItem`, `clear`, `key` и `length` работают как
  в браузере. Число, записанное через `setItem`, читается строкой. Отсутствующий ключ даёт `null`, а
  не `undefined`. Самописный фейк часто ошибается в этом и даёт тесту пройти там, где в браузере код бы
  упал.
- **Заполняется так же, как реальный код.** `items` записываются через `setItem`, поэтому значения
  приводятся к строкам тем же способом.
- **Проверяется как данные.** `snapshot()` возвращает копию, и один `toEqual` проверяет всё
  хранилище.
- **Оба имени.** В `jsdom` и `happy-dom` объект `window` может не совпадать с `globalThis`. Подмена
  ставится на оба, поэтому `localStorage` и `window.localStorage` возвращают одну и ту же подмену.
- **Любое окружение.** Работает и в тестовом окружении `node`, где своего хранилища нет.

## Проверить, что был конкретный вызов {#check-that-a-specific-call-happened}

Обычно тест проверяет, _что_ сохранено, а не _как_. Но иногда сам вызов и есть поведение: кеш не
должен писать дважды, ключ нужно удалить, а не перезаписать. Тогда ставьте спай на установленное
хранилище, а не на `Storage.prototype`:

```ts
it('writes the theme once', () => {
  const setItem = vi.spyOn(local.storage, 'setItem');

  saveTheme('dark');

  expect(setItem).toHaveBeenCalledTimes(1);
  expect(setItem).toHaveBeenCalledWith('theme', 'dark');
});
```

Спай видит каждый вызов вашего кода и не трогает остальные объекты `Storage`.

## Проверить ошибку «хранилище переполнено» {#test-a-storage-is-full-error}

У подмены нет лимита размера, поэтому сама `setItem` никогда не бросает ошибку. Заставьте её:

```ts
vi.spyOn(local.storage, 'setItem').mockImplementation(() => {
  throw new DOMException('full', 'QuotaExceededError');
});
```

## Сравнение с другими подходами {#compared-with-other-approaches}

| Подход                                     | Минус                                                                                               | Когда подходит                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Самописный фейк на `Map` + `vi.stubGlobal` | Около двадцати строк в каждом проекте; нужно не забыть восстановление и правила приведения к строке | Редко: `stubWebStorage` — это и есть такой фейк, со встроенным восстановлением |
| Пакет `…-localstorage-mock` в `setupFiles` | Одно хранилище на весь файл: что записал один тест, читает следующий, если не очистить              | Тестам нужно только, чтобы хранилище существовало                              |
| `vi.spyOn(Storage.prototype, 'setItem')`   | Меняет все объекты `Storage`; зависит от того, работает ли хранилище окружения                      | Нужно проверить вызовы на собственном хранилище окружения                      |
| **`stubWebStorage`**                       | Один импорт из `vitest-auto-spy/dom-stubs`                                                          | Спека задаёт содержимое, читает его или должна начинать с пустого              |

## Если `localStorage` сломан на Node 25 и новее {#troubleshooting-localstorage-is-broken-on-node-25-and-later}

В окружении `jsdom` или `happy-dom` в Vitest на Node 25+ `localStorage` может быть сломан ещё до
запуска спек:

- Node 25: `setItem is not a function`;
- Node 26: `localStorage` равен `undefined`.

Причина: в Node 25 появился собственный глобальный `localStorage`. Vitest копирует глобалы
DOM-окружения на глобальный объект теста, но пропускает имена, которые уже есть. Поэтому остаётся
версия из Node, а рабочее хранилище из `jsdom` или `happy-dom` так и не приходит. `setupAutoSpy()`
чинит это по умолчанию. Подробности — в разделе
[Web Storage, которое раннер так и не передал](/ru/utilities/setup#_14-web-storage-the-runner-never-handed-over).
`stubWebStorage` работает в любом случае: он заменяет то, что есть.

## Ограничения {#limits}

- **Нет доступа к данным через свойства.** `localStorage.token` и `Object.keys(localStorage)` не
  видят данные. Используйте `getItem` и `snapshot()`.
- **Нет события `storage`.** Другим окнам ничего не отправляется: в тесте их нет.
- **Нет лимита размера.** См. [Проверить ошибку «хранилище переполнено»](#test-a-storage-is-full-error).

## Смотрите также {#related}

- [`stubWebStorage` в справочнике по сетапу](/ru/utilities/setup#stub-web-storage): API рядом с
  исправлением для Node 25.
- [Заглушки observer-ов](/ru/utilities/observer-stubs): тот же подход «поставить и вернуть» для
  `IntersectionObserver`, `ResizeObserver` и `MutationObserver`.
