---
title: explainSpy
description: Печатает, что дубль настроен отвечать, рядом с тем, о чём его на самом деле спросили — ещё до того, как что-то упало. Живёт на входе `/diagnostics`.
---

# explainSpy

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

`mustBeCalledWith` и так печатает ожидаемое рядом с фактическим — но только на том вызове, который
ломается. У автора спеки, пока тест красный по какой-то _другой_ причине, вопрос иной: в какой из
моих конфигов попал этот вызов и какой не сработал ни разу. До сих пор ответить на него можно было
единственным способом — отмотать к настройке и глазами сверить списки аргументов.

`explainSpy` собирает ответ за вас. Он читает конфиги `calledWith` / `mustBeCalledWith` дубля,
нумерует их, сопоставляет с ними каждый записанный вызов и говорит, в какой конфиг вызов попал —
или что не попал ни в один и было взято значение по умолчанию.

## Как читать отчёт {#reading-the-report}

- **Заголовок** — `load — 3 calls, 2 configured` — это всё состояние одного члена в одной строке.
  Два состояния вынесены отдельно, потому что именно в них читатель оказывается чаще всего, а голый
  список отвечает на них плохо: `nothing configured` (каждый вызов вернул значение по умолчанию) и
  `none matched` (N вызовов, и ни один не дошёл до конфига).
- **`configured:`** перечисляет каждый зарегистрированный список аргументов тем самым вызовом
  цепочки, который его зарегистрировал, так что `#2 calledWith(Any<String>)` — это ровно та строка,
  которую вы написали. Обе цепочки делят одну нумерацию, поэтому вызов называет одно число, какая бы
  цепочка ему ни ответила.
- **`calls:`** перечисляет каждый записанный вызов по порядку, вместе с конфигом, в который он попал.
  Когда не настроено ничего, вердикт опускается — он говорил бы одно и то же в каждой строке.

Отчёт побогаче — от `explainSpy(users)`, без имени метода:

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
explainSpy(spy); // каждый заспаенный член, который отдаёт дубль
explainSpy(spy, 'load'); // только этот член
explainSpy(spy.load); // одиночный функциональный спай, имя берётся из мока
```

- Дубли `createSpyFromClass`, `createAutoMock`, `createFunctionSpy` и `mockDeep` понимаются все;
  до потомка `mockDeep` можно добраться либо как `explainSpy(api.repo, 'find')`, либо как
  `explainSpy(api.repo.find)`.
- Спай на аксессор показывается как `get name` / `set name` и читается из мешка `accessorSpies`
  дубля — обращение по имени (`explainSpy(users, 'name')`) никогда не дёргает живой аксессор,
  который записал бы вызов просто за то, что на него посмотрели.
- Ленивый метод, которого никто не трогал, в отчёт не попадает, а не материализуется: его создали бы
  ровно ради сообщения, что сообщать нечего.

## Он никогда не бросает {#it-never-throws}

`explainSpy` зовут из спеки, которая и так уже падает, поэтому диагностика, падающая по дороге, хуже,
чем никакой диагностики. Обычный `vi.fn()` — как и любое значение, которое не является дублем этой
библиотеки — описывается текстом, а не выбрасывается ошибкой:

```text
[vitest-auto-spy] explainSpy

nothing to explain: this value holds no spy created by vitest-auto-spy. Pass a double built by
createSpyFromClass, createAutoMock, createFunctionSpy or mockDeep.
```

Результат — отчёт, чтобы напечатать, а не то, на чём стоит писать ассерты: формулировки здесь
диагностические и вольны улучшаться от релиза к релизу.
