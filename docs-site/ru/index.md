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
    details: 'Метод, возвращающий Promise, получает resolveWith и rejectWith, возвращающий Observable — nextWith и throwWith, а каждый метод получает calledWith, mustBeCalledWith и failWith.'
    link: /ru/core/control-helpers
  - title: Настройки спая живут рядом с классом
    details: 'registerAutoSpyDefaults(Router, config) один раз в setup-файле — и каждый provideAutoSpy или createSpyFromClass стартует с них, сливая с тем, что добавил вызов, а не заменяя. В одной Angular-сюите один и тот же класс собрал 23 разные конфигурации в 109 файлах спек; десяток классов заезжает одной таблицей, и каждая строка проверяется по своему классу.'
    link: /ru/core/create-spy-from-class
  - title: Vitest 5 тем же пакетом
    details: 'Один пакет покрывает Vitest с 2.1 по 5.x — без второго мажора, без раздвоенных типов, без единой правки в спеке. Та же сюита идёт на 7.7 % быстрее на Vitest 5, а встроенный движок спаев даёт ещё 8.1 % поверх vi.fn().'
    link: /ru/runtimes/vitest#vitest-5
  - title: Одно ядро, четыре среды запуска
    details: 'vi.fn() и его аналоги сидят за адаптером, который каждая входная точка регистрирует при импорте, поэтому один и тот же файл спеки идёт на Vitest, bun:test, node:test и Rstest.'
    link: /ru/runtimes/vitest
  - title: Angular, NestJS, React, Vue, Svelte
    details: 'У каждого фреймворка своя входная точка — провайдеры DI, поверхностный TestBed без дочернего поддерева, сигналы и ресурсы, которыми спека управляет руками.'
    link: /ru/adapters/angular
  - title: Строгий режим вместо undefined
    details: 'Метод, который никто не настроил, бросает с именем класса, метода и аргументами в сообщении, а не возвращает undefined, падающий тремя кадрами позже.'
    link: /ru/core/strict-mode
  - title: Двадцать пять правил линтера и кодмод
    details: 'ESLint-плагин подчёркивает старые паттерны прямо в редакторе — приватный член через каст, глобал наблюдателя, заглушённый руками, класс-заглушка из полей vi.fn(), подключённый через useClass, schemas, которые не могут сработать, — а кодмод из CLI переписывает сюиту на jest-auto-spies в диф, который можно прочитать до того, как оставить.'
    link: /ru/utilities/eslint-plugin
  - title: Провалы, о которых больше никто не сообщает
    details: 'Патч mock*Prop, оставленный в теле describe, перестаёт применяться после первого теста, компонент, чьи собственные providers перекрывают спай, молча работает с настоящим сервисом, а один ключ, оставленный на Object.prototype, не даёт собраться ни одному следующему файлу воркера, пока Vitest 5.0 печатает ноль упавших тестов и ни одного стека — под любым раннером это тишина, здесь названо свойством, токеном или файлом.'
    link: /ru/utilities/setup
---

<div class="vas-section">

<p class="vas-eyebrow">01 / Установка</p>

## Шестьдесят секунд до первого спая

Ноль runtime-зависимостей; `rxjs` и `@angular/core` опциональны и нужны только для своей входной
точки.

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

<p class="vas-eyebrow">03 / Куда дальше</p>

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
<div class="vas-fact"><b>25</b><span>правил линтера</span></div>
<div class="vas-fact"><b>100%</b><span>покрытие ядра</span></div>

</div>

</div>

<div class="vas-section">

<p class="vas-eyebrow">04 / Уже что-то стоит</p>

## Если библиотека спаев в репозитории уже есть

<div class="vas-closer">

У `jest-auto-spies` и `jasmine-auto-spies` то же API — кодмод переписывает импорты и вызовы и
показывает диф прежде, чем что-то оставить. У Spectator, `@testing-library/angular` и Suites — своя
страница, где их хелперы разложены на эти построчно.

[Что другие делают иначе](/ru/comparison) · [Перевезти сюиту](/ru/migrating) ·
[Что нового в 4.0](/ru/upgrading-4)

</div>

</div>
