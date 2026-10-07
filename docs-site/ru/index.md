---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
title: vitest-auto-spy
description: Типизированные спаи для тестов, собранные из настоящего класса. Каждый метод становится спаем с хелперами под свой тип возврата, на Vitest, Bun, node:test и Rstest. Прямая замена jest-auto-spies и jasmine-auto-spies.

hero:
  name: 'vitest-auto-spy'
  text: 'Типизированный спай для каждого метода класса'
  tagline: 'Передайте класс и получите объект, где каждый метод - спай с типами из класса и хелперами под свой тип возврата. Один API на Vitest, Bun, node:test и Rstest.'
  actions:
    - theme: brand
      text: Начать
      link: /ru/core/introduction
    - theme: alt
      text: Сравнение с другими
      link: /ru/comparison
    - theme: alt
      text: Открыть на GitHub
      link: https://github.com/ASDAlexey/vitest-auto-spy

features:
  - title: Каждый метод - из настоящего класса
    details: 'createSpyFromClass читает класс, поэтому у объекта со спаями те же методы и сигнатуры. Переименуете метод - спека, которая его вызывает, перестанет компилироваться. Фабричный метод отвечает спаем другого класса через returnsClass, а innerDouble достаёт этот спай, не засчитывая вызов.'
    link: /ru/core/create-spy-from-class
  - title: Хелперы под тип возврата
    details: 'Методу, который возвращает Promise, достаются resolveWith и rejectWith. Методу с Observable - nextWith и throwWith. С calledWith метод может отвечать по-разному на разные аргументы.'
    link: /ru/core/control-helpers
  - title: Настройки по умолчанию рядом с классом
    details: 'Настройте класс один раз в setup-файле тестов через registerAutoSpyDefaults. Каждый спай этого класса начнёт с этих настроек, а спека добавит только то, что отличается.'
    link: /ru/core/create-spy-from-class
  - title: Четыре раннера, один API
    details: 'Одна и та же спека работает на Vitest от 2.1 до 5, Bun, node:test и Rstest. Меняется один импорт, а не тесты.'
    link: /ru/runtimes/vitest
  - title: Сделано для Angular
    details: 'provideAutoSpy и injectSpy для TestBed, поверхностный рендер, сигналы, ресурсы, роутер, HTTP и сигнальные формы. Работает и в zoneless-проектах, и с zone.js. createWindowSpies проверяет вызовы браузера без изменения настоящего окна.'
    link: /ru/adapters/angular
  - title: NestJS, React, Vue и Svelte
    details: 'У каждого фреймворка своя точка входа - provideAutoSpy для тестовых модулей NestJS и для global.provide во Vue, привычные импорты для React и Svelte.'
    link: /ru/adapters/nestjs
  - title: Строгий режим вместо undefined
    details: 'С strict true метод, который вы забыли настроить, бросает ошибку вместо undefined и называет класс, метод и аргументы.'
    link: /ru/core/strict-mode
  - title: Правила линтера и кодмод
    details: 'Плагин ESLint подсвечивает хрупкие приёмы в тестах прямо при наборе. Кодмод переводит тесты с jest-auto-spies на эту библиотеку и сначала показывает diff.'
    link: /ru/utilities/eslint-plugin
  - title: Утечку ловит тот тест, который её оставил
    details: 'setupAutoSpy ловит то, что один тест оставил следующему - глобальные значения, которые не вернули, забытые таймеры, вывод в консоль, настоящие сетевые запросы. Каждый отчёт называет тест, файл и способ исправить.'
    link: /ru/utilities/setup
  - title: Какой тест медленный и почему
    details: 'npx vitest-auto-spy perf находит медленные файлы тестов, перемеряет каждый отдельно и показывает, куда ушло время. С флагом --gate он валит CI на таких файлах.'
    link: /ru/utilities/cli#the-gate
---

<div class="vas-section">

<p class="vas-eyebrow">01 / Суть</p>

## Хватит синхронизировать мок руками

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
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

const users: Spy<UserService> = createSpyFromClass(UserService);

