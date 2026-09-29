---
title: Журнал вызовов
description: createLog — один журнал, в который пишут несколько объектов, чтобы спека проверяла порядок вызовов между ними одним значением.
---

# Журнал вызовов

`createLog()` даёт журнал, в который пишут несколько объектов. Затем спека проверяет весь порядок
вызовов одной строкой. Используйте его, когда порядок важен: шаги завершения, хуки жизненного цикла,
guard-ы, resolver-ы, уборка.

```ts
import { createLog } from 'vitest-auto-spy';

it('shuts down in order', () => {
  const log = createLog<'drop-cache' | 'flush-telemetry' | 'stop-engine'>();

  engine.onShutdown(log.fn('drop-cache'));
  engine.onShutdown(log.fn('flush-telemetry'));
  engine.onShutdown(log.fn('stop-engine'));

  engine.shutdown();

  expect(log.result()).toBe('drop-cache; flush-telemetry; stop-engine');
});
```

При падении настоящий порядок видно в диффе.

Почему не спаи:

- по `toHaveBeenCalled` на каждый спай проходит при любом порядке, даже обратном;
- `toHaveBeenCalledBefore` сравнивает только пары спаев. Чем больше объектов, тем больше таких
  проверок, а вызов, который спека забыла назвать, всё равно пропускается;
- самописный массив меток времени — тот же журнал, только без готовых проверок.

Хелпер сделан по образцу внутреннего тестового класса `Log` из самого Angular, который Angular
использует для таких же тестов.

## Члены {#the-members}

| Член         | Что делает                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `add(value)` | добавляет одну запись: объект сообщает, до какого шага дошёл                                        |
| `fn(value)`  | возвращает колбэк, который записывает `value`, когда его вызвали; для обработчиков, хуков, guard-ов |
| `clear()`    | удаляет все записи, оставляя тот же объект журнала                                                  |
| `items`      | записи на этот момент, по порядку; каждое чтение возвращает новую копию                             |
| `result()`   | записи одной строкой через `'; '`, или `''`, если ничего не записано                                |

Колбэк, который возвращает `fn()`, не смотрит на переданные ему аргументы и возвращает `undefined`.
Поэтому он подходит в любое место, где ждут колбэк.

Параметр типа — объединение строковых литералов, например `createLog<'init' | 'ready' | 'destroy'>()`.
Тогда шаг, которого нет в этом списке, — ошибка компиляции, и опечатка в журнал не попадёт.

**Частая ошибка:** проверять `items` через `toEqual`, когда нужен только порядок. `result()` даёт
одну строку, которую удобно читать в диффе падения.

## Запись в журнал из существующих спаев {#logging-from-existing-spies}

Если зависимости — это спаи, которые у вас уже есть, пусть каждый спай пишет в журнал и возвращает то,
что нужно вашему коду:

```ts
import { createLog, createSpyFromClass } from 'vitest-auto-spy';

const log = createLog<'validate' | 'save' | 'navigate'>();
const steps = createSpyFromClass(StepService);
const router = createSpyFromClass(Router);

steps.validate.mockImplementation(() => {
  log.add('validate');
  return true;
});
steps.save.mockImplementation(async () => {
  log.add('save');
});
router.navigate.mockImplementation(async () => {
  log.add('navigate');
  return true;
});

await wizard.finish();

expect(log.result()).toBe('validate; save; navigate');
```

Запись появляется в момент вызова, а не когда промис завершится. `log.fn('step')` используйте только
там, где возвращаемое значение не важно: обработчики событий,
хуки.

## Рецепт для Angular: журнал — это зависимость {#the-angular-recipe-the-log-is-the-collaborator}

Если код приложения может сам записывать в журнал свои шаги, спаи не нужны вовсе. Через DI это один
провайдер:

```ts
import { Component, InjectionToken, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type CallLog, createLog } from 'vitest-auto-spy';

const PANEL_LOG = new InjectionToken<CallLog<'init' | 'ready' | 'destroy'>>('panel log');

@Component({ selector: 'panel', template: '' })
class Panel {
  private readonly log = inject(PANEL_LOG);

  ngOnInit(): void {
    this.log.add('init');
  }

  ngAfterViewInit(): void {
    this.log.add('ready');
  }

  ngOnDestroy(): void {
    this.log.add('destroy');
  }
}

it('runs the lifecycle in order', () => {
  const log = createLog<'init' | 'ready' | 'destroy'>();

  TestBed.configureTestingModule({ providers: [{ provide: PANEL_LOG, useValue: log }] });
  TestBed.createComponent(Panel).destroy();

  expect(log.result()).toBe('init; ready; destroy');
});
```

Журнал ничего не знает ни об Angular, ни о тест-раннере. Он одинаково работает в Vitest, `bun test`
и `node:test`, а также в обычном юнит-тесте без `TestBed`.
