---
title: Сигнальные формы
description: createForm создаёт сигнальную форму Angular прямо в тесте, без ошибки инъекции NG0203; toHaveFieldErrors проверяет ошибки валидации поля одной строкой.
---

# Сигнальные формы

В `vitest-auto-spy/signal-forms` два хелпера для тестов сигнальных форм Angular (`form()` из
`@angular/forms/signals`). `createForm` создаёт форму прямо в тесте, чтобы проверить правила
валидации без рендера компонента. `toHaveFieldErrors` проверяет, какие ошибки валидации есть у поля.

```ts
import { email, minLength, required } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';
import { createForm } from 'vitest-auto-spy/signal-forms';

describe('sign-up form', () => {
  it('checks email and name', () => {
    const user = createForm({ email: '', name: 'A' }, (path) => {
      required(path.email);
      email(path.email);
      minLength(path.name, 2);
    });

    expect(user.email).toHaveFieldErrors('required');
    expect(user.name).toHaveFieldErrors('minLength');

    user.email().value.set('not-an-email');
    expect(user.email).toHaveFieldErrors('email');

    user.email().value.set('ada@example.test');
    expect(user.email).toHaveFieldErrors([]);
  });
});
```

В примере `user` — это форма. `user.email` — её поле `email`. Вызов поля даёт его **состояние**: у
`user.email()` есть `value`, `errors()`, `dirty()` и остальное. `user()` — состояние всей формы.

`createForm` использует инжектор `TestBed`, но вызывать `TestBed.configureTestingModule` не нужно.
С билдером `@angular/build:unit-test` другой настройки для `createForm` не нужно. С обычным `vitest.config.ts`
сначала поднимите тестовое окружение Angular, как показано в [Установке](/ru/core/installation).
Настраивать `TestBed` нужно, только если валидатор получает сервис через `inject()`.

## Подключить матчер {#set-up-the-matcher}

В setup-файле тестов нужны две строки. Строка `import` подключает типы, и в `expect` появляется
`toHaveFieldErrors`. Вызов `registerFormMatchers()` включает матчер во время прогона:

```ts
// src/test-setup.ts
import { registerFormMatchers } from 'vitest-auto-spy/signal-forms';

registerFormMatchers();
```

Укажите файл в `setupFiles`. С билдером Angular это цель `test` в `angular.json`:

```jsonc
// angular.json → projects.<app>.architect
"test": {
  "builder": "@angular/build:unit-test",
  "options": {
    "setupFiles": ["src/test-setup.ts"]
  }
}
```

В обычном конфиге Vitest пишите `test: { setupFiles: ['src/test-setup.ts'] }` в `vitest.config.ts`.

Спеки увидят новый метод `expect` только если TypeScript компилирует и setup-файл. Добавьте его в
`tsconfig.spec.json`:

```jsonc
// tsconfig.spec.json
"include": ["src/**/*.spec.ts", "src/**/*.d.ts", "src/test-setup.ts"]
```

**Что нужно:** Angular 22 или новее и установленный `@angular/forms` (это необязательная
peer-зависимость, она нужна только `vitest-auto-spy/signal-forms`).

| Импорт                    | Что даёт                                                     |
| ------------------------- | ------------------------------------------------------------ |
| `createForm`              | настоящую сигнальную форму, созданную в инжекторе `TestBed`  |
| `registerFormMatchers`    | добавляет в Vitest `expect(field).toHaveFieldErrors(…)`      |
| `CreateFormOptions` (тип) | объект опций `createForm`                                    |
| `FieldErrorMatch` (тип)   | одна ожидаемая ошибка: `'required'` или `{ kind, message? }` |

## Виды ошибок у валидаторов Angular {#error-kinds-of-angular-s-validators}

`toHaveFieldErrors` сравнивает ошибки по `kind`. Встроенные валидаторы из `@angular/forms/signals`
дают такие виды:

| Валидатор            | Вид (`kind`)  | На пустом значении |
| -------------------- | ------------- | ------------------ |
| `required(path)`     | `'required'`  | даёт ошибку        |
| `email(path)`        | `'email'`     | молчит             |
| `minLength(path, n)` | `'minLength'` | молчит             |

