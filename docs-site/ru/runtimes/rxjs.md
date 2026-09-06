---
title: RxJS
description: Подключаемый слой observable — nextWith, nextWithValues, nextWithPerCall, returnSubject, как ведут себя задержки и почему ни одна декларация не называет rxjs.
---

# RxJS

Слежение за observable живёт за подпутём `vitest-auto-spy/rxjs`, чтобы `rxjs` не попадал в рантайм-бандл
проектов, которые им не пользуются. Импортируйте его **один раз** (например, в настройке тестов), чтобы
включить observable-хелперы:

```ts
import 'vitest-auto-spy/rxjs';
```

Одну и ту же управляющую поверхность получают и подменённые **методы**, возвращающие `Observable`, и
подменённые **свойства** типа `Observable`:

```ts
myService.getProducts$.nextWith([{ name: 'Product 1' }]); // выдать значение, поток остаётся открытым
myService.getProducts$.nextOneTimeWith([{ name: 'X' }]); // выдать одно значение и завершить
myService.getProducts$.throwWith('FAKE ERROR'); // уронить поток ошибкой
myService.getProducts$.complete(); // завершить поток

// выдать точную последовательность — значения, ошибки, завершение, необязательные задержки
myService.getProducts$.nextWithValues([{ value: [{ name: 'Product 1' }] }, { errorValue: 'FAKE ERROR' }, { complete: true }]);

// свежий поток на каждый вызов
myService.getProducts$.nextWithPerCall([{ value: ['a'] }, { value: ['b'] }]);

// забрать нижележащий Subject для полного ручного управления
const subject = myService.getProducts$.returnSubject();
```

