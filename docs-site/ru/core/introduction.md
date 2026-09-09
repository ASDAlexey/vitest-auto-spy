---
title: Введение
description: Что делает vitest-auto-spy — типизированный спай на каждый метод класса, на Vitest, Bun, node:test или Rstest.
---

# Введение

`vitest-auto-spy` читает класс и генерирует типизированный спай (spy) для **каждого** метода,
опираясь на примитив моков вашего раннера (`vi.fn()` в Vitest и его аналоги в Bun, `node:test` и Rstest).
Это прямая замена [`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies): тот же API,
только работает на Vitest-совместимых раннерах, а не на Jest.

Мокать сервис руками — занятие муторное и хрупкое: по строке `vi.fn()` на метод, и всё это
приходится синхронизировать вручную. Вместо этого:

```ts
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

let userService: Spy<UserService>;

beforeEach(() => {
  userService = createSpyFromClass(UserService);
});
```

`Spy<UserService>` отдаёт каждый метод как мок **плюс** подходящие хелперы, выбранные по типу
возвращаемого значения: `resolveWith` / `rejectWith` для `Promise`, `nextWith` / `throwWith` для
`Observable` из RxJS и `calledWith` / `mustBeCalledWith` для сопоставления аргументов.

Класса под рукой нет? Замокайте прямо от **типа или интерфейса** через `createAutoMock<T>()` или
соберите рекурсивный самозаполняющийся мок через `mockDeep<T>()`. Для дубля, который код под тестом
только **читает** — DTO, снимок роута, объект конфигурации, — `createMock<T>(partial?)` вернёт вместо
этого обычный `T` без спаев, а `createFixtureFactory<T>(defaults)` — то место, где модель, общая
для всей сюиты, выписывается и проверяется один раз. См. [Автомок по типу](./auto-mock-by-type) и
[Фикстуры без приведений типов](/ru/utilities/fixtures).

## Где это работает {#where-it-runs}

Ядро никогда не импортирует ваш тест-раннер напрямую: `vi.fn()` и его аналоги спрятаны за
`MockAdapter`, который каждая точка входа регистрирует при импорте. Выберите ту, что соответствует
вашему раннеру, — остальной API одинаков.

```ts
import { createSpyFromClass } from 'vitest-auto-spy'; // Vitest (по умолчанию, без настройки)
import { createSpyFromClass } from 'vitest-auto-spy/bun'; // Bun — bun:test
import { createSpyFromClass } from 'vitest-auto-spy/node'; // node:test
import { createSpyFromClass } from 'vitest-auto-spy/rstest'; // Rstest
```

Ангуляровский `TestBed` работает и на Bun — такого больше нет нигде, см.
[Angular на Bun](/ru/runtimes/bun-angular).

Дальше: [Установка](./installation) — про подключение, или
[`createSpyFromClass`](./create-spy-from-class) — про полный набор настроек.
