---
title: Паттерны спек
description: Короткие рецепты для обычных спек на Angular - подмена сервиса в TestBed, сигналы и Observable, эффекты, таймеры, сеть, консоль и тестовые данные.
---

# Паттерны спек

Короткие рецепты для задач, которые встречаются почти в каждом наборе тестов на Angular. Каждый
начинается с задачи, потом показывает код. Страницы API описывают все опции; эта страница — какие
хелперы брать под конкретную работу.

Задачи со своими страницами: [моки классов](/ru/guides/mocking-classes),
[мок `localStorage`](/ru/guides/mocking-local-storage), [мок Prisma Client](/ru/guides/mocking-prisma),
[стори Storybook](/ru/guides/storybook-angular),
[тесты без DOM](/ru/guides/testing-without-the-dom) и
[идиомы Angular Material](/ru/guides/angular-material-idioms).

## Проверить сервис с подменёнными зависимостями {#test-a-service-with-its-dependencies-replaced}

`TaskService` зависит от трёх сервисов. Спека подменяет все три спаями и проверяет настоящий
`TaskService`. Хелперам для Observable нужен `import 'vitest-auto-spy/rxjs'` один раз в setup-файле
(см. [Установку](/ru/core/installation#wiring-it-up)):

```ts
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

import { NewsFeedService } from './news-feed.service';
import { NotificationService } from './notification.service';
import { ProjectStore } from './project.store';
import { type Task, TaskService } from './task.service';

const task: Task = { id: 1, title: 'Write the docs' };

describe('TaskService', () => {
  let projects: Spy<ProjectStore>;
  let feed: Spy<NewsFeedService>;
  let service: TaskService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // обычный сервис: каждый метод — спай, настраивать нечего
        provideAutoSpy(NotificationService),
        // поля signal и computed живут на экземпляре; назовите их в instanceMethodsToSpyOn
        provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current', 'isEmpty'] }),
        // Observable-свойства нужно назвать; методы находятся сами
        provideAutoSpy(NewsFeedService, { observablePropsToSpyOn: ['connected$'] }),
      ],
    });

    projects = injectSpy(ProjectStore);
    feed = injectSpy(NewsFeedService);

    // ответы, нужные каждому тесту, задаём один раз
    feed.connected$.nextWith(true); // Observable-свойство
    projects.save.mockReturnValue(of(true)); // метод, который возвращает Observable
    projects.load.resolveWith([task]); // метод, который возвращает Promise

    service = TestBed.inject(TaskService);
  });

  it('saves through the store', () => {
    service.save(task);

    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(projects.save).toHaveBeenCalledWith(task);
  });
});
```

Каким хелпером задать ответ, зависит от типа возврата метода:

| Метод возвращает | Ответ задаётся через                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| `Promise<T>`     | `resolveWith(value)`, `rejectWith(error)`                              |
| `Observable<T>`  | `nextWith(value)`, `throwWith(error)` или `mockReturnValue(of(value))` |
| что-то другое    | `mockReturnValue(value)`, как у любого мока Vitest                     |
| любое из этого   | `calledWith(...args).mockReturnValue(value)` для аргументов            |

Каждый спай работает и с обычными матчерами Vitest: `toHaveBeenCalledTimes`, `toHaveBeenCalledWith`
и остальными.

Четыре привычки, которые окупаются:

1. **Пишите `configureTestingModule` один раз, в `beforeEach` у `describe`**, а не заново внутри
   каждого `it()` со своей настройкой. Если модуль меняется от теста к тесту, Angular компилирует его
   заново — это самая большая лишняя трата в спеках Angular.
2. **Объявляйте каждый спай как `Spy<T>` и получайте его через `injectSpy`.** Не как `T`: в `Spy<T>`
   нет приватных членов, поэтому в `T` он не подходит ([почему](/ru/core/spy-typing)).
3. **Ответы по умолчанию задавайте в `beforeEach`, а меняйте в тесте.** Ненастроенный метод-спай
   возвращает `undefined`. Если код на него подписывается или ждёт его, тест упадёт далеко от причины.
4. **Спаи создаются лениво**, при первом обращении. Сервис с множеством методов подменяется бесплатно: методы, которые тест не вызывает, ничего не стоят.

## Задать сигнал зависимости или компонента {#set-a-signal-on-a-dependency-or-on-the-component}

Сигнал — функция, лежащая в поле экземпляра. Какой хелпер нужен, зависит от того, чей это сигнал:
**зависимости** или **класса, который вы тестируете**.

```ts
import { signal } from '@angular/core';
import { injectSpy, mockReadonlyProp, provideAutoSpy } from 'vitest-auto-spy/angular';

// сигнал зависимости: назовите его и настраивайте как любой спай
provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current', 'isEmpty'] });
injectSpy(ProjectStore).current.mockReturnValue({ id: 1 });

// свой signal, computed или input тестируемого компонента: замените поле настоящим сигналом
mockReadonlyProp(component, 'selected', signal(true));
mockReadonlyProp(component, 'items', signal([]));
mockReadonlyProp(component, 'host', signal({ nativeElement: element }));
```

`mockReadonlyProp(target, key, signal(value))` нужен чаще всего. Он ставит настоящий сигнал, поэтому
каждый `computed()`, который его читает, обновляется правильно. `vi.fn()`, возвращающий значение,
так не умеет. Если значение должно меняться по ходу теста, берите `mockSignalProp`. Он возвращает
записываемый сигнал:

```ts
const selected = mockSignalProp(component, 'selected', false);

selected.set(true); // каждый computed, который его читает, обновится
```

Вызвать `.set` у `component.selected` напрямую нельзя: у `Signal<T>` нет `set`, так что такой код
компилируется только с приведением типа. `mockSignalProp` даёт сигнал, который можно менять.

Что делает `mockSignalProp`, зависит от члена:

- в `signal()`, `model()` или `linkedSignal()` он записывает значение, а не заменяет член, поэтому
  работает и до первого рендера, и после;
- `computed()` он заменяет, и сделать это нужно до первого рендера. Если поздно, `mockSignalProp`
  бросит ошибку, а не оставит старое значение;
- `input()` он не трогает. Задавайте его через `fixture.componentRef.setInput(name, value)`.

`mockReadonlyPropGetter` — когда значение нужно вычислять заново при каждом чтении, `mockValueProp` —
для обычного записываемого поля.

::: warning `vi.restoreAllMocks()` этого не откатывает
Эти хелперы переопределяют свойства, а раннер такого не отслеживает. Вызовите
[`setupAutoSpy()`](/ru/utilities/setup) в setup-файле: он запускает `restoreMockedProps()` после
каждого теста. Без него при `isolate: false` изменение глобала, прототипа или синглтона протекает в
следующий файл.
:::

## Управлять Observable-свойством или методом {#drive-an-observable-property-or-method}

Свойство, в котором лежит Observable, и метод, который его возвращает, настраиваются по-разному:

```ts
class NewsFeedService {
  readonly connected$ = new BehaviorSubject(false); // СВОЙСТВО → observablePropsToSpyOn
  watch(id: number): Observable<Item> {} // МЕТОД    → настраивать нечего
}

provideAutoSpy(NewsFeedService, { observablePropsToSpyOn: ['connected$'] });

feed.connected$.nextWith(true); // свойство, управляется хелперами
feed.watch.nextWith(item); // метод, спай создан автоматически
```

Метод, который возвращает `Observable`, находится на прототипе, как любой другой. Хелперы для
Observable он получает по своему **типу возврата**. Называть нужно только свойства: прототип их не
показывает.

Обоим нужны хелперы rxjs, подключённые один раз в setup-файле:

```ts
import 'vitest-auto-spy/rxjs';
```

Без этого импорта `nextWith` бросит ошибку, где так и сказано.

## Достать спай из провайдера компонента {#get-a-spy-from-a-component-level-provider}

`injectSpy(X)` читает **корневой** инжектор `TestBed`. Провайдер, объявленный на самом компоненте
(`@Component({ providers: [...] })`), живёт в собственном инжекторе компонента, который
`TestBed.inject` не видит. Достаньте его через fixture и оберните результат в `asSpy`:

```ts
import { asSpy } from 'vitest-auto-spy';

const player = asSpy(fixture.debugElement.injector.get(PlayerService));

player.play.mockReturnValue(true);
```

Обратное направление — передать спай в функцию, которая ждёт настоящий класс, — это
[`asInstance`](/ru/core/spy-typing):

```ts
expect(isEnabled(asInstance(featureFlags))).toBe(true);
```

Оба возвращают тот же объект, меняется только тип. Пользуйтесь ими только на таких стыках. Если они
нужны в каждом файле, значит переменные объявлены как `T`, а не `Spy<T>`.

## Подменить signal store из ngrx {#replace-an-ngrx-signal-store}

`signalStore()` кладёт все свои члены **на экземпляр**, поэтому прототип их не показывает. Для
класса, построенного на `signalStore()`, библиотека по умолчанию включает `fillMissing: true`. С этой опцией
каждый член, к которому вы обратились, отвечает спаем, даже если класс его не объявляет.

```ts
// каждый член из withMethods / withProps отвечает спаем
provideAutoSpy(TaskStore, { returns: { load: undefined } });

// …или обойтись без класса и построить мок по типу, прототип не нужен
const store = createAutoMock<TaskStore>();
```

`createAutoMock<T>()` берите, когда класса нет. С классом, благодаря умолчанию выше, перечислять
ничего не нужно, и никакой список не отстанет от стора.

`rxMethod` — функция со свойством `destroy`, которого у голого мока нет. Соберите его сами, иначе
очистка компонента бросит ошибку:

```ts
const load = Object.assign(vi.fn(), { destroy: vi.fn() });
```

## Проверить, что сделал эффект {#test-what-an-effect-produces}

Не подменяйте `effect()` моком `@angular/core`. Под билдером unit-test Angular это может сработать,
но легко ломается. Фабрика мока с объектным spread падает с
`Cannot access '__vi_import_N__' before initialization`, и сообщение не называет ни то, ни другое.
См. [моки модулей под билдером unit-test](/ru/guides/angular-unit-test-builder#module-mocks-under-the-unit-test-builder).

Проверяйте **результат** эффекта: задайте сигналы, которые он читает, дайте ему выполниться и
проверьте, что получилось.

```ts
import { signal } from '@angular/core';
import { mockReadonlyProp, stable } from 'vitest-auto-spy/angular';

mockReadonlyProp(component, 'state', signal(State.Selected));

await stable(fixture); // выполнить эффекты, затем дождаться fixture

expect(component.icon()).toBe('favouritesFilled');
```

Берите [`stable(fixture)`](/ru/adapters/angular#zoneless-waiting). `fixture.detectChanges()` делает
один проход обнаружения изменений и **не** выполняет отложенные эффекты, поэтому проверка сразу после
него читает незаконченное состояние. Для сервисов и сторов без fixture есть `flushEffects()`.
Ожидание ограничено, по умолчанию 2000 мс. Потом оно бросает ошибку с причиной, а не таймаут на весь
файл.

### Проверить компонент, который грузит данные через `httpResource()` {#test-a-component-that-loads-through-httpresource}

```ts
const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));

flushEffects(); // запрос уходит здесь, а не при создании ресурса
TestBed.inject(HttpTestingController).expectOne('/api/products').flush([product]);
await settleResource(products, { label: 'the product resource' });

expect(products.value()).toEqual([product]);
```

[`settleResource`](/ru/adapters/angular#resources-httpresource-and-resource) одинаково ждёт
`httpResource()`, `resource()` и `rxResource()`, хотя каждому нужно разное число шагов. Проверка до
него читает значение ресурса _по умолчанию_ и может пройти. Такой тест зелёный, но ничего не
доказывает — до дня, когда значение по умолчанию изменится.

Если эффект сам больше не запустится, потому что сигнал, который он читает, больше не меняется,
выполните его тело напрямую через `runEffect`:

```ts
runEffect(component.highlightEffect); // выполняется сразу, с текущими значениями сигналов
```

## Заглушить observer, который создаёт компонент {#stub-an-observer-the-component-creates}

Тестируемый код сам создаёт `IntersectionObserver`, `ResizeObserver` или `MutationObserver` и держит
его приватным. Спеке доступен только глобальный конструктор. Замена руками обычно ошибается дважды:

- заглушку никто не снимает, и при `isolate: false` её получает следующий файл;
- экземпляр достают через поле `static last`, которое тоже переживает спеку.

```ts
import { intersectionEntry, stubIntersectionObserver } from 'vitest-auto-spy/dom-stubs';

const observers = stubIntersectionObserver();

fixture.detectChanges(); // директива создаёт свой observer

observers.last.emit([intersectionEntry(fixture.nativeElement, true)]);
await fixture.whenStable();
```

Заглушка ставится через `mockValueProp`, поэтому `restoreMockedProps()` возвращает настоящий
конструктор. `setupAutoSpy()` и так запускает его после каждого теста. `emit()` принимает **список**
записей, потому что быстрый скролл присылает несколько сразу. Код, который ждёт одну запись за вызов,
содержит настоящую ошибку, и так тест её найдёт.

## Не дать таймерам утечь в следующий файл {#stop-timers-from-leaking-into-the-next-file}

Это видно на больших наборах тестов, как падение в файле, который ни в чём не виноват.

При `isolate: false` (опция Vitest, см. [Глоссарий](/ru/glossary)) все файлы тестов в воркере
делят одно окружение. `setTimeout` компонента,
который никто не отменил, продолжает жить после конца своего файла. Колбэк срабатывает посреди
следующего файла, при других моках и другом DOM. В zoneless-приложении так же важен
`requestAnimationFrame`. Обнаружение изменений в Angular гоняет `setTimeout` наперегонки с колбэком
кадра, поэтому у уничтоженного компонента он ещё может стоять в очереди.

Симптомы, и все приписаны не тому файлу:

- `Schedulers cannot synchronously execute watches while scheduling`
- `signal read during notification phase`
- необработанный rejection с компонентом, который падающий файл даже не импортировал

Лечится одной опцией. Она запоминает каждый таймер и отменяет те, что ещё ждут, в `afterAll`:

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ strayTimers: true });
```

Составные части тоже экспортируются. С ними можно делать очистку в другом месте или сделать так,
чтобы утечка **валила** тест, а не убиралась молча:

```ts
import { cancelStrayTimers, countStrayTimers, trackStrayTimers } from 'vitest-auto-spy/setup';

trackStrayTimers(); // один раз, в начале setup-файла; повторный вызов безопасен
afterEach(() => expect(countStrayTimers()).toBe(0)); // утечка = падение теста
afterAll(() => cancelStrayTimers()); // или просто отменить; возвращает их число
```

Если у вас `isolate: false`, включите это до первого странного падения.

## Заблокировать настоящие сетевые запросы {#block-real-network-requests}

В happy-dom есть `fetch`, в jsdom нет. Переведите тесты с jsdom на happy-dom, и компонент, который
грузит удалённый файл, начнёт слать настоящие запросы. Их никто не проверяет, поэтому все тесты
зелёные. Потом раннер закрывает окружение, открытые запросы обрываются, и обрывы приходят как
необработанные ошибки _после_ итогов:

```text
 Test Files  260 passed (260)
      Tests  2257 passed (2257)

Vitest caught 8 unhandled errors during the test run.
DOMException [AbortError]: The operation was aborted.
```

Прогон выходит с кодом 1 и не называет ни одного теста, потому что ни один не упал. Заблокируйте сеть
в setup-файле:

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ blockNetwork: true });
```

Теперь `fetch` сразу отклоняется, и в сообщении есть запрошенный URL. Тестируемый код идёт тем же
путём, что и при неудачном запросе. `XMLHttpRequest` и `navigator.sendBeacon` блокируются тоже: в
jsdom XHR реализован полностью, и библиотека на нём (скажем, рекламный плеер, который пингует
трекеры) всё равно дошла бы до интернета. Если это пинги, ответ на которые никто не читает,
отвечайте на них пустым ответом, а не ошибкой:

```ts
setupAutoSpy({ blockNetwork: { xhr: 'empty' } });
```

## Сдвинуть фейковые таймеры {#advance-fake-timers}

```ts
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

setupFakeTimers(); // один раз на describe; ставит фейковые таймеры и возвращает настоящие

it('debounces', async () => {
  component.search('query');

  await advanceTimers(300); // сдвинуть время и выполнить промисы, которые разрешили таймеры
  await stable(fixture);

  expect(api.search).toHaveBeenCalledWith('query');
});
```

Один `vi.advanceTimersByTime()` оставляет промисы, которые разрешили таймеры, неисполненными.
Проверка тогда читает старое состояние. `advanceTimers()` дожидается и их.

## Проверить вывод в консоль {#assert-on-console-output}

Импортируйте `vitest-auto-spy/console` и проверяйте его спаи. Вывод глушится, а не печатается.

```ts
import { consoleErrorSpy } from 'vitest-auto-spy/console';

service.handle(brokenPayload);

expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('parse'));
```

**Частая ошибка:** второй `vi.spyOn(console, 'error')` поверх. Какой победит, зависит от порядка
импортов, и проверка может смотреть на спай, который вызова не видел.

## Аргумент, который спека не может выписать {#an-argument-the-spec-cannot-spell}

Некоторые аргументы не записать литералом: колбэк, который собрал код, объект опций из трёх мест,
`FormData`. `captureArg` ловит такой аргумент, чтобы его можно было проверить потом.

```ts
import { captureArg } from 'vitest-auto-spy';

const options = captureArg<RequestInit>();

expect(fetchSpy).toHaveBeenCalledWith('/api/save', options);

expect(options.value.method).toBe('POST');
```

В `.values` лежит каждое значение, которое захвату **предложили**, а не только из совпавших вызовов.
Раннер проверяет каждый записанный вызов аргумент за аргументом, слева направо, и останавливается на
первом несовпадении. Захват совпадает с чем угодно. Поэтому захват левее аргумента, который потом не
совпал, уже записал этот вызов. Захват на последнем месте видит только вызовы, совпавшие во всём до
него.

Если в `.values` должны быть только совпадения, дайте захвату фильтр. Тогда он сам решает, совпало
ли, и записывает только то, что принял:

```ts
const post = captureArg<RequestInit>({ where: (value) => (value as RequestInit).method === 'POST' });

expect(fetchSpy).toHaveBeenCalledWith('/api/save', post);
expect(post.values).toHaveLength(1);
```

`captured` говорит, что захвату что-то предложили, а не что проверка прошла. Прошла ли она, решает
`expect`, а из захвата читайте, что пришло в вызов.

## Найти поле, которое отличается в списке записей {#find-the-field-that-differs-in-a-list-of-records}

```ts
import { diffByField } from 'vitest-auto-spy/diagnostics';

const sent = analytics.send.mock.calls.map(([event]) => event);

expect(diffByField(sent, expectedEvents)).toBeUndefined();
```

Тесты всего, что копит записи, сравнивают список с ожидаемым: очередь аналитики, журнал аудита,
историю команд. Обычное расхождение — одно поле, которое изменилось во всех элементах: время,
идентификатор, счётчик.

Vitest показывает это плохо. Он схлопывает объекты и печатает
`expected [ { event_timestamp: 1, …(5) }, …(8) ] to deeply equal [ { …(6) }, … ]`. Девять элементов,
одно изменившееся поле, и не сказано, какое. `diffByField` говорит прямо:

```text
9 of 9 elements differ.
  `event_timestamp` differs in all 9: actual 1 everywhere, expected 2, 3, 4, 5, 6, 7, …
```

Элемент, который **не** простая запись, сравнивается целиком и называется `the element`. Это `Date`,
`Map`, `Set`, `URL` и экземпляр класса, у которого состояние спрятано за геттерами. Сравнение по полям
читает `Object.keys`, а у всех них он пустой, и разницы бы не нашлось. Так же отчитываются две
записи, которые отличаются только полем с ключом-символом.

Слово «everywhere» рядом со списком ожидаемых значений — подсказка. Под фейковыми таймерами каждый
`Date.now()` в одном тесте возвращает одно и то же. Спеке про **порядок** или **длительность** нужен
[`useCountingClock()`](/ru/utilities/event-loop#usecountingclock-options), а не замороженные часы.

## Одна тестовая модель на все спеки {#share-one-test-model-across-specs}

Частый приём вообще не про спаи: модель с семнадцатью обязательными полями, скопированная в каждую
спеку, которой она нужна. Когда модель меняется, менять приходится каждую копию, и копии расходятся.
Лечится это одним местом для значений по умолчанию:

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
const draft = anArticle({ header: { title: 'Draft' } }); // header.subtitle сохраняется
const tagged = anArticle({ tags: ['news'] }); // массив заменяется, а не сливается
```

Две вещи делают это лучше скопированного литерала:

- **Значения по умолчанию — полный `T`.** Когда из модели убирают поле, вы получаете одну ошибку
  компиляции, а не восемь молча неверных копий. `Partial<T>` и `as T` эту ошибку прячут.
- **Каждый вызов возвращает новый объект.** Общий `const FIXTURE`, изменённый в одном тесте, может
  решить исход другого. При `isolate: false` это переходит даже между файлами.

Копия глубокая по обычным объектам и массивам и на этом останавливается. `Date`, `Map` или
экземпляр класса передаются по ссылке, потому что пересборка лишила бы их прототипа. Если значения по
умолчанию — _это и есть_ экземпляр модели с геттерами, берите
[`withOverrides`](/ru/utilities/fixtures#withoverrides-model-overrides-—-a-model-whose-getters-survive).

## Частые ошибки {#common-mistakes}

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
| `methodsToSpyOn`, чтобы _ограничить_ набор                             | ограничивает `onlyMethodsToSpyOn`; `methodsToSpyOn` добавляет   |

Почему строка про `subscribe` важна: проверка внутри `subscribe` не выполнится, если поток ничего не
выпустил, и тест пройдёт. См. [четыре формы против четырёх потоков](/ru/core/observable-assertions#measured-four-forms-against-four-streams).

[У плагина ESLint](/ru/utilities/eslint-plugin) есть правило на каждую из первых трёх строк. Включайте
его только для файлов спек: объект из вызовов `vi.fn()` в коде приложения — это нормально.

## Подробнее: какими хелперами пользуется большой набор тестов {#in-depth-which-helpers-a-large-test-set-uses}

Подсчитано в одном zoneless-проекте на Angular 22 примерно из 370 файлов спек, который пользуется
этой библиотекой с ранних версий:

| Хелпер                                                                      | Файлов спек с ним |
| --------------------------------------------------------------------------- | ----------------: |
| [`provideAutoSpy`](/ru/adapters/angular)                                    |               371 |
| [`injectSpy`](/ru/adapters/angular)                                         |               308 |
| [`mockReadonlyProp`](/ru/adapters/angular#signal-readonly-property-mocking) |               127 |
| [`mockValueProp`](/ru/adapters/angular#signal-readonly-property-mocking)    |               104 |
| `instanceMethodsToSpyOn`                                                    |               103 |
| `observablePropsToSpyOn`                                                    |                79 |
| [спаи консоли](/ru/utilities/console)                                       |                68 |
| [`createSpyFromClass`](/ru/core/create-spy-from-class)                      |                41 |

Два вывода. В приложении на Angular спай почти всегда приходит через DI, так что `createSpyFromClass`
— исключение. А `instanceMethodsToSpyOn` встречается часто: больше чем в четверти файлов спек, потому
что поля `signal()` и `computed()` — ровно то, чего прототип не показывает.

Настройка тоже повторяется. В другом проекте на Angular `Router` был настроен 23 разными способами в
109 файлах спек ([как расходятся опции](/ru/core/create-spy-from-class#how-often-the-options-drift)).
Для этого и есть
[`registerAutoSpyDefaults`](/ru/core/create-spy-from-class#registerautospydefaults-—-the-composition-lives-with-the-class):
настройка регистрируется один раз в setup-файле, а каждая спека добавляет только то, что отличается.
