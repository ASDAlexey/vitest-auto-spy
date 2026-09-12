---
title: Сигнальные формы
description: createForm и toHaveFieldErrors — сигнальные формы Angular в спеке, мимо инъекционного контекста, из-за которого form() бросает NG0203, и мимо ручного разбора errors().
---

# Сигнальные формы

Сигнальные формы стабильны с Angular 22, и спека, которая их трогает, каждый раз встречает одно и
то же: сообщение про `inject()`, в котором нет ни слова про формы, и массив `errors()`, который
сравнивается не так, как выглядит. Этот энтрипойнт — про эти две вещи и больше ни про что.

```ts
import { minLength, required } from '@angular/forms/signals';
import { createForm, registerFormMatchers } from 'vitest-auto-spy/signal-forms';

registerFormMatchers(); // один раз, в setup-файле

const user = createForm({ email: '', name: '' }, (path) => {
  required(path.email, { message: 'Email is required' });
  minLength(path.name, 2);
});

expect(user.email).toHaveFieldErrors([{ kind: 'required', message: 'Email is required' }]);

user.email().value.set('ada@example.test');

expect(user.email).toHaveFieldErrors([]);
```

::: info `@angular/forms` — необязательный peer, и это единственный энтрипойнт, который до него дотягивается
Как `@angular/router` за [`/angular-router`](./angular-router) и `@angular/common` за
[`/angular-http`](./angular-http), forms-peer оплачивают те сюиты, которые импортируют этот
энтрипойнт. `vitest-auto-spy/angular` продолжает загружаться в проекте, где его никогда не ставили.
Сигнальным формам нужен Angular 22 и новее; собственный пол пакета остаётся на 20.
:::

## Инъекционный контекст — `createForm` {#the-injection-context-—-createform}

`form()` инжектит, поэтому вызов в `beforeEach` бросает:

```
NG0203: The `Injector` token injection failed. `inject()` function must be called from an injection context…
```

В этом сообщении нет слова «форма», а ремонт — либо объект опций
(`{ injector: TestBed.inject(Injector) }`), либо `TestBed.runInInjectionContext` вокруг вызова.
Официальный гайд по тестированию считает изолированный тест схемы основным способом тестировать
форму — большинству форм рендер вообще не нужен, — так что это шаг между читателем и рекомендованным
паттерном. `createForm` — этот шаг, уже сделанный.

| Вызов                                         | Что делает                                                            |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `createForm(model, schema?, options?)`        | `form()` в инъекционном контексте `TestBed`; `model` — это `signal()` |
| `createForm(initialValue, schema?, options?)` | то же самое, но сигнал модели создаётся за вас                        |
| `registerFormMatchers()`                      | добавляет раннеру `expect(field).toHaveFieldErrors(…)`                |

Возвращается собственный `FieldTree` Angular, ничем не обёрнутый и не проксированный: состояния,
валидаторы, схема и запись сквозь модель — фреймворковые.

Три вещи, которые стоит знать:

- **Модель — источник правды в обе стороны.** `form()` пишет в переданный сигнал, поэтому спека,
  которая отдала свой `signal()`, может проверять его напрямую; отдайте простое значение — сигнал
  сделается здесь, потому что `user().value()` всё равно читает его обратно.
- **`computed()` отвергается по имени.** Форма пишет в свою модель, а производный сигнал записи не
  принимает — без этой проверки он был бы завёрнут как значение, и каждая запись молча пропадала бы.
- **`options.injector` — для валидатора, который инжектит.** Схема — это функция, поэтому
  `inject(SomeService)` внутри неё резолвится тем инжектором, который собрал форму. Передавайте
  `fixture.debugElement.injector`, когда сервис лежит в собственных `providers` компонента.

## Ошибки — `toHaveFieldErrors` {#the-errors-—-tohavefielderrors}

`field().errors()` отвечает экземплярами вроде `RequiredValidationError`, а не объектами
`{ kind, message }`, и каждый несёт обратную ссылку `fieldTree` на своё поле. Поэтому проверка,
которая выглядит правильной, падает на свойстве, которого никто не писал:

```ts
expect(user.email().errors()).toEqual([{ kind: 'required' }]); // падает: `fieldTree` нет в ожидаемом объекте
```

Вместо этого в сюитах пишут `errors().some((error) => error.kind === 'required')` — и оно так же
радостно проходит, когда у поля есть ещё три ошибки, которых никто не ждал: заработавший валидатор
для такой проверки невидим.

```ts
expect(user.email).toHaveFieldErrors(['required']); // весь набор, по kind
expect(user.email).toHaveFieldErrors('required'); // одному kind массив не нужен
expect(user.email).toHaveFieldErrors([{ kind: 'minLength', message: 'Too short' }]); // и его сообщение
expect(user.email).toHaveFieldErrors([]); // вообще ничего
```

- **Сравнивается весь набор, порядок не важен.** Две ошибки там, где спека назвала одну, — это
  падение, и в сообщении печатаются обе стороны по `kind`.
- **Сообщение сравнивается только там, где спека его назвала**, поэтому `'required'` продолжает
  совпадать после правки текста, а спека, которой важна формулировка, говорит об этом явно.
- **Читаются и дерево поля, и его состояние.** `expect(user.email)` и `expect(user.email())` — одна
  и та же проверка; всё остальное падает с тем, что получило, а не проходит на `undefined`.
- **Регистрируется один раз**, в setup-файле, рядом с
  [`registerSignalMatchers()`](./angular#asserting-a-signal). Это два разных вызова, потому что типы
  этого дотягиваются до `@angular/forms`, а типы того не должны.

## Форма, которой владеет компонент {#a-form-the-component-owns}

Вторая половина настоящей сюиты: форму строит сам компонент, поэтому спека ведёт её через компонент,
а не создаёт свою.

```ts
const fixture = TestBed.createComponent(ReviewFormComponent);

fixture.componentInstance.form.tags().value.set([tag]);

await stable(fixture);

expect(fixture.componentInstance.form.tags).toHaveFieldErrors([]);
expect(fixture.componentInstance.form.tags().dirty()).toBe(true);
```

`createForm` тут добавить нечего — компонент уже собрал форму в своём инъекционном контексте, — а вот
матчер добавляет, как и [`setInputs`](./angular#changing-an-input-mid-test) для инпутов, на которые
форма реагирует.

## Кастомные контролы {#custom-controls}

Компонент, реализующий `FormValueControl<T>` или `FormCheckboxControl`, — обычный компонент:
контракт — это `value = model<T>()` плюс те стейт-инпуты, которые он читает. Дубль тут не нужен и не
поставляется — это `renderShallow` и `setInputs`:

```ts
const fixture = renderShallow(PublishCheckboxComponent, { inputs: { label: 'Published' } });

await setInputs(fixture, { value: true });

expect(fixture.componentInstance.value()).toBe(true);
```

::: info Дубля `FieldTree` здесь нет, и это сознательно
Дубль стоял бы вместо формы, которую компонент принимает инпутом, — а в сюитах, по которым этот
пакет обмеряется, такого не делает ни один компонент: формы строит тот, кто ими владеет, а контролы
принимают модель `value`. Дубль для формы, которую никто не пишет, — это форма, которую никто не
тестирует. Если у вас иначе — это в трекер: пакет поставляет обмеренные формы.
:::
