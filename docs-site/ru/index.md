---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
title: vitest-auto-spy
description: Единственная auto-spy библиотека, которая читает настоящий класс и возвращает полностью типизированный спай каждого метода, с хелперами управления, следующими за типом возврата, — одинаково на Vitest, Bun, node:test и Rstest. Drop-in замена jest-auto-spies и jasmine-auto-spies с кодмодом, который дописывает переезд.

hero:
  name: 'vitest-auto-spy'
  text: 'Типизированный спай каждого метода, прочитанный из класса'
  tagline: 'Наведите на класс — и каждый метод вернётся спаем, типизированным, с хелперами, которые заслужил его собственный тип возврата. Одно API на Vitest, bun:test, node:test и Rstest.'
  actions:
    - theme: brand
      text: Начать
      link: /ru/core/introduction
    - theme: alt
      text: Почему не та, что стоит сейчас
      link: /ru/comparison
    - theme: alt
      text: Открыть на GitHub
      link: https://github.com/ASDAlexey/vitest-auto-spy

features:
  - title: Каждый метод — из настоящего класса
    details: 'createSpyFromClass читает прототип, поэтому у дубля те же методы, перегрузки и сигнатуры, что у класса, — а вызов, который отвергает настоящий метод, не скомпилируется и на дубле.'
    link: /ru/core/create-spy-from-class
  - title: Хелперы, которые следуют за типом возврата
    details: 'Метод, возвращающий Promise, получает resolveWith и rejectWith, возвращающий Observable — nextWith и throwWith, а каждый метод получает calledWith, mustBeCalledWith и failWith. При чтении значения обратно narrow.defined возвращает его без null и undefined прямо внутри выражения, которому оно нужно; toBeDefined() в Vitest 5.0 ничего не сужает, а assert.exists сужает, но ничего не возвращает, и каждое необязательное чтение стоит лишней инструкции и локальной переменной. adoptMock даёт те же хелперы vi.fn(), который уже собрала фабрика vi.mock, и сохраняет записанные им вызовы. createLog журналирует порядок вызовов между коллаборантами — там, где toHaveBeenCalled проходит в любом порядке; это класс, который сам Angular держит в трёх копиях, отгруженный один раз и без привязки к раннеру.'
    link: /ru/core/control-helpers
  - title: Настройки спая живут рядом с классом
    details: 'registerAutoSpyDefaults(Router, config) один раз в setup-файле — и каждый provideAutoSpy или createSpyFromClass стартует с них, сливая с тем, что добавил вызов, а не заменяя. В одной Angular-сюите один и тот же класс собрал 23 разные конфигурации в 109 файлах спек; десяток классов заезжает одной таблицей, и каждая строка проверяется по своему классу, а InjectionToken регистрируется так же, через vitest-auto-spy/angular, и одна строка снимается через clearAutoSpyDefaults.'
    link: /ru/core/create-spy-from-class
  - title: Vitest 5 тем же пакетом
    details: 'Один пакет покрывает Vitest с 2.1 по 5.x — без второго мажора, без раздвоенных типов, без единой правки в спеке. Та же сюита идёт на 7.7 % быстрее на Vitest 5, а встроенный движок спаев даёт ещё 8.1 % поверх vi.fn().'
    link: /ru/runtimes/vitest#vitest-5
  - title: Одно ядро, четыре среды запуска
    details: 'vi.fn() и его аналоги сидят за адаптером, который каждая входная точка регистрирует при импорте, поэтому один и тот же файл спеки идёт на Vitest, bun:test, node:test и Rstest.'
    link: /ru/runtimes/vitest
  - title: Angular, NestJS, React, Vue, Svelte
    details: 'У каждого фреймворка своя входная точка — провайдеры DI, поверхностный TestBed без дочернего поддерева, заглушки детей, которые createComponentStub читает из настоящего определения, чтобы селектор и инпуты не разъехались, сигналы и ресурсы, которыми спека управляет руками, и матчеры, которых не поставляет ни один раннер, — registerSignalMatchers добавляет toHaveSignalValue, который читает сигнал и глубоко сверяет его значение, тогда как expect(signal).toBeTruthy() проходит для любого когда-либо созданного сигнала, потому что сигнал — это функция; registerResourceMatchers и registerDirectiveMatchers сверяют статус ресурса и директивы, применённые к fixture. provideActivatedRoute отдаёт Angular его собственный ActivatedRoute поверх одной записи, createActivatedRoute — то же без TestBed; сеттер на injectActivatedRoute() сначала заменяет snapshot и эмитит только те потоки, что сдвинулись, тогда как setRouteParam в Spectator 22.1 переизлучает все пять. stubWebStorage подменяет localStorage на один тест, а restoreMockedProps возвращает прежний. createSpyFromInstance с passthrough ставит спай на настоящий сервис из TestBed на месте — вызовы записаны, методы настоящие.'
    link: /ru/adapters/angular
  - title: Провайдеры, которые каждая сюита пишет руками
    details: 'provideRouterDouble выводит url, routerState и events из одного URL вместо четырёх догадок самодельного Router, а navigate отвечает true; setCurrentNavigation ставит навигацию в полёт, и currentNavigation() отвечает тем extras.state или тем trigger, который читает компонент, без instanceMethodsToSpyOn, нужного самодельному дублю для поля, которое Angular 20.2 убрал с прототипа, а NavigationStart, протолкнутый через emitNavigation, её начинает, тогда как NavigationEnd, NavigationCancel, NavigationError или NavigationSkipped возвращает её в null, как это делает настоящий роутер, — emitNavigation резолвится, когда роутер устаканился, а collectRouterEvents превращает последующие события в один expect пар класс-и-URL; provideLocationDouble оборачивает SpyLocation, который Angular сам отгружает, — настоящая история с журналом urlChanges и simulateUrlPop для popstate, которого не вызвать методом, а то, что Location объявлен providedIn root, делает тихим падением настоящий Location, который никто не настроил. provideWindowDouble и provideDocumentDouble подмешивают названное спекой поверх настоящего jsdom-объекта, поэтому член, о котором никто не подумал, по-прежнему отвечает, а сами глобальные объекты не патчатся; provideMatDialogData и provideMatDialogRef закрывают троицу материального диалога, а @angular/material не становится зависимостью пакета. mockSignalProp пишет сквозь член, который уже является signal(), model() или linkedSignal(), а не подменяет его, поэтому computed, effect или шаблон, прочитавшие его первыми, остаются связанными; setInputs меняет вход посреди теста, а trackRecomputations и trackEffectRuns считают, что действительно пересчиталось и перезапустилось. У каждого есть близнец, которому не нужен TestBed, — createRouterDouble, createWindowDouble, createDocumentDouble, createMatDialogRef, createLocationDouble, — а injectRouterDouble, injectMatDialogRef и injectLocationDouble достают ручку управления уже внутри теста.'
    link: /ru/adapters/angular
  - title: Сигнальные формы Angular — в спеке
    details: 'Сигнальные формы стабильны с Angular 22, и для них не поставляет инструментов никто; form() инжектит, поэтому вызов, который спека делает в beforeEach, падает с NG0203 — сообщением про inject(), где слова «форма» нет вовсе. createForm собирает тот же самый form() Angular внутри контекста инъекции TestBed и отдаёт FieldTree фреймворка, ничего не оборачивая, принимая модель как signal() или как обычное значение. registerFormMatchers добавляет toHaveFieldErrors, который сверяет весь набор ошибок без учёта порядка, по kind, — там, где errors() отвечает экземплярами ошибок валидации, на которых toEqual падает из-за обратной ссылки, которую никто не писал.'
    link: /ru/adapters/signal-forms
  - title: Строгий режим вместо undefined
    details: 'Метод, который никто не настроил, бросает с именем класса, метода и аргументами в сообщении, а не возвращает undefined, падающий тремя кадрами позже. Бросок, который код под тестом поймал — try/catch, оператор без обработчика ошибки, — всё равно роняет тест после его конца, а намеренный забирается функцией takeStrictViolations(). Геттер, который никто не настроил, и поток, который никто не накормил, попадают в отчёт после теста с unconfiguredReads, а сначала обследуются через onUnstubbedRead. Дерево mockDeep принимает fallbackMockImplementation, и запрос, который никто не настроил, бросает, а не отвечает ещё одним прокси.'
    link: /ru/core/strict-mode
  - title: Сорок правил линтера и кодмод
    details: 'ESLint-плагин подчёркивает старые паттерны прямо в редакторе — приватный член через каст, глобал наблюдателя, заглушённый руками, fetch, присвоенный глобалу, который никто не восстанавливает (no-hand-assigned-global), класс-заглушка из полей vi.fn(), подключённый через useClass, schemas, которые не могут сработать, useValue, который не проверял ни один компилятор, спай на инстансном хуке жизненного цикла, @ts-expect-error над заглушкой, expect, который не может упасть, и — правилом no-redundant-smoke-test — сгенерированный smoke-тест, проверяющий только то, что TestBed прямо сейчас и собрал, и — правилом prefer-set-inputs — componentRef.setInput, имя которого Angular не проверяет ничем, и — правилом prefer-stub-response — написанный руками Response: литерал объекта, приведённый через as Response, или createMock<Response>(), который отвечает undefined на status, headers, text() и на всё остальное, о чём автор не подумал, отчего код под тестом ветвится по значению, которого настоящий ответ дать не мог, — а кодмод из CLI переписывает сюиту на jest-auto-spies в диф, который можно прочитать до того, как оставить.'
    link: /ru/utilities/eslint-plugin
  - title: Провалы, о которых больше никто не сообщает
    details: 'Патч mock*Prop, оставленный в теле describe, перестаёт применяться после первого теста, компонент, чьи собственные providers перекрывают спай, молча работает с настоящим сервисом, а один ключ, оставленный на Object.prototype, не даёт собраться ни одному следующему файлу воркера, пока Vitest 5.0 печатает ноль упавших тестов и ни одного стека — под любым раннером это тишина, здесь названо свойством, токеном или файлом. enableAngularDiagnostics одним вызовом в setup-файле переводит ещё пять таких провалов из молчаливых в падающие — импорт NgModule, который ничего не приносит, schemas, которые не могут сработать рядом со standalone-компонентом, injectSpy, достающий настоящий инстанс, запрос, который ни одна спека не сбросила, и тот самый перекрытый провайдер, — а его половина тайминга, enableTestBedDiagnostics, печатает по строке на файл, сколько его времени ушло в TestBed и сколько компонентов он собрал, — это список, по которому медленную Angular-сюиту переписывают. Вывод в консоль, который ничто не поглотило, роняет тест, который его написал, с кодфреймом на этой строке; хук onConsoleLog в Vitest 5.0 умеет только отбросить строку, но не уронить тест. Атрибут, который компонент поставил на <body> и не снял, роняет чужой файл примерно в одном прогоне из шести и только когда оба делят воркер; documentPollution называет тест, который его оставил, и возвращает документ как было, а ни один раннер документ между файлами не сравнивает. blockNetwork роняет запрос, дошедший до настоящей сети, и уступает, когда fetch перехватывает MSW или nock; stubResponse собирает настоящий Response для заглушённого fetch без каста. Один строгий пресет переводит каждую проверку в режим падения.'
    link: /ru/utilities/setup
  - title: Какой тест медленный — и почему
    details: 'npx vitest-auto-spy perf --gate роняет CI на файле, где каждый тест стоит во много раз больше медианного теста того же прогона, поэтому ноутбук и раннер в девять раз медленнее выносят один и тот же вердикт. Каждого подозреваемого сначала перемеряют в одиночку и только потом дают ему что-то уронить, а подтверждённый приходит с карточкой CPU-профиля — самые медленные тесты, хуки против тел тестов, доля по пакетам и в вашем собственном коде и вероятная причина в двух предложениях. Обычный прогон профилировщик не загружает никогда. Vitest 5.0 помечает тест дольше фиксированного slowTestThreshold в 300 ms — одно число на любой машине — и не говорит, куда ушло время.'
    link: /ru/utilities/cli#the-gate