Поэтому у пустого email с `required` и `email` одна ошибка — `required`.

## Инъекционный контекст — `createForm` {#the-injection-context-—-createform}

`createForm` создаёт сигнальную форму в инжекторе `TestBed`. Нужен, чтобы тестировать правила
валидации формы без рендера компонента.

Зачем он: `form()` вызывает `inject()`. Если вызвать `form()` прямо в тесте или в `beforeEach`, он
бросает ошибку, в которой нет ни слова про формы:

```
NG0203: The `Injector` token injection failed. `inject()` function must be called from an injection context…
```

`createForm` сам передаёт в `form()` инжектор `TestBed`.

```ts
import { signal } from '@angular/core';
import { required } from '@angular/forms/signals';
import { expect, it } from 'vitest';
import { createForm } from 'vitest-auto-spy/signal-forms';

it('writes the typed value into the model', () => {
  const model = signal({ email: '' });
  const user = createForm(model, (path) => required(path.email));

  user.email().value.set('ada@example.test');

  expect(model().email).toBe('ada@example.test');
});
```

| Вызов                                         | Что делает                                               |
| --------------------------------------------- | -------------------------------------------------------- |
| `createForm(model, schema?, options?)`        | `form()` в инжекторе `TestBed`; `model` — это `signal()` |
| `createForm(initialValue, schema?, options?)` | то же самое, но сигнал модели `createForm` создаёт сам   |

| Опция      | Тип        | По умолчанию               | Смысл                                 |
| ---------- | ---------- | -------------------------- | ------------------------------------- |
| `injector` | `Injector` | `TestBed.inject(Injector)` | инжектор, в котором работает `form()` |

Возвращается обычный `FieldTree` из Angular, без обёрток. Состояния, валидаторы, схема и запись в
модель работают так же, как в приложении.

- **Передайте `signal()`, если хотите проверять модель.** Форма записывает в этот сигнал каждое
  изменение. Если передать простое значение, `createForm` сам создаст сигнал. В обоих случаях
  `user().value()` возвращает всю модель.
- **Валидатор, который вызывает `inject()`,** берёт сервисы из инжектора `TestBed`. Достаточно
  провайдеров в `TestBed.configureTestingModule`.
- **Передайте `options.injector`, если сервис объявлен в `providers` самого компонента.** Создайте
  компонент через `TestBed.createComponent` и передайте `{ injector: fixture.debugElement.injector }`.

**Частая ошибка:** передать моделью `computed()`, `input()` или другой сигнал только для чтения.
Форма пишет в свою модель, поэтому `createForm` бросает:
`[vitest-auto-spy] createForm(): the model is a computed(), which cannot be written, and a form writes back into its model.`
Передайте `signal(initialValue)` или само начальное значение.

## Ошибки — `toHaveFieldErrors` {#the-errors-—-tohavefielderrors}

`toHaveFieldErrors` проверяет, что у поля ровно те ошибки, которые вы перечислили: не больше и не
меньше. Сравнивает по `kind`, а если вы указали `message`, то и по нему. Зарегистрируйте матчер один раз через `registerFormMatchers()` (setup-файл
выше).

```ts
expect(user.email).toHaveFieldErrors(['required']); // ровно эти kind
expect(user.email).toHaveFieldErrors('required'); // один kind можно без массива
expect(user.email).toHaveFieldErrors([{ kind: 'minLength', message: 'Too short' }]); // kind и текст
expect(user.email).toHaveFieldErrors([]); // ошибок нет совсем
```

Как сравнивает:

- **Весь список, в любом порядке.** Если у поля две ошибки, а вы назвали одну, проверка падает.
  В сообщении видны обе стороны, например
  `expected field 'email' to have required, got email`.
- **Текст ошибки — только если вы его указали.** `'required'` совпадает и после правки текста
  ошибки. Пишите `{ kind, message }`, когда важна формулировка.
