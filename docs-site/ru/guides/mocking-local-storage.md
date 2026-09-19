---
title: Мок localStorage в Vitest
description: Подмена localStorage и sessionStorage на каждый тест через stubWebStorage — с сидом, с проверкой как обычной записи, с восстановлением между тестами — и когда рукописный дубль, пакет или спай на Storage.prototype всё ещё уместны.
---

# Мок `localStorage` в Vitest

Большинство руководств отвечают на этот вопрос ритуалом: `Map`-класс на двадцать строк,
`vi.stubGlobal('localStorage', …)`, `afterEach`, который его очищает и возвращает глобал на место, и
сверху `vi.spyOn(Storage.prototype, 'setItem')` для проверок. В каждом проекте заводится своя копия,
и каждая забывает один из четырёх шагов.

`stubWebStorage` — это те же шаги одним вызовом:

```ts
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

С [`setupAutoSpy()`](/ru/utilities/setup) в setup-файле `afterEach` писать не нужно: стаб ставится
через `mockValueProp`, поэтому `restoreMockedProps()`, который тот запускает после каждого теста,
возвращает то, что было в глобале раньше, — собственное хранилище окружения или другой стаб.

## Что вы получаете {#what-you-get}

- **Настоящий `Storage`, а не мешок моков.** `getItem`, `setItem`, `removeItem`, `clear`, `key` и
  `length` ведут себя как платформенные: число, записанное через `setItem`, читается обратно строкой,
  отсутствующий ключ читается как `null`, `key()` приводит индекс так, как приводится
  `unsigned long`. Рукописный дубль, возвращающий `undefined` для отсутствующего ключа, пропускает
  тесты, на которых браузер падает.
- **Сид в том же вызове.** `items` проходит через `setItem`, поэтому приводится ровно так, как его
  сохранил бы код под тестом.
- **Проверка как данные.** `snapshot()` возвращает обычную запись — копию, а не представление, — так
  что проверка — это один `toEqual` на то, что в итоге сохранилось, а тест хранилища почти всегда про
  это.
- **Оба глобала.** Стаб ставится на `globalThis` и, если это отдельный объект, на
  `document.defaultView`, потому что код читает `window.localStorage` так же часто, как голое имя.
- **Любое окружение.** Он ставится и в окружении `node`: спека об этом попросила.

## Когда контракт — сам вызов {#when-the-call-itself-is-the-contract}

Тест хранилища обычно должен проверять, что сохранено, а не как. Когда запись _и есть_ поведение —
кэш, который не должен писать дважды, ключ, который нужно удалить, а не перезаписать, — ставьте спай
на установленное хранилище, а не на `Storage.prototype`:

```ts
it('records the write when the call itself is the contract', () => {
  const setItem = vi.spyOn(local.storage, 'setItem');

  saveTheme('dark');

  expect(setItem).toHaveBeenCalledWith('theme', 'dark');
});
```

`local.storage` — тот объект, которым отвечает глобал до конца теста, поэтому спай видит каждый вызов
и не трогает никакой другой `Storage` в realm.

## Дерево решений из других руководств {#the-decision-tree-the-other-guides-give-you}

| Подход                                     | Чего стоит                                                                                                                                     | Когда брать                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Рукописный `Map`-дубль + `stubGlobal`      | Двадцать строк на проект, восстановление, о котором нужно помнить, и правила приведения, которые нужно не забыть скопировать                   | Никогда, раз есть `stubWebStorage`: это тот же класс с уже подключённым восстановлением         |
| Пакет `…-localstorage-mock` в `setupFiles` | Одно хранилище на весь файл: что записал один тест, то читает следующий, если `afterEach` его не очистит                                       | Сюита, которой хранилище нужно только чтобы _существовать_, и которая ничего в нём не проверяет |
| `vi.spyOn(Storage.prototype, 'setItem')`   | Патчит каждый `Storage` в realm, зависит от того, работает ли хранилище окружения вообще, и не сообщает ничего, чего не сказал бы `snapshot()` | Проверка вызова на собственном хранилище окружения, когда подменить его нельзя                  |
| **`stubWebStorage`**                       | Один импорт из `vitest-auto-spy/dom-stubs`                                                                                                     | Спека, которая засевает хранилище, читает его обратно или не должна видеть записанное ранее     |

## Хранилища просто нет {#storage-that-is-simply-missing}

Другой отказ с теми же симптомами: на Node 25 и новее `localStorage` под окружением Vitest `jsdom`
или `happy-dom` сломан ещё до того, как его тронула хоть одна спека — `setItem is not a function` на
Node 25, `undefined` на Node 26, — потому что копирование глобалов раннером пропускает его, как только
Node определяет свой. Это не та проблема, которую спека должна обходить стабом; `setupAutoSpy()` чинит
её по умолчанию, а механизм описан в разделе
[Web Storage, который раннер так и не передал](/ru/utilities/setup#_14-web-storage-the-runner-never-handed-over).
`stubWebStorage` работает в обоих случаях, потому что заменяет то, что есть.

## Чего он сознательно не делает {#what-it-deliberately-does-not-do}

- **Доступ по именованным свойствам.** `localStorage.token` и `Object.keys(localStorage)` записей не
  видят; идите через `getItem` и `snapshot()`.
- **Событие `storage`.** Другим окнам ничего не рассылается, потому что в тесте их нет.
- **Квота.** `setItem` никогда не бросает `QuotaExceededError`. Чтобы проверить эту ветку, заставьте
  вызов упасть:
  `vi.spyOn(local.storage, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); })`.

## Смотрите также {#related}

- [`stubWebStorage` в справочнике по гигиене прогона](/ru/utilities/setup#stub-web-storage) — API и
  починка, рядом с которой он живёт.
- [Заглушки Observer](/ru/utilities/observer-stubs) — та же схема «поставить и вернуть» для
  `IntersectionObserver`, `ResizeObserver` и `MutationObserver`.
