---
title: returns или overrides
description: Два способа засеять дубль там, где он строится; returns задаёт ответ метода-спая, overrides заменяет член значением, которое уже не спай.
---

# `returns` или `overrides`

Обе опции есть у каждой фабрики: `createSpyFromClass`, `provideAutoSpy`, `provideAutoSpyForToken`,
`createAutoMock`. Обе засевают дубль там, где он строится, и ни одна не создаёт второго объекта: спай
один, а каждый ключ настраивает один его член. Разница в том, **остаётся ли этот член спаем**.

```ts
provideAutoSpy(FavoritesService, {
  returns: { load: of([]), isFavorite: false }, // load() и isFavorite() остаются спаями
  overrides: { pointerActive: signal(false), items$: of([]) }, // заменены ровно этими значениями
});
```

## Бок о бок {#side-by-side}

|                        | `returns`                                                              | `overrides`                                                          |
| ---------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Что называет           | метод-спай                                                             | любой член: поле, сигнал, свойство-`Observable`, объект конфигурации |
| Значение — это         | то, что отвечает метод                                                 | сам член                                                             |
| После засева           | по-прежнему спай — `toHaveBeenCalled` работает                         | значение как написано, не спай                                       |
| То же, что написать    | `spy.m.mockReturnValue(x)` в `beforeEach`                              | `spy.p = x` в `beforeEach`                                           |
| Настройка позже        | умолчание: `calledWith`, `mockReturnValue`, `resolveWith` его заменяют | настраивать нечего — присвойте новое значение                        |
| Под `strict`           | считается настройкой, `undefined` тоже                                 | функция, засеянная на метод, считается настройкой                    |
| Ключ, который не метод | отмечается предупреждением: значение никогда не вернётся               | ровно для этого                                                      |

## Что выбрать {#which-one}

Метод — в `returns`, всё остальное — в `overrides`.

```ts
// метод: остаётся проверяемым
provideAutoSpy(CartService, { returns: { total: 0, load: of([]) } });
expect(injectSpy(CartService).load).toHaveBeenCalledOnce();

// состояние: сигнал, поток, поле
provideAutoSpy(LayoutService, { overrides: { isCompact: signal(true), resize$: new Subject<void>() } });
```

`returns: { m: undefined }` имеет смысл только под `strict`: там он явно говорит, что `undefined` и
есть задуманный ответ. Без `strict` ненастроенный метод и так отвечает `undefined`, и запись можно
убрать.

## Функция в `overrides` {#a-function-in-overrides}

Метод, чей ответ зависит от аргументов, — единственный случай, когда метод кладут в `overrides`. В
`createSpyFromClass` и `provideAutoSpy` обычная функция, засеянная на метод,
[остаётся спаем](./create-spy-from-class#overrides-function) и работает как его реализация, так что
вызовы по-прежнему записываются:

```ts
provideAutoSpy(DomSanitizer, { overrides: { sanitize: (_context, value) => String(value) } });
expect(injectSpy(DomSanitizer).sanitize).toHaveBeenCalledOnce();
```

В `createAutoMock` и `provideAutoSpyForToken` тип не говорит, какие члены — методы, поэтому функция
там сохраняется как написана и спаем не становится. `vi.fn()` сохраняется как есть в любой фабрике.

## Член, названный в обеих {#a-member-named-in-both}

Побеждает засев из `overrides`, а `returns` этот член пропускает, а не настраивает, — чем бы ни был
засев: значением, обычной функцией, `vi.fn()`. Тот же приоритет действует между
[регистрацией](./create-spy-from-class#registerautospydefaults-—-the-composition-lives-with-the-class)
и местом вызова: засев места вызова заменяет зарегистрированные `returns` или `selfReturning`.