- **Поле или его состояние.** `expect(user.email)` и `expect(user.email())` — одна и та же проверка.
  На любое другое значение матчер бросает ошибку:
  `[vitest-auto-spy] toHaveFieldErrors: expected a field of a signal form — form.email or form.email() — received …`,
  а не проходит молча.

Почему не `toEqual`: `errors()` возвращает объекты вроде `RequiredValidationError`, а не простые
`{ kind, message }`. У каждого ещё есть свойство `fieldTree` со ссылкой на своё поле. Поэтому обычный
`toEqual` падает на свойстве, которого вы не писали:

```ts
expect(user.email().errors()).toEqual([{ kind: 'required' }]); // падает: `fieldTree` нет в ожидаемом объекте
```

**Частая ошибка:** проверять одну ошибку через
`errors().some((error) => error.kind === 'required')`. Такая проверка проходит, даже если у поля ещё
три ошибки, которых вы не ждали. Пишите `toHaveFieldErrors(['required'])`: он падает на лишних
ошибках.

Для полей формы достаточно `registerFormMatchers()`. Матчеры для обычных сигналов добавляет другой
вызов, [`registerSignalMatchers()`](./angular#asserting-a-signal); он нужен, только если вы проверяете
и обычные сигналы.

## Форма, которой владеет компонент {#a-form-the-component-owns}

Если форму создаёт сам компонент, тестируйте её через компонент. `createForm` здесь не нужен:
компонент уже создал форму в своём инъекционном контексте. Матчер работает и с полями компонента.

```ts
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { stable } from 'vitest-auto-spy/angular';

import { ReviewFormComponent } from './review-form.component';

it('accepts a tag', async () => {
  const fixture = TestBed.createComponent(ReviewFormComponent);

  fixture.componentInstance.form.tags().value.set(['angular']);

  await stable(fixture);

  expect(fixture.componentInstance.form.tags).toHaveFieldErrors([]);
  expect(fixture.componentInstance.form.tags().dirty()).toBe(true);
});
```

Если форма зависит от инпутов компонента, меняйте их через
[`setInputs`](./angular#changing-an-input-mid-test).

## Кастомные контролы {#custom-controls}

Кастомный контрол реализует `FormValueControl<T>` или `FormCheckboxControl`. Это обычный компонент:
`value = model<T>()` плюс инпуты состояния, которые он читает. Особый хелпер не нужен: отрендерите
контрол через `renderShallow` и меняйте инпуты через `setInputs`:

```ts
import { expect, it } from 'vitest';
import { renderShallow, setInputs } from 'vitest-auto-spy/angular';

import { PublishCheckboxComponent } from './publish-checkbox.component';

it('takes a value', async () => {
  const fixture = renderShallow(PublishCheckboxComponent, { inputs: { label: 'Published' } });

  await setInputs(fixture, { value: true });

  expect(fixture.componentInstance.value()).toBe(true);
});
```

## Подробнее {#in-depth}

**Почему схему тестируют без рендера.** Официальный гайд Angular по тестированию считает
изолированный тест схемы основным способом тестировать форму: большинству форм рендер не нужен. Без
`createForm` пришлось бы самому передавать в `form()` `{ injector: TestBed.inject(Injector) }` или
оборачивать вызов в `TestBed.runInInjectionContext`.

**Почему `registerFormMatchers()` — отдельный вызов.** Его типам нужен `@angular/forms`, а
`registerSignalMatchers()` должен работать и в проектах без него.

**Почему `computed()` не принимается.** В производный сигнал нельзя записать значение. Без этой
проверки `createForm` принял бы его за простое значение, и каждая запись из формы молча терялась бы.

**Почему нет подмены для `FieldTree`.** Подмена (объект, который стоит вместо настоящей формы)
помогла бы только компоненту, который получает форму инпутом. В проектах на Angular, на которых
проверяется этот пакет, так не делает ни один компонент: форму создаёт тот компонент, который ей
владеет, а контролы принимают модель `value`. Если в вашем проекте формы передаются инпутами,
заведите issue.