---

<div class="vas-section">

<p class="vas-eyebrow">01 / Установка</p>

## Шестьдесят секунд до первого спая

Ноль runtime-зависимостей; `rxjs` и `@angular/core` опциональны и нужны только для своей входной
точки. Входным точкам Angular нужен Angular 20 или новее — сигнальным формам 22 — см.
[Установку](/ru/core/installation).

```bash
npm i -D vitest-auto-spy
```

Дальше импорт из входной точки под ваш раннер — всё, что после этой строки, одинаково.

```ts
import { createSpyFromClass } from 'vitest-auto-spy'; // Vitest, без настройки
import { createSpyFromClass } from 'vitest-auto-spy/bun'; // bun:test
import { createSpyFromClass } from 'vitest-auto-spy/node'; // node:test
import { createSpyFromClass } from 'vitest-auto-spy/rstest'; // Rstest
```

</div>

<div class="vas-section">

<p class="vas-eyebrow">02 / Суть</p>

## Дубль, который вы синхронизируете руками, — удалён

<div class="vas-split">

<div>

### Мок, который пишут сегодня

```ts
const users = {
  load: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
} as unknown as UserService;

vi.mocked(users.load).mockResolvedValue(user);
vi.mocked(users.save).mockRejectedValue(new HttpError(409));
```