users.load.resolveWith(user);
users.save.rejectWith(new HttpError(409));
```

</div>

</div>

Каст больше не нужен. Из-за каста после переименования метода в `UserService` рукописный объект
всё ещё компилируется и тест всё ещё зелёный, но уже ничего не проверяет. `Spy<UserService>`
типизирован по классу, поэтому то же переименование делает спеку красной. Настоящий конструктор не
выполняется, так что зависимости самого сервиса мокать не нужно. Класса нет? `createAutoMock<T>()` строит те же спаи по типу или
интерфейсу.

[Начало работы](/ru/core/introduction) · [createSpyFromClass](/ru/core/create-spy-from-class) ·
[Управляющие хелперы](/ru/core/control-helpers)

</div>

<div class="vas-section">

<p class="vas-eyebrow">02 / Установка</p>

## Установка и импорт

```bash
npm i -D vitest-auto-spy
```

Импортируйте из точки входа под свой раннер тестов. Всё, что после этой строки, одинаково.

```ts
import { createSpyFromClass } from 'vitest-auto-spy'; // Vitest, без настройки
import { createSpyFromClass } from 'vitest-auto-spy/bun'; // bun:test
import { createSpyFromClass } from 'vitest-auto-spy/node'; // node:test
import { createSpyFromClass } from 'vitest-auto-spy/rstest'; // Rstest
```

Своих рантайм-зависимостей у пакета нет. `rxjs` и пакеты `@angular/*` нужны только своим точкам
входа. Спеки с `TestBed` в Angular импортируют `provideAutoSpy` и `injectSpy` из
`vitest-auto-spy/angular` (Angular 20 или новее); `createSpyFromClass` работает в любой спеке.
Подробнее — [Установка](/ru/core/installation).

</div>

<div class="vas-section">

<p class="vas-eyebrow">03 / Медленные тесты</p>

## Какой тест медленный и почему

Vitest печатает один `Duration` на весь прогон. `perf` показывает файлы тестов, которые правда
медленные, перемеряет каждый отдельно и показывает, куда ушло время процессора. Запускайте локально
или в CI:

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

Бюджет подстраивается под медианный тест того же прогона, поэтому быстрый ноутбук и медленная
машина CI выносят одинаковый вердикт. Файл, который тормозил только из-за соседей, а один идёт
быстро, помечается как _не воспроизвелось_, а не как ошибка. Профилировщик загружается только для перемера, так что обычный
прогон ничего не платит. Для Angular-спек карточка ещё делит время на настройку `TestBed`, создание
компонентов, обнаружение изменений и компиляцию. `--code-quality` пишет находки для виджета merge
request в GitLab.

[Порог](/ru/utilities/cli#the-gate) · [`perf` целиком](/ru/utilities/cli#perf-—-where-the-cpu-time-actually-goes) ·
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
- [Глоссарий](/ru/glossary)
- [Паттерны, которые держатся](/ru/recipes)
- [Строгий режим](/ru/core/strict-mode)
- [ESLint-плагин](/ru/utilities/eslint-plugin)
- [Правила ESLint](/ru/utilities/eslint-rules)
- [Для ИИ-агентов](/ru/agents)

</div>

</div>

<div class="vas-facts">

<div class="vas-fact"><b>0</b><span>runtime-зависимостей</span></div>
<div class="vas-fact"><b>4</b><span>среды, одно ядро</span></div>
<div class="vas-fact"><b>5</b><span>адаптеров фреймворков</span></div>
<div class="vas-fact"><b>58</b><span>правил линтера</span></div>
<div class="vas-fact"><b>100%</b><span>покрытие ядра</span></div>

</div>

</div>

<div class="vas-section">

<p class="vas-eyebrow">05 / Уже что-то стоит</p>

## Если библиотека спаев в репозитории уже есть

<div class="vas-closer">

У `jest-auto-spies` и `jasmine-auto-spies` тот же API. Кодмод переписывает импорты и вызовы и
показывает diff до того, как что-то сохранить. Для Spectator, `@testing-library/angular` и Suites
есть по странице, где их хелперы построчно сопоставлены с этими.

[Что другие делают иначе](/ru/comparison) · [Перевести тесты](/ru/migrating) ·
[Что нового в 4.0](/ru/upgrading-4)

</div>

</div>
