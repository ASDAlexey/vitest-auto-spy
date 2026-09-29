---
title: node:test
description: vitest-auto-spy на встроенном тест-раннере Node - готовый пример, чем отличаются моки node:test, имена спаев и освобождение памяти моков.
---

# node:test

Точка входа `vitest-auto-spy/node` нужна, когда тесты запускаются встроенным в Node `node --test`.
Хелперы библиотеки те же, что на Vitest; собственные методы мока раннера отличаются (см. таблицу
ниже). Спаи строятся на `mock.fn()` из `node:test`.

```js
// greeter.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSpyFromClass } from 'vitest-auto-spy/node';

class UserService {
  getName(id) {
    return `user-${id}`;
  }

  async load(id) {
    return `loaded-${id}`;
  }
}

// проверяемый код: получает UserService через конструктор
class Greeter {
  constructor(users) {
    this.users = users;
  }

  greet(id) {
    return `Hello, ${this.users.getName(id)}!`;
  }

  async welcome(id) {
    return `Welcome, ${await this.users.load(id)}`;
  }
}

describe('Greeter', () => {
  it('greets the user the service returns', async () => {
    const users = createSpyFromClass(UserService);
    const greeter = new Greeter(users);

    users.getName.calledWith(7).mockReturnValue('Ada'); // отвечает только на getName(7)
    users.load.resolveWith('Ada'); // без calledWith: отвечает на любой вызов

    assert.equal(greeter.greet(7), 'Hello, Ada!');
    assert.equal(await greeter.welcome(1), 'Welcome, Ada');
    assert.deepEqual(users.getName.mock.calls[0].arguments, [7]);
  });
});
```

```bash
node --test
```