</div>

<div>

### <span class="vas-mark">Строка, которая его заменяет</span>

```ts
const users = createSpyFromClass(UserService);

users.load.resolveWith(user);
users.save.rejectWith(new HttpError(409));
```

</div>

</div>

Уходит прежде всего каст. Переименуйте метод в `UserService` — и собранный руками объект всё ещё
компилируется, всё ещё зелёный и уже ничего не проверяет; `Spy<UserService>` превращает то же
переименование в красную строку в спеке. Класса нет? `createAutoMock<T>()` строит ту же поверхность
от типа или интерфейса.

[Как это работает](/ru/core/how-it-works) · [createSpyFromClass](/ru/core/create-spy-from-class) ·
[Хелперы управления](/ru/core/control-helpers)

</div>

<div class="vas-section">

<p class="vas-eyebrow">03 / Медленные тесты</p>

## Какой тест медленный — и почему

Vitest печатает одну строку `Duration` на весь прогон. `perf` превращает её в файлы, которые
действительно медленные, перемеряет каждый в одиночку, чтобы загруженный раннер не подставил чужой
файл, и печатает, куда ушло время CPU. Одна команда — локально или в CI:

```bash
npx vitest-auto-spy perf --gate
```

```
error  perf-gate-slow-file libs/player/src/lib/vod/vod.component.spec.ts
       The test bodies in this file add up to 9.20s, over the 5.00s budget (…). Re-measured on its own: 8.70s, still over budget.

       ┌─ measurements ────────────────────────────────────────────────
       │ tests             38   242ms each   20× the median test
       ├─ slowest tests ───────────────────────────────────────────────
       │  527ms  focus > moves through the controls
       ├─ where the time went · CPU profile, 8.41s sampled ────────────
       │ hooks        ███████████░░░░░░░░░ 54%   test bodies 46%
       │ by package   ██████░░░░░░░░░░░░░░  28%  jsdom
       │ in the spec  setUpWith 38%  ·  VodComponent_Template 17%  ·  assertFocus 8%
       ├─ likely cause ────────────────────────────────────────────────
       │ Most of the time is set-up that every test repeats: 54% is in hooks — setUpWith alone is 38%.
       └───────────────────────────────────────────────────────────────
```

