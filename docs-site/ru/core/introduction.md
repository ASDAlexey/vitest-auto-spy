---
title: Начало работы
description: Поставьте vitest-auto-spy и напишите первую спеку на Angular с типизированным спаем целого сервиса, на Vitest.
---

# Начало работы

`vitest-auto-spy` превращает класс в подмену для теста, где каждый метод — типизированный спай.
Библиотека нужна, когда тестируемый код зависит от сервиса и вы не хотите писать руками по
`vi.fn()` на каждый метод. Эта страница за три шага доводит от установки до зелёной спеки на Angular.

## 1. Установка {#_1-install}

```bash
npm i -D vitest-auto-spy
```

Дальше предполагается Angular-проект, который запускает Vitest командой `ng test` (билдер
`@angular/build:unit-test`). Конфиг менять не нужно. Обычный Vitest, Bun и другие варианты — на
странице [Установка](./installation#wiring-it-up).

## 2. Спека {#_2-write-the-spec}

Пусть `UserService` загружает пользователя через `ApiService`:

```ts
// user.service.ts
import { Injectable, inject } from '@angular/core';

export interface User {
  id: number;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  async get(url: string): Promise<User> {
    const response = await fetch(url);
    return response.json();
  }
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly api = inject(ApiService);

  load(id: number): Promise<User> {
    return this.api.get(`/users/${id}`);
  }
}
```

Спека подменяет `ApiService` спаями и проверяет настоящий `UserService`:

```ts
// user.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

import { ApiService, UserService } from './user.service';

describe('UserService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideAutoSpy(ApiService)],
    });
  });

  it('loads the user from the API', async () => {
    const api = injectSpy(ApiService);
    api.get.resolveWith({ id: 1, name: 'Ada' });

    const user = await TestBed.inject(UserService).load(1);

    expect(user.name).toBe('Ada');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/users/1');
  });
});
```

Что делает каждая строка:

- `provideAutoSpy(ApiService)` регистрирует в `TestBed` подмену `ApiService`. Каждый её метод — спай,
  настоящий `ApiService` не выполняется.
- `injectSpy(ApiService)` достаёт эту подмену из `TestBed` с типом `Spy<ApiService>`. Вызывайте его
  внутри теста или `beforeEach`, после `configureTestingModule`.
- `api.get.resolveWith(...)` заставляет `get` вернуть `Promise`, который разрешается этим значением.
  `resolveWith` есть только у методов, которые возвращают `Promise`; у методов с `Observable` вместо
  него `nextWith`.
- `toHaveBeenCalledTimes` и `toHaveBeenCalledWith` — обычные проверки Vitest: каждый спай
  запоминает свои вызовы.
- `TestBed` собирает новый модуль на каждый тест, поэтому каждый тест начинается со свежих спаев
  без записанных вызовов.

## 3. Запуск {#_3-run-it}

```bash
ng test
```

На обычном Vitest та же спека запускается командой `npx vitest`.

## Что дальше {#next-steps}

- [Angular](/ru/adapters/angular): компоненты, сигналы и остальные хелперы для `TestBed`.
- [`createSpyFromClass`](./create-spy-from-class): те же спаи без `TestBed` и все опции.
- [Управляющие хелперы](./control-helpers): `resolveWith`, `nextWith`, `calledWith` и остальные.
- [Автомок по типу](./auto-mock-by-type): спаи из интерфейса, когда класса нет.
- [Фикстуры без кастов](/ru/utilities/fixtures): тестовые данные через `createMock` и
  `createFixtureFactory`.
- [Установка](./installation): другие раннеры, setup-файл и список точек входа.
- [Переезд с jest-auto-spies](/ru/migrating): API тот же, так что переезд — в основном замена
  импорта.
- [Как это устроено](./how-it-works): почему конструктор не выполняется и как хелперы следуют за
  типом возврата.

## Спай, стаб или мок {#spy-stub-or-mock}

**Спай** запоминает, как его вызвали. **Стаб** отвечает заданными значениями. **Мок** заранее знает,
каких вызовов ждать, и падает на остальных. **Фейк** — упрощённая рабочая реализация.

Вне `TestBed` тот же объект строит напрямую `createSpyFromClass(ApiService)`. И он, и
`provideAutoSpy` дают спай и стаб сразу, для каждого метода:

- каждый вызов запоминается, поэтому работает `toHaveBeenCalledWith`;
- каждый метод отвечает тем, что вы настроили (`mockReturnValue`, `resolveWith`, `calledWith(...)`),
  или `undefined`, если вы ничего не настроили.

Моком он становится, только когда вы попросите. `mustBeCalledWith(...)` бросает ошибку на вызов с
другими аргументами, а [строгий режим](./strict-mode) — на метод, который вы не настроили. Фейком он
не бывает никогда: настоящий класс не выполняется.

Два соседних инструмента. `vi.spyOn(realObject, 'method')` оборачивает один метод настоящего объекта
и вызывает настоящий код. `createMock<T>()` строит простой стаб без спаев — для значений, которые код
только читает. Все термины собраны в [Глоссарии](/ru/glossary).

## Где работает {#where-it-runs}

Спека на Angular импортирует из `vitest-auto-spy/angular`. Вне Angular библиотека одинаково работает
на четырёх раннерах тестов; импортируйте из точки входа под свой:

```ts
import { createSpyFromClass } from 'vitest-auto-spy'; // Vitest
import { createSpyFromClass } from 'vitest-auto-spy/bun'; // Bun (bun:test)
import { createSpyFromClass } from 'vitest-auto-spy/node'; // node:test
import { createSpyFromClass } from 'vitest-auto-spy/rstest'; // Rstest
```

`TestBed` из Angular работает и на Bun: см. [Angular на Bun](/ru/runtimes/bun-angular).