- В `node:test` нет `expect`, поэтому пример проверяет через `node:assert`.
- Обязательная настройка — только импорт точки входа. [`trackNodeMocks()`](#tracknodemocks) —
  необязательное дополнение для больших прогонов, которые растут в памяти.
- На Node 24 `node --test` запускает и файлы `*.test.ts`: Node сам убирает аннотации типов.
  Синтаксису, который нужно компилировать, например `enum`, нужен загрузчик вроде `tsx`.
- В TypeScript тип спая — `Spy<UserService>`: `import { type Spy } from 'vitest-auto-spy/node'`.
- `resolveWith` принимает любое значение, которым должен разрешиться промис, в том числе массив:
  `api.get.resolveWith([{ id: 1 }])`.

## Где расходятся собственные методы моков {#where-the-native-surface-differs}

Хелперы библиотеки (`calledWith`, `resolveWith`, `nextWith`, …) одинаковы на всех раннерах.
Собственные методы мока раннера — нет: моки `node:test` устроены не как в Jest.

| Что нужно             | Vitest / Bun                        | `node:test`                                                                                           |
| --------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Записанные вызовы     | `spy.method.mock.calls[0]` → args   | `spy.method.mock.calls[0].arguments`                                                                  |
| Заменить реализацию   | `spy.method.mockImplementation(fn)` | `spy.method.mock.mockImplementation(fn)`                                                              |
| Сбросить              | `spy.method.mockReset()`            | `spy.method.mock.resetCalls()` чистит вызовы; `spy.method.mock.restore()` возвращает исходную функцию |
| Прочитать имя спая    | `spy.method.getMockName()`          | **нет**: читайте `spy.method.name`                                                                    |
| Возвращаемое значение | `spy.method.mockReturnValue(v)`     | у самого мока **нет**: используйте `spy.method.calledWith(...).mockReturnValue(v)`, см. ниже          |

**Частая ошибка:** `spy.method.mockReturnValue('x')` на `node:test`. Это метод мока Vitest/Bun, здесь
он `undefined`, и вызов бросает ошибку. Используйте версию библиотеки — она работает на любом раннере:

```js
users.getName.calledWith(7).mockReturnValue('seven'); // ✅ везде
users.getName.mockReturnValue('seven'); // ❌ не на node:test
```

Чтобы одним вызовом очистить и вызовы, и настроенные ответы на любом раннере, используйте
`resetAutoSpy(users)`.

Ещё две вещи работают как на Vitest и Bun:

- `resetAutoSpy(users)` (из `vitest-auto-spy/node`) убирает реализацию, которую тест поставил через
  `spy.method.mock.mockImplementation()`, включая спаи на аксессоры. После этого спай снова отвечает
  через `calledWith` и остальные хелперы.
- `mock.settledResults` добавляет библиотека, потому что `node:test` его не ведёт. Он читается как
  `{ type: 'fulfilled' | 'incomplete' | 'rejected', value }`, как на Vitest; `'incomplete'` значит, что
  промис ещё не завершился. См.
  [Управляющие хелперы → Разбор итога промиса](/ru/core/control-helpers#settled-results).

## Рядом с этой точкой входа {#beside-this-entry}

Эти точки входа тоже работают под `node:test` без установленного Vitest:

- `vitest-auto-spy/console`: [`useConsoleSpies()`](/ru/utilities/console) регистрирует свои хуки на
  `beforeEach` / `afterEach` из `node:test`, как только импортирована эта точка входа. Её типы тоже не упоминают `vitest`.
- `vitest-auto-spy/nestjs`: хелперы Nest строят моки `node:test`. Эта точка входа также экспортирует
  `createNestUnit` и его типы, так что [тестам Nest](/ru/adapters/nestjs#any-runner) хватает одного
  импорта.

Остальные точки входа (корневая `vitest-auto-spy`, `/angular`, `/setup`, `/dom-stubs`, `/react`,
`/vue`, …) импортируют `vitest`. Без установленного Vitest прогон останавливается до первого теста с
`Cannot find package 'vitest' imported from …/node_modules/vitest-auto-spy/dist/<entry>.js`. Берите
фабрики из этой точки входа. `npx vitest-auto-spy doctor` сообщает о таком импорте как
[`vitest-entry-without-vitest`](/ru/utilities/cli#vitest-entry-without-vitest) и называет нужную точку
входа.

Типы этой точки входа не ссылаются на `vitest`, поэтому проект без Vitest проходит проверку типов
без ошибок, даже с `skipLibCheck: false`. У `Spy<T>` здесь те же члены, что на Vitest,
кроме `mockThrow` из Vitest; `failWith()` делает то же самое на любом раннере.

## Имена спаев {#spy-names}

Каждый спай назван по своему методу, как на Vitest и Bun. Имя видно в диффах `node:assert`, в
`util.inspect()` и в сообщениях библиотеки. Например, `getName` настроен принимать только `7`
(`mustBeCalledWith`), а проверяемый код по ошибке передал ему функцию. Сообщение будет таким:

```txt
[vitest-auto-spy] getName is set up with mustBeCalledWith, and this call matches none of its configs — argument 1: expected 7, got [Function: getName].
Wanted: getName(7)
Actual: getName([Function: getName])
Fix the value the code under test passes, or configure this call too.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/control-helpers#what-a-mustbecalledwith-failure-prints
```

- У спая заданы `name` и `displayName`. Они сохраняются после `mock.reset()` на объекте `mock` из
  `node:test`, после `spy.method.mock.restore()`, `spy.method.mock.resetCalls()` и замены через
  `mockImplementation()`.
- `getMockName()` у мока `node:test` нет. Читайте `spy.method.name`.
- Собственный репортер `node:test` называет упавший **тест**, а не мок. Имя спая видно только там, где
  спай выводится как значение: в диффе проверки, в `util.inspect`, в сообщении библиотеки.

## Каждый мок удерживается, пока не выброшен трекер {#every-mock-is-retained-until-the-tracker-is-dropped}

`node:test` записывает каждый `mock.fn()` в трекер — объект `mock`, который вы импортируете из
`node:test` (это `MockTracker`). Не путайте его со `spy.method.mock` — записью вызовов одного спая.
Трекер хранит каждый мок до конца процесса. Ненужный больше спай остаётся в памяти вместе со всем, что
он записал. Очищает трекер только `mock.reset()` на объекте `mock` из `node:test`, и он же возвращает
всем мокам исходные реализации и забывает их. Например, 20 000 спаев класса с 10 методами держали
около 120 МБ памяти до конца процесса.

### `trackNodeMocks()` {#tracknodemocks}

Вызовите его один раз, как можно раньше. После этого библиотека создаёт спаи на своём трекере и после
каждого теста заменяет его новым, так что старые спаи освобождаются. Функция возвращает другую
функцию, которая выключает отслеживание. Повторный вызов `trackNodeMocks()`, пока отслеживание
включено, ничего не делает.
В примере выше те же 20 000 спаев держали 5,9 МБ вместо 124,5 МБ (замер — на странице
[Производительность](/ru/core/performance#on-node-test)).

```js
import { before, describe, it } from 'node:test';
import { createSpyFromClass, trackNodeMocks } from 'vitest-auto-spy/node';

before(() => {
  trackNodeMocks();
});
```

- **Он никогда не вызывает `mock.reset()` на объекте `mock` из `node:test`,** поэтому моки `mock.fn()`, созданные тестом вручную,
  продолжают работать. Спаи продолжают записывать вызовы и сохраняют реализацию после замены трекера.
- **Он не переносит уже созданные спаи.** Спаи, созданные до вызова, остаются в трекере `mock` из `node:test`.
  Вызывайте его как можно раньше в файле.
- **Он никогда не бросает ошибку.** Если будущая версия Node изменит то, как `node:test` создаёт
  трекеры, `trackNodeMocks()` молча ничего не сделает: тесты пройдут, но память не освободится. См.
  [Подробнее](#in-depth).
- Без вызова ничего не меняется: поведение включается только явно.

С ним идут два необязательных хелпера:

| Экспорт            | Что делает                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `pruneNodeMocks()` | освобождает спаи сейчас и возвращает их число; для тестов, идущих в одном файле параллельно |
| `countNodeMocks()` | возвращает текущее число отслеживаемых спаев, для теста, который его проверяет              |

### Запасной вариант для набора, которому хелпер не нужен {#the-fallback-for-a-suite-that-does-not-want-the-helper}

`mock.reset()` на объекте `mock` из `node:test`, вызванный в `afterEach`, тоже освобождает всё и не требует ничего из этого пакета. Но он ещё и
восстанавливает и забывает все `mock.fn()`, созданные самим тестом:

```js
import { afterEach, mock } from 'node:test';

afterEach(() => {
  mock.reset();
});
```

Vitest и Bun очищают свои списки моков между файлами, так что этот раздел касается только `node:test`.

::: tip Какой раннер выбрать
`node:test` не требует ничего, кроме Node, поэтому подходит библиотеке без сборки. Для приложения
удобнее [Vitest](/ru/runtimes/vitest) или [Bun](/ru/runtimes/bun): в обоих есть `expect` и режим
наблюдения.
:::

## Подробнее {#in-depth}

`trackNodeMocks()` создаёт свой трекер через `mock.constructor` — это не документированный API Node.
Прежде чем направить туда хоть один спай, он проверяет, что это работает. Если проверка не прошла,
спаи остаются на объекте `mock` из `node:test`, как без хелпера.
