---
title: Диагностика в редакторе — WebStorm и VS Code
description: Правила линтера vitest-auto-spy подчёркивают ошибки прямо во время написания спеки - в WebStorm и других IDE от JetBrains и через расширение ESLint в VS Code, Cursor и Windsurf.
---

# Диагностика в редакторе

Правила линтера из библиотеки могут подчёркивать ошибки в редакторе, пока вы пишете, а не в CI час
спустя. Они ловят конструкции, которые **проходят**, но ничего не проверяют: `expect()` внутри
`subscribe()`, колбэк `done`, который Vitest никогда не вызовет, спай с типом класса.

Отдельный плагин для редактора не нужен. Правила входят в пакет как
[`vitest-auto-spy/eslint-plugin`](/ru/utilities/eslint-plugin), а каждый редактор ниже уже умеет
запускать ESLint. Одни и те же правила работают в редакторе и в CI, поэтому то, что прошло
локально, не упадёт на сборке.

Настройка один раз:

```bash
npm i -D vitest-auto-spy eslint typescript-eslint
```

```js
// eslint.config.js — flat config, в корне репозитория
import tseslint from 'typescript-eslint';
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [
  ...tseslint.configs.recommended,
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
    ...autoSpy.configs.recommended,
  },
];
```

`typescript-eslint` нужен, чтобы ESLint читал файлы `.ts`. Если конфиг ESLint у вас уже есть,
добавьте только блок для файлов спек, после остальных блоков. `autoSpy.configs.recommended` — один
объект с `plugins` и `rules`, без `files`, поэтому где работают правила, решает список `files`
рядом с ним. Другие варианты —
[ESLint-плагин](/ru/utilities/eslint-plugin).

Затем включите ESLint в своём редакторе, как описано ниже.

## WebStorm и другие IDE от JetBrains {#webstorm-and-the-other-jetbrains-ides}

WebStorm, IntelliJ IDEA Ultimate, PhpStorm, PyCharm Professional и RubyMine запускают ESLint сами.
Поэтому правила видны прямо в коде, в окне Problems и в **Code → Inspect Code**, без установки
плагина.

В **Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint** выберите
**Automatic ESLint configuration**. WebStorm сам найдёт `eslint.config.js` и локальный `eslint`.
**Manual** нужен, только если конфиг лежит вне корня проекта; тогда задайте _ESLint package_
(`node_modules/eslint`) и _Configuration file_.

Три вещи, которые выглядят как «правила не работают»:

- **Используйте flat config (`eslint.config.js`).** Старая форма `.eslintrc` с
  `plugins: ['vitest-auto-spy']` ищет пакет с именем `eslint-plugin-*`, а этот плагин — подпуть
  пакета `vitest-auto-spy`. WebStorm поддерживает flat config с 2023.3; на более старой версии
  обновите IDE.
- **Ограничьте блок файлами спек**, как в списке `files` выше. `Object.defineProperty` или объект из
  `vi.fn()` в коде приложения — это нормально; все правила здесь про тестовый код.
- **Быстрые исправления идут от ESLint.** `⌥⏎` на подсвеченной строке предлагает
  _ESLint: Fix current file_ и, если у правила есть подсказка, это конкретное исправление. Правила с
  безопасной заменой исправляют сами; остальные только предлагают, потому что замена меняет
  поведение и её нужно прочитать.

Во время миграции **Code → Inspect Code…** с областью «тестовые исходники» показывает все находки,
сгруппированные по правилам.

::: tip Отдельного плагина для JetBrains нет
Плагин в Marketplace повторял бы то, что IDE и так делает через ESLint, и требовал бы второй копии
каждого правила. Если в репозитории вообще нет ESLint, добавьте `eslint.config.js`, показанный выше.
:::

## VS Code, Cursor, Windsurf, VSCodium {#vs-code-cursor-windsurf-vscodium}

Установите [расширение ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint).
С конфигом выше правила видны прямо в коде и в панели Problems.

```jsonc
// .vscode/settings.json
{
  // При сохранении применяются правила, которые исправляют сами ("explicit" — при сохранении
  // вручную, не при автосохранении). Остальные предлагают замену по ⌘. как подсказку.
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },

  // Нужна только на ESLint 8; на ESLint 9 и новее flat config и так по умолчанию, строка не мешает.
  "eslint.useFlatConfig": true,
}
```