Бюджет считается в медианных тестах **того же прогона**, поэтому ноутбук и раннер в девять раз
медленнее выносят один вердикт, а большой файл из обычных тестов его не нарушает никогда — на
потребительской сюите из 2 023 файлов правило, которое он заменил, отмечало 0 файлов при замедлении
×1 и 19 при ×9, а это не отмечает ни одного ни при каком. Файл, который быстр, когда машина целиком
его, помечается как _не воспроизвелось_, а не как дефект. Профилировщик грузится только для этого
перемера; обычный прогон не платит ничего. На Angular-спеке карточка ещё и раскладывает время на настройку
TestBed, создание компонента, change detection и JIT-компиляцию, а `--code-quality` кладёт все
находки в виджет merge request GitLab без сети и без токена.

[Гейт](/ru/utilities/cli#the-gate) · [`perf` целиком](/ru/utilities/cli#perf-—-where-the-cpu-time-actually-goes) ·
[В CI](/ru/utilities/cli#in-ci)

</div>

<div class="vas-section">

<p class="vas-eyebrow">04 / Куда дальше</p>

## Начните оттуда, где вы уже стоите

<div class="vas-map">

<div class="vas-map-group">

### Среды запуска

- [Vitest](/ru/runtimes/vitest)
- [Bun](/ru/runtimes/bun)
- [Angular на Bun](/ru/runtimes/bun-angular)
- [node:test](/ru/runtimes/node)
- [Rstest](/ru/runtimes/rstest)
- [RxJS](/ru/runtimes/rxjs)

</div>

<div class="vas-map-group">

### Фреймворки

- [Angular](/ru/adapters/angular)
- [Angular HTTP](/ru/adapters/angular-http)
- [Роутер Angular](/ru/adapters/angular-router)
- [Сигнальные формы](/ru/adapters/signal-forms)
- [NestJS](/ru/adapters/nestjs)
- [React](/ru/adapters/react)
- [Vue / Pinia](/ru/adapters/vue)
- [Svelte](/ru/adapters/svelte)

</div>

<div class="vas-map-group">

### Переезд с

- [jest-auto-spies](/ru/migrating)
- [jasmine-auto-spies](/ru/migrating-jasmine)
- [@ngneat/spectator](/ru/migrating-spectator)
- [@testing-library/angular](/ru/migrating-testing-library-angular)
- [Suites](/ru/migrating-suites)

</div>

<div class="vas-map-group">

### Справочник

- [Полный API](/ru/api)
- [Паттерны, которые держатся](/ru/recipes)
- [Строгий режим](/ru/core/strict-mode)
- [ESLint-плагин](/ru/utilities/eslint-plugin)
- [Правила ESLint](/ru/utilities/eslint-rules)
- [Написано для AI-агентов](/ru/agents)

</div>

</div>

<div class="vas-facts">

<div class="vas-fact"><b>0</b><span>runtime-зависимостей</span></div>
<div class="vas-fact"><b>4</b><span>среды, одно ядро</span></div>
<div class="vas-fact"><b>5</b><span>адаптеров фреймворков</span></div>
<div class="vas-fact"><b>36</b><span>правил линтера</span></div>
<div class="vas-fact"><b>100%</b><span>покрытие ядра</span></div>

</div>

</div>

<div class="vas-section">

<p class="vas-eyebrow">05 / Уже что-то стоит</p>

## Если библиотека спаев в репозитории уже есть

<div class="vas-closer">

У `jest-auto-spies` и `jasmine-auto-spies` то же API — кодмод переписывает импорты и вызовы и
показывает диф прежде, чем что-то оставить. У Spectator, `@testing-library/angular` и Suites — своя
страница, где их хелперы разложены на эти построчно.

[Что другие делают иначе](/ru/comparison) · [Перевезти сюиту](/ru/migrating) ·
[Что нового в 4.0](/ru/upgrading-4)

</div>

</div>
