---
title: explainSpy
description: Печатает, на какие аргументы настроен спай, рядом с тем, с какими аргументами его на самом деле вызвали, ещё до того, как что-то упало. Точка входа /diagnostics.
---

# explainSpy

`explainSpy(spy)` печатает отчёт: на какие наборы аргументов настроен спай и на какой из них попал
каждый вызов. Используйте при отладке красного теста, когда непонятно, почему спай вернул значение
по умолчанию.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';
import { explainSpy } from 'vitest-auto-spy/diagnostics';

const users = createSpyFromClass(UserApi);
users.load.calledWith(1).resolveWith('ada');

await users.load(2);

console.log(explainSpy(users, 'load'));
```

```text
[vitest-auto-spy] explainSpy

load — 1 call, 1 configured, none matched
  configured:
    #1 calledWith(1)
  calls:
    #1 load(2) -> no configured arguments matched; the default value was used
```

## На какой вопрос он отвечает {#the-question-it-answers}

`mustBeCalledWith` (это `calledWith`, который бросает ошибку на любых других аргументах) печатает
ожидаемые и настоящие аргументы, но только для вызова, который упал.
Когда тест красный по другой причине, хочется знать: на какую из моих настроек `calledWith` попал
этот вызов и какая не сработала ни разу? Без хелпера приходится листать к настройке и сравнивать
списки аргументов глазами.

`explainSpy` читает настройки спая `calledWith` / `mustBeCalledWith` и нумерует их. Потом
сопоставляет с ними каждый записанный вызов и говорит, на какую настройку он попал — или что не попал
ни на одну и получил значение по умолчанию.

## Как читать отчёт {#reading-the-report}

- **Заголовок**, `load — 3 calls, 2 configured`, описывает один метод одной строкой. Два состояния
  выделены отдельно: `nothing configured` (каждый вызов получил значение по умолчанию) и
  `none matched` (вызовы были, но ни один не попал в настройку).
- **`configured:`** перечисляет все настройки так, как вы их написали: `#2 calledWith(Any<String>)`.
  У `calledWith` и `mustBeCalledWith` общая нумерация.
- **`calls:`** перечисляет все вызовы по порядку, с настройкой, на которую каждый попал. Когда ничего
  не настроено, сопоставление не печатается: на каждой строке оно было бы одинаковым.

Отчёт полнее, от `explainSpy(users)` без имени метода:

```text
[vitest-auto-spy] explainSpy

load — 3 calls, 2 configured
  configured:
    #1 calledWith(1)
    #2 calledWith(Any<String>)
  calls:
    #1 load(1) -> matched #1
    #2 load(2) -> no configured arguments matched; the default value was used
    #3 load('ada') -> matched #2

save — 1 call, nothing configured
  calls:
    #1 save('ada')

remove — never called, 1 configured
  configured:
    #1 mustBeCalledWith(9)
```

## Что он принимает {#what-it-accepts}

```ts
explainSpy(spy); // все члены объекта, на которых стоят спаи
explainSpy(spy, 'load'); // только этот член
explainSpy(spy.load); // спай одного метода; в отчёте — имя спая
```

| Аргумент | Тип                                                                       | Смысл                              |
| -------- | ------------------------------------------------------------------------- | ---------------------------------- |
| `spy`    | объект со спаями (из `createSpyFromClass` и т. п.) или спай одного метода | Что объяснить                      |
| `member` | `string` (необязательно)                                                  | Только этот член объекта со спаями |

- Работают спаи из `createSpyFromClass`, `createAutoMock`, `createFunctionSpy` и `mockDeep`. Вложенный
  объект `mockDeep` можно передать как `explainSpy(api.repo, 'find')` или `explainSpy(api.repo.find)`.
- Спай на геттер или сеттер показывается как `get name` / `set name`. Если назвать его
  (`explainSpy(users, 'name')`), геттер не вызывается и лишний вызов не записывается.
- Метод, который тест ни разу не вызвал и не настроил, не показывается: он сообщил бы только, что
  сообщать нечего.

## Он никогда не бросает {#it-never-throws}

`explainSpy` вызывают из теста, который уже падает, поэтому сам он ошибок не бросает. Обычный
`vi.fn()` или любое значение, которое не является спаем этой библиотеки, описывается в тексте отчёта:

```text
[vitest-auto-spy] explainSpy

nothing to explain: this value is a plain runner mock (vi.fn()) and holds no spy created by
vitest-auto-spy. `adoptMock(mock)` gives it the library's helpers.
```

`null` и `undefined` (например, `let`, которому не присвоил значение ни один `beforeEach`) описываются
так же.

**Частая ошибка:** проверять текст отчёта в тесте. Он нужен, чтобы его напечатать; формулировки могут
улучшаться между релизами.