Cursor, Windsurf и VSCodium ставят то же расширение ESLint из Open VSX и читают тот же
`.vscode/settings.json`.

## Что именно подчёркивается {#what-gets-underlined}

| Форма                                                        | Почему это ошибка                                                                                                                                | Правило                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `expect()` внутри `subscribe()`                              | молчащий поток не вызывает колбэк, и тест проходит, ничего не проверив                                                                           | `no-expect-in-subscribe`          |
| `it('x', (done) => …)` и `done.fail(…)`                      | Vitest передаёт `TestContext`, а не `done`; тест проходит, почти не выполнив тело                                                                | `no-done-callback`                |
| цепочка `.then()` с проверкой, которую никто не ждёт         | проверка выполняется после конца теста, где ничего не падает                                                                                     | `no-floating-assertion`           |
| `{ provide: X, useValue: { m: vi.fn() } }`                   | `provideAutoSpy(X)` сам подхватывает новый метод класса                                                                                          | `prefer-provide-auto-spy`         |
| объект из `vi.fn()` вместо класса                            | `createSpyFromClass(X)` читает класс, а не список, который устаревает                                                                            | `prefer-create-spy-from-class`    |
| `TestBed.inject<X>()` или приведение типа после него         | `injectSpy(X)` возвращает `Spy<X>` без дженерика и приведения                                                                                    | `prefer-inject-spy`               |
| `vi.mocked()` поверх того, что уже спай                      | `Mocked<T>` теряет `calledWith`, `resolveWith` и `nextWith`; исправляется автоматически                                                          | `no-mocked-for-spy`               |
| `TestBed.inject(X) as Spy<X>`                                | с этой библиотекой такое приведение не компилируется; `asSpy(…)` говорит то же без приведения и исправляется автоматически                       | `prefer-as-spy`                   |
| `Object.defineProperty` в спеке                              | никто не записывает откат; `mockReadonlyProp` / `mockValueProp` записывают                                                                       | `no-object-define-property`       |
| экспортированный объект из `vi.fn()` на уровне модуля        | при `isolate: false` все файлы спек делят один набор спаев                                                                                       | `no-shared-module-level-mock`     |
| один и тот же токен дважды в одном массиве провайдеров       | второй провайдер молча заменяет первый                                                                                                           | `no-overridden-provider`          |
| `TestBed.inject()` раньше `override*` в том же наборе тестов | inject создаёт модуль, и каждый следующий override бросает ошибку                                                                                | `no-inject-before-override`       |
| `spyOn(o, 'm')`, `jasmine.*`, `fail(`, `.withContext(`       | `spyOn` из Jasmine подменяет метод, а `vi.spyOn` вызывает настоящий, так что переименование молча меняет поведение; остальное — `ReferenceError` | `no-jasmine-globals`              |
| `.and` / `.calls` / `.withArgs`, которые никто не установил  | они берутся из `vitest-auto-spy/jasmine`; без него строка читает `undefined`                                                                     | `jasmine-namespace-without-entry` |
| `spy.calls.saveArgumentsByValue()`                           | здесь ничего не делает, и спека начинает проверять состояние после изменения                                                                     | `no-save-arguments-by-value`      |

Последние три — для набора тестов, который [переезжает с `jasmine-auto-spies`](/ru/migrating-jasmine).

**Частая ошибка при такой миграции:** держать `prefer-native-spy-api` (правило, которое заменяет
вызовы в стиле Jasmine на родные вызовы Vitest) включённым с первого дня. Поначалу оно подчёркивает
каждую строку переходного кода. Выключите его
(`'off'`) на время и включите для последнего шага: миграция закончена, когда оно молчит.

Каждое сообщение называет найденное и одно исправление, а в конце даёт `Docs:` и ссылку на раздел
правила в [Правилах ESLint](/ru/utilities/eslint-rules). Полные описания и уровни — в
[ESLint-плагине](/ru/utilities/eslint-plugin).

Ошибки, которых ESLint не видит, сообщаются при запуске теста: импорт не той точки входа для вашего
раннера или вызов `nextWith` без `import 'vitest-auto-spy/rxjs'`. Оба бросают ошибку с сообщением,
где названо исправление и дана ссылка на страницу; см.
[Ошибки, которые сами называют исправление](/ru/agents#errors-that-name-their-own-fix).
