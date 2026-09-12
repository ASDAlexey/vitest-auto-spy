---
title: Паттерны спек
description: Формы, к которым в итоге пришла большая ангуляровская сюита — настройка provideAutoSpy, моки сигналов, observable-свойства и ловушки, которые вылезают только на масштабе.
---

# Паттерны спек

Справочник по API рассказывает, что делает каждый хелпер. Эта страница — про то, к каким из них вы
реально будете тянуться, в каком порядке и что ломается на масштабе; замерено на приватной zoneless
сюите Angular 22 примерно из 370 файлов спек, живущей на этой библиотеке с ранних версий.

Распределение перекошенное, и знать об этом полезно до того, как учить всю поверхность API:

| Хелпер                                                                      | Файлов спек, где он используется |
| --------------------------------------------------------------------------- | -------------------------------: |
| [`provideAutoSpy`](/ru/adapters/angular)                                    |                              371 |
| [`injectSpy`](/ru/adapters/angular)                                         |                              308 |
| [`mockReadonlyProp`](/ru/adapters/angular#signal-readonly-property-mocking) |                              127 |
| [`mockValueProp`](/ru/adapters/angular#signal-readonly-property-mocking)    |                              104 |
| `instanceMethodsToSpyOn`                                                    |                              103 |
| `observablePropsToSpyOn`                                                    |                               79 |
| [спаи консоли](/ru/utilities/console)                                     |                               68 |
| [`createSpyFromClass`](/ru/core/create-spy-from-class)                      |                               41 |

Отсюда следует две вещи. **`createSpyFromClass` — исключение, а не правило**: в ангуляровском
приложении спай почти всегда приезжает через DI. И **`instanceMethodsToSpyOn` — не редкий случай**:
в кодовой базе на сигналах он встречается более чем в четверти всех файлов спек, потому что поля
`signal()` и `computed()` — это ровно те callable-члены, которых обход прототипа не видит.

## Канонная спека сервиса {#the-canonical-service-spec}

```ts
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { type Spy, injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

describe('TaskService', () => {
  let projects: Spy<ProjectStore>;
  let feed: Spy<NewsFeedService>;
  let service: TaskService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // обычный сервис — подменяется спаем каждый метод прототипа, настраивать нечего
        provideAutoSpy(NotificationService),
        // сигналы и computed живут на ЭКЗЕМПЛЯРЕ, поэтому их называют явно
        provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current', 'isEmpty'] }),
        // Observable-*свойства* тоже называют явно — а методы, возвращающие Observable, нет
        provideAutoSpy(NewsFeedService, { observablePropsToSpyOn: ['connected$'] }),
      ],
    });

    projects = injectSpy(ProjectStore);
    feed = injectSpy(NewsFeedService);

    // один раз задаём умолчания, которые нужны каждому тесту
    feed.connected$.nextWith(true);
    projects.save.mockReturnValue(of(true));

    service = TestBed.inject(TaskService);
  });

  it('saves through the store', () => {
    service.save(task);

    expect(projects.save).toHaveBeenCalledWith(task);
  });
});
```

Основную пользу дают четыре договорённости:

1. **Один `configureTestingModule` на `describe`.** Перенастройка на каждый `it()` оплачивает
   компиляцию модуля в каждом тесте; это самая большая устранимая трата в ангуляровской сюите.
2. **Объявляйте каждый спай как `Spy<T>` и получайте его через `injectSpy`.** Никогда как `T` —
   `Spy<T>` это mapped type, и приватные члены он отбрасывает ([почему](/ru/core/spy-typing)).
3. **Умолчания задавайте в `beforeEach`, а переопределяйте в тесте.** Метод, который возвращает
   `Observable` и остался ненастроенным, вернёт `undefined`, а падение вылезет далеко от причины.
4. **`provideAutoSpy` ленив по умолчанию**, так что перечислять широкий сервис ничего не стоит — за
   методы, которые тест не трогает, вы не платите.

## Сигналы {#signals}

Сигнал — это callable-поле на экземпляре, что помещает его сразу в два места. Какой хелпер нужен,
зависит от того, мокаете ли вы **зависимость** или **класс под тестом**.

```ts
// сигнал ЗАВИСИМОСТИ — назовите его, и спай будет обычным моком, который вы настраиваете как любой другой
provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current', 'isEmpty'] });
injectSpy(ProjectStore).current.mockReturnValue({ id: 1 });

// собственный сигнал / computed / input КЛАССА ПОД ТЕСТОМ — подменяем поле настоящим сигналом
mockReadonlyProp(component, 'selected', signal(true));
mockReadonlyProp(component, 'items', signal([]));
mockReadonlyProp(component, 'host', signal({ nativeElement: element }));
```

`mockReadonlyProp(target, key, signal(value))` — главная рабочая лошадка: это настоящий сигнал, так
что любой `computed()` ниже по течению пересчитается правильно, чего `vi.fn()`, возвращающий
значение, не даст. Если значение должно меняться по ходу теста, `mockSignalProp` собирает эту пару
одним вызовом и отдаёт записываемую половину:

```ts
const selected = mockSignalProp(component, 'selected', false);

selected.set(true); // каждый читающий его computed обновится
```

Заодно это снимает соблазн дотянуться до `component.selected` и позвать у него `.set` — у `Signal<T>`
нет `set`, так что такое проходит проверку типов только за приведением.

Член, который и так `signal()`, `model()` или `linkedSignal()`, не подменяется, а пишется напрямую —
поэтому неважно, отрисовался компонент или ещё нет. `computed()` подменяется, и сделать это надо до
первого рендера: `mockSignalProp` скажет об этом, а не оставит старое значение молча стоять. От
`input()` он отказывается сразу — таким управляют через
`fixture.componentRef.setInput(name, value)`.

`mockReadonlyPropGetter` — когда значение должно пересчитываться на каждом чтении, а не подменяться
один раз, а `mockValueProp` — для обычного записываемого поля.

::: warning `vi.restoreAllMocks()` этого не откатывает
Они переопределяют дескрипторы свойств, о которых реестр спаев раннера ничего не знает. Подключите
[`setupAutoSpy()`](/ru/utilities/setup) — он регистрирует `restoreMockedProps()` в глобальном
`afterEach`. Без него патч глобала, прототипа или синглтона утечёт в следующий файл при
`isolate: false`.
:::

## Observable-свойства против observable-методов {#observable-properties-vs-observable-methods}

На этом различии спотыкаются, потому что имена выглядят одинаково:

```ts
class NewsFeedService {
  readonly connected$ = new BehaviorSubject(false); // СВОЙСТВО → observablePropsToSpyOn
  watch(id: number): Observable<Item> {} // МЕТОД     → настраивать нечего
}

provideAutoSpy(NewsFeedService, { observablePropsToSpyOn: ['connected$'] });

feed.connected$.nextWith(true); // свойство, которым управляют хелперы
feed.watch.nextWith(item); // метод, на который спай поставлен автоматически
```

Метод, возвращающий `Observable`, находится на прототипе как любой другой, а observable-хелперы
получает из своего **типа возвращаемого значения**. Называть явно нужно только свойства — на них с
прототипа ничто не указывает.

И тем и другим нужен загруженный один раз слой rxjs, в вашем setup-файле:

```ts
import 'vitest-auto-spy/rxjs';
```

Без него `nextWith` бросит ошибку, где ровно это и написано.

## Как достать спая, до которого `injectSpy` не дотянется {#reaching-a-spy-that-injectspy-cannot}

`injectSpy(X)` читает **глобальный** инжектор `TestBed`. Провайдер, объявленный на самом компоненте
(`@Component({ providers: [...] })`), живёт в element injector, которого `TestBed.inject` не видит.
Идите через фикстуру и перетипизируйте результат:

```ts
import { asSpy } from 'vitest-auto-spy';

const player = asSpy(fixture.debugElement.injector.get(PlayerService));

player.play.mockReturnValue(true);
```

Обратное направление — отдать спая обычной функции, типизированной настоящим классом, — это
[`asInstance`](/ru/core/spy-typing):

```ts
expect(isEnabled(asInstance(featureFlags))).toBe(true);
```

В рантайме это один и тот же объект. Тянитесь к ним только на этих границах; сюита, которой такое
нужно в каждом файле, объявила свои переменные как `T` вместо `Spy<T>`.

## ngrx signals {#ngrx-signals}

`signalStore()` кладёт всё на **экземпляр**, так что обход прототипа не находит вообще ничего:

```ts
// либо перечислить каждый член, который вы трогаете…
provideAutoSpy(TaskStore, { instanceMethodsToSpyOn: ['entities', 'isLoading', 'load'] });

// …либо не трогать класс и замокать от типа — прототип для этого не нужен
const store = createAutoMock<TaskStore>();
```

Для стора `createAutoMock<T>()` обычно выгоднее: каждый затронутый член становится спаем лениво,
так что перечислять ничего не надо и список не может отстать от стора.

`rxMethod` — это функция со свойством `destroy`, которого у голого мока нет; соберите его явно, иначе
очистка компонента упадёт:

```ts
const load = Object.assign(vi.fn(), { destroy: vi.fn() });
```

## Эффекты {#effects}

Лучше не подменять `effect()` моком на `@angular/core`. Под ангуляровским unit-test builder это
возможно — падает тот мок, чья фабрика использует спред объекта, и в сообщении о падении
(`Cannot access '__vi_import_N__' before initialization`) не упоминаются ни спред, ни фабрика; см.
[моки модулей под unit-test builder](/ru/adapters/angular#module-mocks-under-the-unit-test-builder).
И всё равно это более хрупкая половина размена.

Проверяйте вместо этого **результат** эффекта: выставьте сигналы, которые он читает, дайте ему
отработать и посмотрите, что получилось.

```ts
mockReadonlyProp(component, 'state', signal(State.Selected));

await stable(fixture); // прогоняем эффекты, затем ждём фикстуру

expect(component.icon()).toBe('favouritesFilled');
```

Тянуться стоит именно к [`stable(fixture)`](/ru/adapters/angular#zoneless-waiting):
`fixture.detectChanges()` делает один проход change detection и **не** прогоняет отложенные эффекты,
поэтому проверка сразу после него читает состояние, которое ещё не досчиталось. `flushEffects()` —
половина без фикстуры, для сервисов и сторов. Ожидание ограничено — 2000 мс по умолчанию, после чего
бросается исходная причина, а не остаётся ждать, пока раннер отрапортует таймаут на весь файл.

### Компонент, который грузится через `httpResource()` {#a-component-that-loads-through-httpresource}

```ts
const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));

flushEffects(); // запрос уходит здесь — а не в момент создания ресурса
TestBed.inject(HttpTestingController).expectOne('/api/products').flush([product]);
await settleResource(products, { label: 'the product resource' });

expect(products.value()).toEqual([product]);
```

[`settleResource`](/ru/adapters/angular#resources-httpresource-and-resource) — одно ожидание сразу
для `httpResource()`, `resource()` и `rxResource()`, которым нужно разное число тактов. Проверка до
него читает _дефолтное_ значение ресурса и проходит, и вот этот режим отказа стоит знать: зелёный
тест, который ничего не доказывает, — до того дня, когда дефолт поменяется.

Когда эффект сам по себе никогда не станет грязным — потому что его триггер теперь статический
сигнал, — `runEffect` выполняет именно это тело напрямую:

```ts
runEffect(component.highlightEffect); // текущие значения сигналов, никакого планировщика
```

## Наблюдатели, которые компонент создаёт сам {#observers-the-component-constructs-itself}

`IntersectionObserver`, `ResizeObserver` и `MutationObserver` создаются внутри кода под тестом и
хранятся приватно, так что единственная ручка у спеки — глобальный конструктор. Подменять его руками
плохо дважды: заглушку потом никто не снимает (и следующий файл наследует её при `isolate: false`), а
до экземпляра добираются через `static last`, который переживает спеку ровно так же скверно.

```ts
import { intersectionEntry, stubIntersectionObserver } from 'vitest-auto-spy/dom-stubs';

const observers = stubIntersectionObserver();

fixture.detectChanges(); // директива создаёт свой observer

observers.last.emit([intersectionEntry(fixture.nativeElement, true)]);
await fixture.whenStable();
```

Заглушка ставится через `mockValueProp`, поэтому `restoreMockedProps()` — который `setupAutoSpy()`
и так вызывает — возвращает настоящий конструктор на место. `emit()` принимает **пачку**, потому что
при быстром скролле за один вызов приезжает несколько записей, и код, рассчитывающий на одну запись
на вызов, — настоящий баг, до которого стоит дотянуться.

## Таймеры, переживающие свой файл {#timers-that-outlive-their-file}

Это вылезает только на масштабе, и вылезает как падение в **невиновном** файле.

При `isolate: false` все файлы спек внутри воркера делят одно окружение. `setTimeout`, который
компонент завёл и не отменил, продолжает тикать после того, как его файл закончился; колбэк потом
срабатывает посреди теста уже в следующем файле, против моков и DOM, которые больше не совпадают.
`requestAnimationFrame` в zoneless-приложении важен ровно так же: планировщик change detection в
Angular гоняет `setTimeout` наперегонки с колбэком кадра, так что у уничтоженного компонента вполне
может остаться что-то в очереди.

Симптомы — все рапортуются не на том файле:

- `Schedulers cannot synchronously execute watches while scheduling`
- `signal read during notification phase`
- необработанное отклонение промиса, называющее компонент, который падающий файл никогда не импортировал

Всё это закрывается одной опцией — она один раз оборачивает планировщики, записывает каждый хендл и
отменяет выживших в `afterAll`:

```ts
// vitest.setup.ts
setupAutoSpy({ strayTimers: true });
```

Части экспортируются и по отдельности — для сюиты, которая хочет делать зачистку в другом месте или
хочет, чтобы утечка **роняла** тест, а не тихо прибиралась:

```ts
import { cancelStrayTimers, countStrayTimers, trackStrayTimers } from 'vitest-auto-spy/setup';

trackStrayTimers(); // один раз, как можно раньше в setup-файле — идемпотентно
afterEach(() => expect(countStrayTimers()).toBe(0)); // считать утечку падением
afterAll(() => cancelStrayTimers()); // …или просто подмести и залогировать возвращённое число
```

Если вы на `isolate: false` — считайте, что это вам нужно ещё до того, как понадобится.

## Зелёный прогон, который всё равно выходит с кодом 1 {#a-green-run-that-still-exits-1}

happy-dom реализует `fetch`, jsdom — нет. Переведите сюиту с одного на другой, и компонент,
подтягивающий удалённый ресурс, начнёт слать настоящие запросы. Никто на них ничего не проверяет,
поэтому все тесты по-прежнему проходят — а потом раннер сносит окружение, запросы в полёте
обрываются, и обрывы прилетают необработанными отклонениями _после_ итогов:

```text
 Test Files  260 passed (260)
      Tests  2257 passed (2257)

Vitest caught 8 unhandled errors during the test run.
DOMException [AbortError]: The operation was aborted.
```

Код выхода 1, и ни одного названного теста — потому что ни один тест не упал.

```ts
setupAutoSpy({ blockNetwork: true });
```

После этого `fetch` сразу отклоняется, называя запрошенный URL, а код под тестом идёт ровно по той
ветке, по которой пошёл бы при неудачном запросе. `XMLHttpRequest` и `navigator.sendBeacon`
обрабатываются так же: jsdom реализует XHR целиком, и библиотека, которая с него так и не ушла
(скажем, рекламный плеер, пингующий VAST-трекеры), выходит в интернет из сюиты, которая считала себя
изолированной. Если исходящие запросы вашей сюиты — это пинги, ответ на которые никто не читает, на
них лучше отвечать, а не ронять их:

```ts
setupAutoSpy({ blockNetwork: { xhr: 'empty' } });
```

## Фейковые таймеры {#fake-timers}

```ts
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

setupFakeTimers(); // один раз на describe — ставит и снимает в паре

it('debounces', async () => {
  component.search('query');

  await advanceTimers(300); // прокрутить время И разобрать микрозадачи, которые прокрутка поставила в очередь
  await stable(fixture);

  expect(api.search).toHaveBeenCalledWith('query');
});
```

Один `vi.advanceTimersByTime()` оставляет цепочку промисов, которую разрешил таймер, всё ещё
висящей, — из-за этого проверка таймера и читается как гонка. `advanceTimers()` эту щель закрывает.

## Консоль {#console}

Импортируйте точку входа один раз и проверяйте экспортированные спаи; вывод при этом глушится, а не
печатается.

```ts
import { consoleErrorSpy } from 'vitest-auto-spy/console';

service.handle(brokenPayload);

expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('parse'));
```

Никогда не навешивайте сверху второй `vi.spyOn(console, 'error')`: какой из патчей победит, зависит
от порядка импортов, и проверка тогда идёт против спая, который вызов не перехватывал.

## Проверка массива, которая ничего не говорит {#an-array-assertion-that-says-nothing}

```ts
import { diffByField } from 'vitest-auto-spy/diagnostics';

const sent = analytics.send.mock.calls.map(([event]) => event);

expect(diffByField(sent, expectedEvents)).toBeUndefined();
```

Сравнение собранных записей с ожидаемым списком — обычная форма теста для всего, что накапливает:
очередь аналитики, аудит-лог, история команд. И обычная причина расхождения — не «не тот элемент», а
«во всех съехало одно поле»: таймстемп, идентификатор, счётчик.

Именно это падение репортер отрисовывает хуже всего. Он схлопывает объекты, так что на выходе
получается `expected [ { event_timestamp: 1, …(5) }, …(8) ] to deeply equal [ { …(6) }, … ]` — девять
элементов, одно изменившееся поле, и на экране ничего о том, какое именно, плюс
`console.dir(…, { depth: null })` и ещё два прогона, чтобы это выяснить. `diffByField` отвечает
прямо:

```text
9 of 9 elements differ.
  `event_timestamp` differs in all 9: actual 1 everywhere, expected 2, 3, 4, 5, 6, 7, …
```

«Везде одно и то же» против ряда ожидаемых значений — характерная примета: под фейковыми таймерами
каждый `Date.now()` внутри одного теста отвечает одинаково, поэтому спеке про **порядок** или
**длительность** нужен [`useCountingClock()`](/ru/utilities/event-loop#usecountingclock-options), а
не замороженные часы.

## Модель, копию которой держат у себя восемь спек {#the-model-eight-specs-each-keep-a-copy-of}

Этот паттерн вообще не про спаев — потому и переживает любое ревью: контентная модель с
семнадцатью обязательными полями, у каждого свой вложенный интерфейс, скопированная в каждую спеку,
которой она нужна. Замерено на одном шарде миграции: одни только эти копии дали **28 диагностик
`TS1117`** — дублирующийся ключ в литерале — за 26 парами ключей в восьми фикстурах, плюс половину
`TS2741` того же шарда.

Лечится это не очередным способом пропустить поля. Лечится местом, куда их положить:

```ts
// article.fixture.ts
import { createFixtureFactory } from 'vitest-auto-spy';

export const anArticle = createFixtureFactory<Article>({
  id: '1',
  header: { title: '', subtitle: 'none' },
  tags: [],
  publishedAt: new Date(0),
});

// article-list.component.spec.ts
const draft = anArticle({ header: { title: 'Draft' } }); // header.subtitle выживает
const tagged = anArticle({ tags: ['news'] }); // массив заменяется, а не сливается
```

Ради двух свойств этот переезд и стоит делать — иначе это был бы вопрос вкуса. Умолчания представляют
собой **полный** `T`, так что поле, выброшенное из модели полгода назад, — это одна ошибка
компиляции вместо восьми молчаливых обманов; ровно ту диагностику, которую удаляют и `Partial<T>`, и
`as T`. И **каждый вызов возвращает новый объект**, что отправляет на покой общий `const FIXTURE`,
чья мутация в одном тесте решает исход другого; при `isolate: false` такое разделение дотягивается
и между файлами, а падение приходится на тот файл, который раннер поставил вторым.

Одна оговорка, которую стоит знать заранее: копия глубокая по обычным объектам и массивам, и на этом
останавливается. `Date`, `Map` или экземпляр класса едут по ссылке, потому что пересборка отняла бы у
них прототип. Если умолчания — это _и есть_ экземпляр модели с геттерами,
[`withOverrides`](/ru/utilities/fixtures#withoverrides-model-overrides-—-a-model-whose-getters-survive)
сначала снимет с них слепок.

## Чего не делать {#what-not-to-do}

| ❌                                                                     | ✅                                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| написанный руками `{ provide: X, useValue: { a: vi.fn() } }`           | `provideAutoSpy(X)`                                             |
| один и тот же литерал модели на 100 строк, скопированный в восемь спек | одна `createFixtureFactory<T>(defaults)`, вызываемая с разницей |
| `vi.spyOn(TestBed.inject(X), 'method')`                                | `injectSpy(X).method`                                           |
| `Object.defineProperty(service, 'ready', { value: true })`             | `mockReadonlyProp(service, 'ready', true)`                      |
| `let s: MyService = createSpyFromClass(MyService)`                     | `let s: Spy<MyService>`                                         |
| `source$.subscribe(v => expect(v).toBe(1))`                            | `await expect(expectEmission(source$)).resolves.toBe(1)`        |
| `expect(component.total).toBeTruthy()` на сигнале                      | `expect(component.total).toHaveSignalValue(3)`                  |
| `configureTestingModule` внутри каждого `it()`                         | один на `describe`                                              |
| `methodsToSpyOn`, использованный для _ограничения_ набора              | ограничивает `onlyMethodsToSpyOn`; `methodsToSpyOn` дополняет   |

Пятую строку стоит не принять на слово, а увидеть: одна и та же ложная проверка, написанная четырьмя
способами против четырёх потоков, и [прогон, в котором зелёными остаются все формы с
`subscribe`](/ru/core/observable-assertions#measured-four-forms-against-four-streams).

Первые три можно принудить — [у ESLint-плагина](/ru/utilities/eslint-plugin) есть правило на каждую.
Ограничьте его файлами спек: объект из `vi.fn()` в прикладном коде совершенно нормален.