Использование observable-спая без импорта `vitest-auto-spy/rxjs` бросает внятную подсказку с требованием
добавить импорт. С **4.0.0** то же верно и для _типов_: ни одна декларация ядра не называет ни одного типа
rxjs, поэтому проект без rxjs его никогда не загружает — см.
[rxjs в типах](#rxjs-in-the-types) ниже.

## rxjs в типах {#rxjs-in-the-types}

До 4.0.0 инвариант этой страницы — «rxjs живёт за `/rxjs`» — держался в рантайме и нарушался на уровне
типов. `dist/types-*.d.ts` открывался строкой `import { Observable, Subject } from 'rxjs'`, а это не
чинится через `import type`: TypeScript резолвит импорт только типов ровно так же, как импорт значений.
Замерено на опубликованном пакете, на потребителе, который использует из библиотеки один
`createSpyFromClass`:

|                                                            |                     3.18 |     4.0 |
| ---------------------------------------------------------- | -----------------------: | ------: |
| файлов в программе TypeScript у потребителя                |                      303 | **114** |
| из них файлов `.d.ts` от rxjs                              |                      189 |   **0** |
| `TS2307` при `skipLibCheck: false` и без установленного rxjs | да, в `types-*.d.ts:1`  |    нет  |

Первый столбец оплачивал каждый потребитель на React, Vue, Svelte и Node. Теперь `scripts/check-dist.mjs`
роняет сборку, если rxjs снова назван в любой декларации, кроме `dist/rxjs.d.ts` и
`dist/observer-spy.d.ts`.

### Чем это заменили {#what-replaced-it}

**Определение стало структурным.** Метод или свойство считается observable, если у его типа есть и
`subscribe`, и `forEach(next)`, возвращающий промис, — а это верно для `Observable` из rxjs, для любого
`Subject` и для `EventEmitter` из Angular, и неверно для `Promise`, массивов, `Signal` и
`OutputEmitterRef` из Angular. Тип элемента снимается именно с `forEach`, а не с `subscribe`, и это
сделано намеренно: при выводе TypeScript берёт **последнюю** сигнатуру перегруженного метода, а последняя
перегрузка `subscribe` в rxjs 7 — устаревшая позиционная, через которую `T` выводится как `unknown`.

Теперь совпадает одна вещь, которая раньше не совпадала: `Observable` из **второй копии rxjs** в дереве.
`Subject` номинален (у него есть приватное поле), поэтому дублированный rxjs раньше проваливался в ветку
обычного спая, и ничто не объясняло, куда делся `nextWith`.

**`returnSubject()` следует за вашим импортом.** Он типизирован как `SubjectOf<T>`, который резолвится в
родной `Subject<T>` из rxjs, как только `vitest-auto-spy/rxjs` попадает в вашу программу TypeScript, и в
структурный `SubjectLike<T>` — всё, ради чего хелпер используется, — когда не попадает. Все четыре типа
экспортируются из ядра, так что спека может назвать любой из них:

```ts
interface ObservableLike<T> {
  subscribe(...args: never[]): { unsubscribe(): void };
  forEach(next: (value: T) => void, ...rest: never[]): Promise<void>;
}

interface SubjectLike<T> extends ObservableLike<T> {
  next(value: T): void;
  error(err: unknown): void;
  complete(): void;
  unsubscribe(): void;
  asObservable(): ObservableLike<T>;
  readonly closed: boolean;
}

// шов: здесь пустой, заполняется из `vitest-auto-spy/rxjs`
interface AutoSpyRxjsTypes<T> {}

type SubjectOf<T> = AutoSpyRxjsTypes<T> extends { subject: infer S } ? S : SubjectLike<T>;
```

`AutoSpyRxjsTypes<T>` — обычный расширяемый интерфейс, поэтому проект со своей реализацией `Subject`
может направить `SubjectOf` на неё:

```ts
declare module 'vitest-auto-spy' {
  interface AutoSpyRxjsTypes<T> {
    subject: MyOwnSubject<T>;
  }
}
```

Тот единственный импорт, из-за которого хелперы *существуют*, — тот же самый, что даёт им типы
rxjs, так что разъехаться эти две вещи не могут.

```ts
import 'vitest-auto-spy/rxjs';
import type { Subject } from 'rxjs';

const subject: Subject<Product[]> = myService.getProducts$.returnSubject(); // ✔ компилируется
```

Подвох, о котором стоит знать: тип следует за **импортом**, а не за установленным пакетом. Если
единственный `import 'vitest-auto-spy/rxjs'` лежит в setup-файле вне того `tsconfig`, которым проверяются
ваши спеки, вы получите обратно `SubjectLike<T>`, и аннотация вроде приведённой выше перестанет
компилироваться. Перенесите импорт туда, где его видит компилятор, — в то же место, где он обязан быть,
чтобы хелперы зарегистрировались в рантайме.

## Подлежащий subject и как долго он живёт {#the-backing-subject-and-how-long-it-lives}

Каждый observable-хелпер пишет в один `ReplaySubject(1)` на подменённый член. Его буфер — это
**конфигурация**, ровно в том же смысле, что и цепочка `calledWith`, и до 3.5.0 он переживал заполнивший
его тест. Из этого выросли два молчаливых отказа.

```ts
// тест 1
service.createSeamlessTransition.nextWith(uri); // положено в буфер

// тест 2 — этот тест как раз про путь с ошибкой
service.createSeamlessTransition.throwWith(error); // подписчик получает СНАЧАЛА `uri`, потом ошибку
```

Тестируемый код выполнял **успешную** ветку на данных предыдущего теста, а ветка, ради которой тест и
писался, приходила на одну эмиссию позже — и ничто в падении на это не указывало. Второй отказ ещё тише:
`error()` и `complete()` закрывают Subject навсегда, поэтому каждый последующий `nextWith` на этом спае
писал в мёртвый subject и не выдавал ничего.

Оба случая исправлены: `resetAutoSpy(spy)` выбрасывает subject, а завершённый заменяется при следующей
настройке. Отсюда следуют две вещи, о которых стоит знать.

**`vi.clearAllMocks()` и `clearMocks: true` до него по-прежнему не дотягиваются.** Это не упущение — это
та же граница, что не даёт им сбросить цепочку `calledWith`: состояние живёт в замыканиях этой
библиотеки, а не на объекте мока раннера. Когда спай переживает тест, сбрасывайте его сами:

```ts
beforeEach(() => {
  resetAutoSpy(service); // TestBed собирается в beforeAll, поэтому спай общий
});
```

**Внутри одного теста ничего не изменилось.** `nextWith(a)`, за которым идёт `throwWith(e)`, по-прежнему
означает «выдай a, потом упади»: оба вызова — части одной истории, и новую начинает только сброс или
терминальный вызов. `nextWithValues([{ errorValue: e }])` остаётся способом собрать поток, который падает
при подписке независимо от того, что было до него.

## Отдельный конструктор observable {#standalone-observable-builder}

```ts
import { createObservableWithValues } from 'vitest-auto-spy/rxjs';

const fake$ = createObservableWithValues([{ value: 1 }, { value: 2 }, { complete: true }]);

// или заодно получить subject
const { values$, subject } = createObservableWithValues([{ value: 1 }], { returnSubject: true });
```

`ValueConfig` (для `nextWithValues`): `{ value, delay? }` | `{ errorValue, delay? }` | `{ complete?, delay? }`.

`ValueConfigPerCall` (для `nextWithPerCall`) — это `{ value, delay?, doNotComplete? }`.

## Как читать последовательность как marble-диаграмму {#reading-a-sequence-as-a-marble}

`nextWithValues` выдаёт свои записи по порядку, поэтому список конфигураций один в один ложится на
marble-диаграмму — расстояние между кадрами задаёт только `delay`.

```ts
myService.getProducts$.nextWithValues([{ value: 'a' }, { value: 'b' }, { complete: true }]);
// (ab|)   — оба значения синхронно, затем завершение
```

```ts
myService.getProducts$.nextWithValues([{ value: 'a' }, { value: 'b', delay: 20 }, { complete: true, delay: 10 }]);
// a 20ms b 10ms |
```

```ts
myService.getProducts$.nextWithValues([{ value: 'a' }, { errorValue: 'boom', delay: 20 }]);
// a 20ms #
```

Запись `{ complete: false }` ничего не выдаёт и не останавливает поток — это форма «оставить открытым».
Всё, что идёт после первого `{ complete: true }`, отбрасывается.

## Тайминги {#timing}

- **`delay` — в миллисекундах**, применяется через родные `delay()` (значения, завершение) и `timer()`
  (ошибки) из RxJS. Это реальное время, а не виртуальный планировщик.
- **Без задержки эмиссия синхронна.** `nextWith` кладёт значение в `ReplaySubject` немедленно, поэтому
  уже отработавший подписчик видит его в том же тике.
- **Подлежащий subject — это `ReplaySubject`**, поэтому подписчик, пришедший _после_ эмиссии, всё равно
  её получит. Именно это заставляет `spy.thing$.nextWith(v)` работать независимо от того, подписался
  тестируемый код раньше или нет.
- **Под фейковыми таймерами** записи с задержкой требуют прокрутить часы.
  [`advanceTimers(ms)`](/ru/utilities/fake-timers) прокручивает **и** дочищает микрозадачи, которые
  ставит эмиссия, — голый `vi.advanceTimersByTime()` оставляет продолжение `await` висеть, и проверка
  тогда читает состояние, каким оно было до завершения колбэка.

```ts
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

setupFakeTimers();

myService.getProducts$.nextWithValues([{ value: 'a', delay: 100 }]);

const seen: string[] = [];
myService.getProducts$.subscribe((value) => seen.push(value));

await advanceTimers(100);

expect(seen).toEqual(['a']);
```

## Проверять вместо того, чтобы подписываться {#asserting-instead-of-subscribing}

Для проверяющей стороны потока — «оно что-то выдаёт», «оно выдаёт вот эти три», «оно молчит» — берите
[проверки для observable](/ru/core/observable-assertions). Они работают по утиной типизации, поэтому
годятся для любого подписываемого объекта и не тянут за собой rxjs:

```ts
import { expectEmission, expectNoEmission } from 'vitest-auto-spy';

const emitted = expectEmission(myService.getProducts$);

myService.getProducts$.nextWith(['x']);

expect(await emitted).toEqual(['x']);
```

## `subscribeSpyTo` — для набора, пришедшего с observer-spy {#subscribespyto-for-a-suite-arriving-with-observer-spy}

`@hirez_io/observer-spy` стоит рядом с `jasmine-auto-spies` почти в каждом наборе, где есть второй, — тот
же автор, и по загрузкам он больше, — а последний раз публиковался в 2022 году. Эта точка входа
поставляет его поверхность, чтобы переезжающий набор запускался до того, как его проверки потоков будут
переписаны:

```ts
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';

const spy = subscribeSpyTo(service.load());

expect(spy.getValues()).toEqual(['a', 'b']);
expect(spy.receivedComplete()).toBe(true);
```

**Это мост, а пункт назначения — проверки, описанные выше.** `subscribeSpyTo` — синхронный осмотр:
подписаться, дать чему-то произойти, потом прочитать спай. Его способ ломаться — молчание: поток, который
ничего не выдал, даёт `getValues() === []`, спека что-то про это проверяет, и тест проходит, ничего не
увидев. `expectEmission` делает саму проверку ожиданием, поэтому молчание превращается в таймаут,
называющий поток.

Четыре вещи ведут себя здесь лучше, чем в оригинале, и переехавшая спека заметит последнюю:
`getValues()` возвращает копию, а не собственный живой массив спая, и типизирован как `T[]`, а не
`any[]`; `getFirstValue()` и `getValueAt(i)` бросают исключение, вместо того чтобы отвечать `undefined`
из сигнатуры, обещавшей `T`; а неожиданная ошибка бросается тем читателем значения, который её запросил,
и несёт исходную в `cause`, а не перебрасывается из наблюдателя. Последнее — не вкусовщина: перебрасывание
в оригинале перестало работать, когда rxjs 7 начал прогонять всё брошенное из колбэка наблюдателя через
`reportUnhandledError`, который сообщает об ошибке асинхронно, так что до строки с подпиской она не
доходит. Передавайте `{ expectErrors: true }` (или вызывайте `.expectErrors()`), когда ошибка и есть
смысл теста, и читайте `getError()`.

`SubscriberSpy` — disposable, поэтому подписку можно ограничить её блоком, а не глобальным `afterEach`:

```ts
using spy = subscribeSpyTo(service.load());
```

Аналога `fakeTime()` здесь нет — он построен на виртуальном времени `TestScheduler` из rxjs и на
протоколе колбэка `done`. Используйте [фейковые таймеры](/ru/utilities/fake-timers) или напрямую
`TestScheduler`.
