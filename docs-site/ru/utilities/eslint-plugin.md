---
title: ESLint-плагин
description: Пятьдесят шесть правил линтера для спек-файлов. Они ловят тесты, которые проходят, ничего не проверяя, подмены, которые отстают от настоящего класса, и настройку, которая утекает между тестами. Flat config, входит в пакет.
---

# ESLint-плагин

Плагин находит тестовый код, который проходит, ничего не проверяя, и рукописные подмены, которые
отстают от заменяемого класса. Он входит в `vitest-auto-spy`, так что ставить больше ничего не нужно.
Добавьте его в `eslint.config.js` для своих спек-файлов:

```js
// eslint.config.js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [{ files: ['**/*.spec.ts'], ...autoSpy.configs.recommended }];
```

Плагину нужен flat config (`eslint.config.js`). Старый формат `.eslintrc` загрузить его не может: он
ищет пакет с именем `eslint-plugin-*`, а этот плагин — subpath другого пакета.

У каждого правила есть свой раздел в [Правилах ESLint](/ru/utilities/eslint-rules): о чём оно сообщает,
пример «до и после», опции и когда его выключить. Эта страница — про подключение и настройку.

## Как подключить его к проекту {#adding-it-to-your-project}

### 1. Блок конфигурации {#_1-the-config-block}

Раскройте (оператор `...`, spread) один из готовых конфигов в блоке для спек-файлов. Во flat config более поздний блок
перекрывает более ранний, поэтому ставьте этот блок **после** остальных конфигов:

```js
// eslint.config.js
import tseslint from 'typescript-eslint';
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [
  ...tseslint.configs.recommended,
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    ...autoSpy.configs.recommended,
  },
];
```

Каждый конфиг — обычный объект с двумя ключами, `plugins` и `rules`. Когда вы раскрываете его в
свой блок, приходят оба ключа.

| Конфиг                | Что включает                                     | Когда брать                                                                                                   |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `configs.recommended` | все 56 правил: 45 на `error`, 11 на `warn`       | вы начинаете работать с плагином; это вариант по умолчанию                                                    |
| `configs.strict`      | все 56 правил на `error`                         | ваши спеки чисты, и любая находка должна останавливать сборку                                                 |
| `configs.typeErrors`  | `prefer-as-spy` и `no-mocked-for-spy` на `error` | вместе с `recommended`, в [рецепте для большого проекта](#land-it-on-a-large-existing-suite-without-a-red-ci) |

Оба правила из `typeErrors` уже стоят на `error` в `recommended`. `typeErrors` нужен только в рецепте,
который понижает все правила до `warn`, а эти два возвращает обратно; см. раздел
[Как внедрить на большом существующем наборе тестов без красного CI](#land-it-on-a-large-existing-suite-without-a-red-ci).

Некоторые правила ни о чём не сообщают, пока не узнают, как ваш проект собирается и запускает тесты:

- [`no-compile-components`](/ru/utilities/eslint-rules#no-compile-components) ждёт опцию `builder`.
- [`no-redundant-mock-reset`](/ru/utilities/eslint-rules#no-redundant-mock-reset) ждёт свои опции
  или конфиг Vitest, который сможет найти и прочитать.
- [`no-relative-mock-under-builder`](/ru/utilities/eslint-rules#no-relative-mock-under-builder) ждёт
  свою опцию или таргет unit-test-билдера Angular в `angular.json`, `project.json` или `nx.json`,
  который запускает файл.

### 2. Глоб `files` не опционален {#_2-the-files-glob-is-not-optional}

Глоба по умолчанию у плагина нет: где лежат ваши спеки, знаете только вы. Неверный глоб ломается
одним из двух способов:

- **Слишком узкий:** плагин ничего не проверяет и ни о чём не сообщает. Это самая частая проблема
  настройки. [Проверьте, что применяется на самом деле](#check-what-actually-applies), одной командой.
- **Слишком широкий:** правила начинают срабатывать на прикладном коде. Например, `Object.defineProperty`
  в прикладном коде уместен, а `no-object-define-property` о нём сообщит.

Типичные глобы:

```js
files: ['**/*.spec.ts'],                                  // Angular
files: ['**/*.test.ts', '**/*.test.tsx'],                 // React / Vue / Node
files: ['**/*.{spec,test}.{ts,tsx}', '**/test/**/*.ts'],  // и то и другое плюс папка с тестами
```

В монорепозитории один блок в корне покрывает все пакеты, если глоб начинается с `**/`:
`'**/*.spec.ts'` совпадает и с `packages/*/src/**`. Второй блок добавляйте только для пакета, чьим
спекам нужны другие уровни серьёзности.

### 3. Информация о типах нужна только четырём правилам {#_3-type-information-is-optional-and-one-rule-wants-it}

Пятьдесят два правила читают только сам файл. Они работают без `parserOptions.project`, заметно не
замедляют линт и работают, даже если ваших спек нет ни в одном `tsconfig`.

Четыре правила читают типы TypeScript:
[`no-private-member-access`](/ru/utilities/eslint-rules#no-private-member-access),
[`no-mistyped-use-value`](/ru/utilities/eslint-rules#no-mistyped-use-value),
[`no-unknown-use-value-key`](/ru/utilities/eslint-rules#no-unknown-use-value-key) и
[`prefer-to-have-signal-value`](/ru/utilities/eslint-rules#prefer-to-have-signal-value). Без информации о
типах они ни о чём не сообщают. Единственное исключение — проверка `Object.getPrototypeOf` в
`no-private-member-access`: она работает в любом случае.

Чтобы включить эти четыре, передайте парсеру проект, где ваши спеки уже входят в `tsconfig`:

```js
languageOptions: {
  parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
},
```

### 4. Как выглядит первый прогон {#_4-what-the-first-run-looks-like}

На существующем проекте первый прогон, скорее всего, будет красным. Сорок пять правил стоят на
`error`, и так задумано.

Одиннадцать правил стоят на `warn`. Они попадают в вывод, но не валят сборку:

- **Цена, а не дефект:** [`prefer-render-shallow`](/ru/utilities/eslint-rules#prefer-render-shallow).
- **Правило судит по догадке из одного файла:**
  [`no-stub-class-double`](/ru/utilities/eslint-rules#no-stub-class-double),
  [`no-structural-double`](/ru/utilities/eslint-rules#no-structural-double),
  [`no-instance-lifecycle-spy`](/ru/utilities/eslint-rules#no-instance-lifecycle-spy).
- **Исправление — миграция, а не замена одной строки:**
  [`prefer-create-mock`](/ru/utilities/eslint-rules#prefer-create-mock),
  [`prefer-set-inputs`](/ru/utilities/eslint-rules#prefer-set-inputs),
  [`no-unasserted-argument`](/ru/utilities/eslint-rules#no-unasserted-argument),
  [`no-real-wait-in-test`](/ru/utilities/eslint-rules#no-real-wait-in-test).
- **Более короткое или понятное написание корректного кода:**
  [`prefer-spy-on-own-method`](/ru/utilities/eslint-rules#prefer-spy-on-own-method),
  [`prefer-to-have-signal-value`](/ru/utilities/eslint-rules#prefer-to-have-signal-value).
- **Как исправить, знает только автор:**
  [`no-unasserted-console-spy`](/ru/utilities/eslint-rules#no-unasserted-console-spy).

Правило, которое читает один файл, не может знать о проекте всё, поэтому три правила могут сработать
на корректном коде. Если находка выглядит неверной, загляните в раздел
[Три правила, которые могут сработать на корректном коде](#the-three-rules-that-can-report-on-correct-code).

Первый заход укорачивают две команды:

```bash
npx eslint . --fix                         # правила с автоисправлением сами переписывают код
npx eslint . --format stylish | tail -30   # в сводке видно, какое правило срабатывает чаще всего
```

Всё, что осталось, — либо настоящая находка, либо правило, которое вам пока не нужно. Про оба случая —
раздел [Настройка под ваш проект](#tuning-it-for-your-project). Если первый прогон слишком большой,
чтобы исправить всё сразу, следуйте разделу
[Как внедрить на большом существующем наборе тестов без красного CI](#land-it-on-a-large-existing-suite-without-a-red-ci).

## Какие правила касаются вас {#which-of-the-twenty-apply-to-you}

Четыре правила — про Jasmine. Если вы никогда не пользовались Jasmine, на вашем коде они сработать не
могут, так что их можно оставить включёнными.

| Вы                                                    | Что плагин делает для вас                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| пишете на Vitest, никогда не трогали Jasmine или Jest | работают 52 основных правила; четыре правила про Jasmine никогда не срабатывают                          |
| переезжаете с `jest-auto-spies` / Jest                | работу делают основные правила; больше всего ловят `no-done-callback` и `prefer-as-spy`                  |
| переезжаете с `jasmine-auto-spies`                    | все 56 правил; поставьте `prefer-native-spy-api` в `'off'`, пока не уберёте слой совместимости с Jasmine |

### Если вы никогда не пользовались Jasmine {#if-you-never-used-jasmine}

Каждое правило про Jasmine ищет код, которого в Vitest-тестах нет:

| Правило                           | Что ищет                                                                    | В ваших спеках                                                                        |
| --------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `no-jasmine-globals`              | `jasmine.*` и голые глобалы `spyOn(`, `spyOnProperty(`, `fail(`, `pending(` | вы пишете `vi.spyOn` и `expect.fail`; голые формы под Vitest бросают `ReferenceError` |
| `jasmine-namespace-without-entry` | `.and` / `.calls` / `.withArgs` на спае, созданном этой библиотекой         | вы пишете `.mockReturnValue`, `.mock.calls` и `calledWith`                            |
| `no-save-arguments-by-value`      | `spy.calls.saveArgumentsByValue()`                                          | API есть только в Jasmine; код на Vitest его никогда не вызывает                      |
| `prefer-native-spy-api`           | те же пространства имён `.and` / `.calls`                                   | то же, что выше                                                                       |

`jasmine-namespace-without-entry` не смотрит ни на что под `.mock`, поэтому `spy.mock.calls[0]` оно не
отмечает никогда.

Выключить эти четыре можно, но это ничего не экономит: правило, которому не на что срабатывать,
лишней работы не делает. Если всё же хочется конфиг покороче:

```js
export default [
  {
    files: ['**/*.spec.ts'],
    ...autoSpy.configs.recommended,
    rules: {
      ...autoSpy.configs.recommended.rules,
      // мы никогда не пользовались jasmine; этим четырём тут нечего сказать
      'vitest-auto-spy/no-jasmine-globals': 'off',
      'vitest-auto-spy/jasmine-namespace-without-entry': 'off',
      'vitest-auto-spy/no-save-arguments-by-value': 'off',
      'vitest-auto-spy/prefer-native-spy-api': 'off',
    },
  },
];
```

### Если вы приходите из Jest {#if-you-are-coming-from-jest}

Отдельного набора правил для Jest нет. Большую часть того, что нужно поменять в Jest-тестах, ловят
эти основные правила:

| Правило                        | Что ловит в Jest-тестах                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-done-callback`             | `it('x', (done) => …)`. Vitest передаёт туда объект контекста, так что `done()` бросает. Если вызов стоит внутри колбэка, тест [проходит, не выполнившись](/ru/utilities/eslint-rules#no-done-callback) |
| `prefer-as-spy`                | `TestBed.inject(X) as Spy<X>`. С этой библиотекой это падает с `TS2352`, и это [самая частая ошибка компиляции после переезда Angular-проекта](/ru/migrating#reading-a-spy-back-out-of-the-container)   |
| `no-mocked-for-spy`            | объявления `Mocked<T>`, которые требуют приватных полей, которых у спая нет                                                                                                                             |
| `no-shared-module-level-mock`  | экспортированную фикстуру `{ save: jest.fn() }`. При `isolate: false` (файлы тестов в одном воркере делят модули) это один объект на воркер, а не на тест                                               |
| `prefer-create-spy-from-class` | объект из `fn()`, используемый как подмена. Он отстаёт от класса, как только у класса появляется новый метод                                                                                            |
| `no-floating-assertion`        | `expect()` в `.then()`, которого никто не дожидается                                                                                                                                                    |

`no-jasmine-globals` оставьте включённым и здесь. До Jest 27 Jest работал на `jest-jasmine2`, а тот
ставил `spyOn`, `fail` и `pending` глобалами, так что в старых Jest-тестах они могут встретиться.
Опасен `spyOn`: версия Jasmine заменяет метод, а `vi.spyOn` вызывает настоящий метод. После простого
переименования спека компилируется и выполняется, а проверяемый код обращается к настоящему
коллаборатору.

Для массовой правки запустите кодмод, а не линтер: `npx vitest-auto-spy codemod --from jest`.
`--from jasmine` обрабатывает другой диалект, а `auto` по умолчанию выбирает нужный набор для каждого
файла. См. [Переезд с jest-auto-spies](/ru/migrating).

### Если вы приходите из Jasmine {#if-you-are-coming-from-jasmine}

Касаются все 56 правил, а четыре правила про Jasmine написаны прямо для вас:

- `no-jasmine-globals` и `no-save-arguments-by-value` сообщают о поведении, которое молча меняется
  после переименования.
- `jasmine-namespace-without-entry` сообщает о спае, созданном до установки слоя совместимости.
- `prefer-native-spy-api` сообщает о самом слое совместимости. На время переезда выключите его:

```js
'vitest-auto-spy/prefer-native-spy-api': 'off', // удалите это на последней миле
```

Для массовой правки запустите `npx vitest-auto-spy codemod --from jasmine`. Он делает и те правки,
которые правило не исправляет автоматически. См. [Переезд с jasmine-auto-spies](/ru/migrating-jasmine).

## Настройка под ваш проект {#tuning-it-for-your-project}

Каждый конфиг — обычный объект, так что любая настройка ниже — одна строка в **вашем**
`eslint.config.js`.

### Как внедрить на большом существующем наборе тестов без красного CI {#land-it-on-a-large-existing-suite-without-a-red-ci}

На большом существующем проекте первый прогон может выдать сотни находок. Этот рецепт держит CI
зелёным, пока вы их исправляете, и всё равно валит сборку на находках, которые не компилируются.

1. Один раз запустите `npx eslint . --fix`. Он исправит большую часть находок двух правил про ошибки
   типов (`prefer-as-spy` и `no-mocked-for-spy`), которые шаг 2 оставляет на `error`. Остальные
   находки этих правил исправьте руками: редактор предложит каждую правку как подсказку. `--fix`
   применяет автоисправления всех правил, у которых они есть, а не только этих двух, поэтому
   просмотрите дифф перед коммитом.
2. Понизьте все правила до `warn`, а правила про ошибки типов верните на `error` через
   `configs.typeErrors`:

```js
// eslint.config.js
import tseslint from 'typescript-eslint';
import autoSpy from 'vitest-auto-spy/eslint-plugin';

const asWarnings = Object.fromEntries(Object.keys(autoSpy.configs.recommended.rules).map((rule) => [rule, 'warn']));

export default [
  ...tseslint.configs.recommended,
  {
    files: ['**/*.spec.ts'],
    ...autoSpy.configs.recommended,
    rules: {
      ...autoSpy.configs.recommended.rules,
      ...asWarnings,
      ...autoSpy.configs.typeErrors.rules, // находки, которые не компилируются, остаются ошибками
      'vitest-auto-spy/prefer-create-spy-from-class': 'off', // свои изменения — после всех `...`
    },
  },
];
```

3. Исправляйте предупреждения партиями. Когда их не останется, удалите `asWarnings` и строку с
   `typeErrors`.

Предупреждения не валят `eslint`, если не запускать его с `--max-warnings`. Если ваш CI передаёт
`--max-warnings 0`, уберите этот флаг на время рецепта. Свои изменения правил пишите после последнего `...`, как в примере, иначе раскрытые конфиги их
перезапишут.

Прежде чем понижать всё, посмотрите, что на самом деле в первом прогоне:

- Одиннадцать правил на `warn` и так дают предупреждения. На проекте с компонентами
  `prefer-render-shallow` часто самое громкое правило, так что проверьте, какую часть первого
  прогона даёт оно.
- `no-compile-components`, `no-redundant-mock-reset` и `no-relative-mock-under-builder` молчат, пока
  опция (а для двух последних ещё ваш конфиг или таргет билдера) не скажет им, как запускается ваш
  проект.
- Остальное — в основном правила о том, что тест неправильный. Красный CI нужен именно для них.

**Вариант, который надёжнее на долгий срок,** когда падающие файлы умещаются в список, который можно вести
руками: оставьте каждое
правило на его уровне по умолчанию и выключите падающие правила только для ещё не исправленных
файлов. Сокращающийся список путей показывает прогресс. Общий `warn` на весь проект обычно остаётся
навсегда.

```js
export default [
  { files: ['**/*.spec.ts'], ...autoSpy.configs.recommended },
  {
    files: ['src/app/legacy/**/*.spec.ts', 'src/app/cart/cart.component.spec.ts'], // ещё не исправлены
    rules: { 'vitest-auto-spy/prefer-provide-auto-spy': 'off', 'vitest-auto-spy/no-done-callback': 'off' },
  },
];
```

**Почему на `error` остаются именно эти два.** Это не «самые важные правила» — такой выбор за вами.
Это правила, чьи находки **не компилируются**:

- `TestBed.inject(X) as Spy<X>` падает с `TS2352`.
- `let s: Mocked<T>` падает с `TS2322`.

Все остальные правила сообщают о коде, который компилируется и работает, поэтому исправлять его
партиями — реальный план. Для этих двух — нет: сборка уже красная. В перенесённом с
`jest-auto-spies` файле часто по десять таких приведений, по одному на каждую внедрённую подмену. Под
общим `warn` он проходит линтер, а потом падает на проверке типов с десятью ошибками, которые
упоминают `accessorSpies` (свойство, которое добавляет `Spy<T>`) и ни разу не называют правило. У
обоих правил есть `--fix`, так что держать их на `error` стоит один запуск `eslint --fix`.

Сейчас в этот набор входят `prefer-as-spy` и `no-mocked-for-spy` — два правила из таблицы
[Типы](#types). Раскрывайте конфиг, а не копируйте два имени: список поддерживает пакет, а копия в
вашем конфиге молча устареет.

### Понизить одно правило {#turn-one-rule-down}

```js
export default [
  {
    files: ['**/*.spec.ts'],
    ...autoSpy.configs.recommended,
    rules: {
      ...autoSpy.configs.recommended.rules,
      'vitest-auto-spy/prefer-provide-auto-spy': 'warn', // сообщать, но не блокировать мердж
      'vitest-auto-spy/prefer-create-spy-from-class': 'off', // не наш стиль
    },
  },
];
```

Сначала раскройте `autoSpy.configs.recommended.rules`, потом пишите свои переопределения: в объекте
побеждает более поздний ключ. `...autoSpy.configs.recommended` уже приносит ключ `rules`, и ключ
`rules`, написанный после него, **заменяет** весь этот объект правил. Без внутреннего раскрытия в конфиге
останутся только ваши два правила, и никакая ошибка об этом не скажет.

Чтобы поднять правило с `warn` до `error`, напишите такую же строку:
`'vitest-auto-spy/prefer-render-shallow': 'error'`.

### Три правила, которые могут сработать на корректном коде {#the-three-rules-that-can-report-on-correct-code}

Эти три правила отвечают на вопрос, на который один файл не всегда может ответить. Они всё равно
стоят на `error`: если правило ошибается насчёт вашего проекта, это исправляется одной строкой. Если
первый прогон вас удивил, смотрите сначала на них.

| Правило                           | Когда оно ошибается насчёт вас                                                                                                                               | Строка, которая это чинит                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `jasmine-namespace-without-entry` | `enableJasmineCompat()` выполняется в файле из `setupFiles` Vitest, который не импортирует ни одна спека, поэтому файл с `.and` выглядит так, будто слоя нет | `['error', { setupModules: ['./test-setup'] }]`                                |
| `no-unregistered-inject-spy`      | файл регистрирует часть подмен так, как правило умеет читать, **и** получает ещё одну через хелпер, за которым оно не следит, например общий `beforeEach`    | опции нет; локальный `'off'` или отключение на строку                          |
| `prefer-native-spy-api`           | вы **посреди переезда** с `jasmine-auto-spies`; оно сообщает о рабочем коде слоя совместимости на каждой строке                                              | `'off'`, пока тесты не позеленеют, потом `'error'` и `--fix` на последнюю милю |

`setupModules` говорит `jasmine-namespace-without-entry`, где ставится слой, и правило перестаёт
гадать. Импорт `vitest-auto-spy/bun`, `…/node` или `…/rstest` тоже глушит правило для этого файла.
Эти точки входа не могут загрузить `vitest-auto-spy/jasmine`, поэтому на их рантаймах слой всегда
ставится из setup-файла.

`no-unregistered-inject-spy` редко что-то нужно: оно и так осторожно. Оно молчит, пока файл хотя бы раз
не вызовет `provideAutoSpy`. Ещё оно умолкает, когда встречает то, что не может прочитать: спред или
неизвестную фабрику провайдера в `providers`, `createWithAutoSpies`, `renderShallow` или
`TestBed.overrideProvider`. То, что остаётся, обычно настоящая находка: `injectSpy(X)` возвращает
настоящий сервис, и его спай-хелперы бросают на первом же `.mockReturnValue(…)`.

### Заглушить одну строку, а не одно правило {#silence-one-line-not-one-rule}

```ts
// eslint-disable-next-line vitest-auto-spy/no-object-define-property -- свойство это геттер на замороженном host-объекте
Object.defineProperty(target, 'clientWidth', { value: 100 });
```

Если исключение локальное, это лучше, чем выключать правило через `off`. Правило продолжает работать
во всех остальных файлах, а комментарий записывает, чем эта строка отличается.

### Проверить, что применяется на самом деле {#check-what-actually-applies}

```bash
npx eslint --print-config src/app/cart.spec.ts | grep vitest-auto-spy
```

Если ничего не напечаталось, глоб `files` не совпадает с этим файлом. Выглядит это так же, как «плагин
не нашёл проблем», поэтому проверьте это, прежде чем решить, что спеки чистые.

### Рядом с `vitest/expect-expect` {#alongside-vitest-expect-expect}

Они не пересекаются. `expect-expect` сообщает о тесте, в котором ассерта **нет**. Этот плагин сообщает
об ассерте, который есть, но ничего не проверяет. Включайте оба.

Настраивайте `assertFunctionNames` шаблонами, а не списком имён:

```js
'vitest/expect-expect': ['error', { assertFunctionNames: ['expect*', 'assert*', '**.expect*'] }],
```

- `expect*` покрывает `expectEmission`, `expectEmissions`, `expectNoEmission`, `expectCompletion` и
  `expectError` из этого пакета, а также ваши собственные хелперы `expect…`.
- `assert*` покрывает `assertNoPendingRequests`, `assertNoShadowedProviders` и `assertMocked`.
- `**.expect*` покрывает хелпер, который вызывают через объект.

Список имён приходится дополнять на каждый новый хелпер. Он может и сломаться: в одних тестах
хелпер-ассерт назывался `find`, и `find` в списке принимает за ассерт любой `Array.prototype.find`.
Шаблоны выше дали **ноль** ложных срабатываний на 1759 спек-файлах.

### Рядом с `vitest/require-hook` {#alongside-vitest-require-hook}

`require-hook` сообщает о любом вызове в теле `describe` или в начале спеки, который не является хуком.
Оно не может знать, что `useConsoleSpies()` или `setupFakeTimers()` сами регистрируют хуки. Плагин
экспортирует список таких хелперов: каждую публичную функцию этого пакета, которая вызывает
`beforeEach`, `afterEach`, `beforeAll` или `afterAll`. Тест в этом пакете проверяет список, так что
новый хелпер не может из него выпасть.

```js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

'vitest/require-hook': ['error', { allowedFunctionCalls: [...autoSpy.hookRegisteringHelpers] }],
```

Вызовов, которые не регистрируют хуков, например `registerSignalMatchers()` и `trackStrayTimers()`, в
списке нет. Если вы вызываете их в начале линтуемого файла, допишите их после спреда.

### Опции правил {#rule-options}

Опции есть у десяти правил. Полная таблица опций — в разделе каждого правила в
[Правилах ESLint](/ru/utilities/eslint-rules).

| Правило                                                                                         | Опции                                                                  | Что делают                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`prefer-create-spy-from-class`](/ru/utilities/eslint-rules#prefer-create-spy-from-class)       | `minRunnerFns` (по умолчанию `2`)                                      | сколько `vi.fn()` делают объект подменой                                                                                                               |
| [`no-stub-class-double`](/ru/utilities/eslint-rules#no-stub-class-double)                       | `minRunnerFns` (по умолчанию `1`)                                      | сколько полей `vi.fn()` делают класс подменой                                                                                                          |
| [`no-structural-double`](/ru/utilities/eslint-rules#no-structural-double)                       | `minRunnerFns` (по умолчанию `2`)                                      | сообщает только ниже этого числа; держите равным значению у `prefer-create-spy-from-class` или поднимите (скажем, до `100`), если то правило выключено |
| [`prefer-render-shallow`](/ru/utilities/eslint-rules#prefer-render-shallow)                     | `templates`: `'as-needed'` (по умолчанию) или `'never'`                | `'never'` запрещает настоящие шаблоны в юнит-спеках                                                                                                    |
| [`prefer-inject-spy`](/ru/utilities/eslint-rules#prefer-inject-spy)                             | `ignoreTokens`                                                         | токены, чей внедрённый экземпляр остаётся настоящим                                                                                                    |
| [`no-real-component-provider`](/ru/utilities/eslint-rules#no-real-component-provider)           | `ignoreTokens`, `childInjectors` (по умолчанию `false`)                | токены, которые пропускаются; читать и дочерние инжекторы                                                                                              |
| [`no-redundant-mock-reset`](/ru/utilities/eslint-rules#no-redundant-mock-reset)                 | `clearMocks`, `mockReset`, `restoreMocks`, `configFile`, `configFlags` | что раннер сбрасывает между тестами                                                                                                                    |
| [`no-compile-components`](/ru/utilities/eslint-rules#no-compile-components)                     | `builder: 'inline-resources'`, `ignoreComponents`                      | сообщает, что билдер встраивает шаблоны; без неё правило молчит                                                                                        |
| [`no-relative-mock-under-builder`](/ru/utilities/eslint-rules#no-relative-mock-under-builder)   | `builder: 'unit-test'`                                                 | сообщает, что эти спеки запускает unit-test-билдер Angular, когда правило не может найти таргет само                                                   |
| [`jasmine-namespace-without-entry`](/ru/utilities/eslint-rules#jasmine-namespace-without-entry) | `setupModules`                                                         | setup-файлы, которые ставят слой совместимости с Jasmine                                                                                               |

Форма-массив задаёт и уровень серьёзности. `['error', { templates: 'never' }]` поднимает
`prefer-render-shallow` с `warn`, его уровня в `recommended`, до `error`. Чтобы оставить `warn`,
пишите `['warn', { … }]`.

```js
'vitest-auto-spy/prefer-render-shallow': ['error', { templates: 'never' }],
'vitest-auto-spy/no-compile-components': ['error', { builder: 'inline-resources' }],
'vitest-auto-spy/no-redundant-mock-reset': ['error', { clearMocks: true, restoreMocks: true }],
```

### Выбирать правила руками {#picking-rules-by-hand}

Можно не брать `configs.recommended` и перечислить только нужные правила. Объект плагина
экспортируется отдельно, так что это поддерживаемая настройка. Если нужен весь набор с парой
изменений, см. [Настройка под ваш проект](#tuning-it-for-your-project). Если нужен короткий список —
пишите так:

```js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [
  {
    files: ['**/*.spec.ts'],
    plugins: { 'vitest-auto-spy': autoSpy },
    rules: {
      'vitest-auto-spy/no-expect-in-subscribe': 'error',
      'vitest-auto-spy/no-done-callback': 'error',
    },
  },
];
```

### Что содержит сообщение {#what-a-message-contains}

Каждое сообщение:

1. называет, что правило нашло в этом файле: класс, токен, член или вызов;
2. одним предложением говорит, почему это ломается;
3. даёт одно исправление;
4. заканчивается на `Docs:` и ссылкой на раздел правила в [Правилах ESLint](/ru/utilities/eslint-rules).

Эта же ссылка — `meta.docs.url` правила, поэтому редактор делает имя правила ссылкой на неё. Правила
входят в пакет вместе с API, который они советуют, так что всегда совпадают с установленной у вас
версией.

## Правила {#rules}

В таблицах ниже у каждого правила одна строка. Имя правила ведёт на его полный раздел в
[Правилах ESLint](/ru/utilities/eslint-rules).

- **По умолчанию:** уровень серьёзности в `configs.recommended`. Чтобы его изменить, см.
  [Понизить одно правило](#turn-one-rule-down).
- **Правка:** `--fix` значит, что `eslint --fix` переписывает код. _подсказка_ значит, что редактор
  предлагает правку, а вы принимаете её вручную. Почему так поделено, объясняет раздел
  [Какие правила чинят и почему их так мало](#which-rules-fix-and-why-so-few).
- **Без него:** что покажет прогон тестов, если правило выключено. _зелено_ — плохой случай: сломанный
  тест всё равно проходит, и больше ничто вам об этом не скажет. _красно_ значит, что прогон падает, но с
  менее полезным сообщением. _компиляция_ значит, что падает проверка типов. _—_ значит, что правило
  сообщает о мёртвом коде или о цене, а не об отказе. _(по построению)_ значит, что значение следует из того, как работают
  раннер и код, и не проверялось [пробным прогоном](#measured-what-each-rule-is-worth).

### Ассерты, которые никогда не выполняются {#assertions-that-never-run}

Тест проходит, потому что ассерт не выполнился или выполнился, но упасть не мог. Например, поток
промолчал или промис никто не дождался.

| Правило                                                                                   | На что срабатывает                                                                                                       | По умолчанию | Правка    | Без него |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------ | --------- | :------: |
| [`no-expect-in-subscribe`](/ru/utilities/eslint-rules#no-expect-in-subscribe)             | `expect()` внутри колбэка `subscribe()` → `expectEmission` / `firstValueFrom`                                            | `error`      | подсказка |  зелено  |
| [`no-vacuous-absence-assertion`](/ru/utilities/eslint-rules#no-vacuous-absence-assertion) | тест, каждый ассерт которого выполняется и тогда, когда поток ничего не отправил → `expectNoEmission` / `expectEmission` | `error`      | —         |  зелено  |
| [`no-floating-assertion`](/ru/utilities/eslint-rules#no-floating-assertion)               | `expect()` в `.then()`, которого никто не дожидается → `expect(await promise)`                                           | `error`      | —         |  зелено  |
| [`no-done-callback`](/ru/utilities/eslint-rules#no-done-callback)                         | `it('x', (done) => …)` и `done.fail(…)` → `async`-тест с дождавшимся ассертом                                            | `error`      | —         |  зелено  |
| [`no-bare-called-with`](/ru/utilities/eslint-rules#no-bare-called-with)                   | `spy.m.calledWith(1);` отдельной строкой: недописанная заглушка, которая ничего не проверяет                             | `error`      | —         |  зелено  |
| [`no-constant-expect`](/ru/utilities/eslint-rules#no-constant-expect)                     | `expect(true).toBe(true)`: значение, записанное в спеке, предрешает ответ матчера                                        | `error`      | —         |  зелено  |
| [`no-redundant-smoke-test`](/ru/utilities/eslint-rules#no-redundant-smoke-test)           | `it('should create', () => expect(pipe).toBeTruthy())` рядом с тестами, которые уже создают субъект → удалить            | `error`      | подсказка |  зелено  |
| [`prefer-settle-dynamic-import`](/ru/utilities/eslint-rules#prefer-settle-dynamic-import) | `await import('./thing')` в теле теста → `await settleDynamicImport(() => import('./thing'))`                            | `error`      | подсказка |  зелено  |
| [`no-real-wait-in-test`](/ru/utilities/eslint-rules#no-real-wait-in-test)                 | `await new Promise((r) => setTimeout(r, 300))`: настоящий сон → `advanceTimers(300)` или `vi.waitFor(…)`                 | `warn`       | —         |  зелено  |
| [`no-self-called-spy`](/ru/utilities/eslint-rules#no-self-called-spy)                     | тест сам вызывает метод под спаем, а потом проверяет, что его вызвали → вызовите настоящий триггер                       | `error`      | —         |  зелено  |
| [`no-unasserted-argument`](/ru/utilities/eslint-rules#no-unasserted-argument)             | голый `toHaveBeenCalled()` там, где по файлу видно, что важны аргументы → `toHaveBeenCalledWith(…)`                      | `warn`       | —         |    —     |

### Подмены и модули, которые их держат {#doubles-and-the-modules-that-hold-them}

Эти правила — про то, что один файл оставляет следующему.

| Правило                                                                                           | На что срабатывает                                                                                                       | По умолчанию | Правка                           |         Без него         |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------ | -------------------------------- | :----------------------: |
| [`prefer-create-spy-from-class`](/ru/utilities/eslint-rules#prefer-create-spy-from-class)         | объект из двух и более `vi.fn()` → `createSpyFromClass` / `createAutoMock`                                               | `error`      | —                                |          красно          |
| [`no-stub-class-double`](/ru/utilities/eslint-rules#no-stub-class-double)                         | класс, чьи поля — `vi.fn()` → `createSpyFromClass` / `provideAutoSpy`                                                    | `warn`       | —                                |          красно          |
| [`no-structural-double`](/ru/utilities/eslint-rules#no-structural-double)                         | объект из `vi.fn()` с объявленным типом `{ load: Mock }` → `createAutoMock<T>()`                                         | `warn`       | —                                |          красно          |
| [`prefer-spy-on-own-method`](/ru/utilities/eslint-rules#prefer-spy-on-own-method)                 | `createSpyFromInstance` на один метод → `spyOnOwnMethod(x, 'm')` / `spyOnVoidMethod(x, 'm')`                             | `warn`       | `--fix` / подсказка              |          зелено          |
| [`no-shared-module-level-mock`](/ru/utilities/eslint-rules#no-shared-module-level-mock)           | **экспортированное** значение, в котором лежат `vi.fn()` → экспортируйте фабрику, которая его возвращает                 | `error`      | —                                |          зелено          |
| [`no-outer-binding-in-mock-factory`](/ru/utilities/eslint-rules#no-outer-binding-in-mock-factory) | фабрика `vi.mock`, которая читает `const` / `let` / `class` верхнего уровня → объявите его через `vi.hoisted`            | `error`      | —                                |          красно          |
| [`no-object-define-property`](/ru/utilities/eslint-rules#no-object-define-property)               | `Object.defineProperty` в спеке → `mockReadonlyProp` / `mockValueProp`                                                   | `error`      | подсказка                        |          зелено          |
| [`no-import-time-spread`](/ru/utilities/eslint-rules#no-import-time-spread)                       | `export const x = [...Imported]` на уровне модуля: `TypeError` или пустой объект при загрузке бандла                     | `error`      | подсказка                        | красно _(по построению)_ |
| [`prefer-observer-stub`](/ru/utilities/eslint-rules#prefer-observer-stub)                         | рукописный глобал `IntersectionObserver` / `ResizeObserver` / `MutationObserver` → `stubIntersectionObserver()` и соседи | `error`      | —                                |          зелено          |
| [`no-hand-assigned-global`](/ru/utilities/eslint-rules#no-hand-assigned-global)                   | `global.fetch = vi.fn(…)` без восстановления → `mockValueProp` / `vi.stubGlobal` / `blockNetwork()`                      | `error`      | `--fix` (импортированный объект) |          зелено          |
| [`prefer-stub-response`](/ru/utilities/eslint-rules#prefer-stub-response)                         | объект, приведённый к `Response`, или `createMock<Response>(…)` → `stubResponse({ body })`                               | `error`      | —                                |          зелено          |
| [`no-redundant-mock-reset`](/ru/utilities/eslint-rules#no-redundant-mock-reset)                   | сброс в хуке, который раннер и так делает между тестами → удалите; молчит, пока не знает флагов раннера                  | `error`      | `--fix` / подсказка              |            —             |

### Angular DI и TestBed {#angular-di-and-the-testbed}

Эти правила ловят провайдер или спай на компоненте, который оказался не тем, что спека, по её
мнению, зарегистрировала.

| Правило                                                                                       | На что срабатывает                                                                                                                      | По умолчанию | Правка    |         Без него         |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------- | :----------------------: |
| [`prefer-provide-auto-spy`](/ru/utilities/eslint-rules#prefer-provide-auto-spy)               | рукописная подмена в `useValue` / `useFactory` / `useClass` / `useExisting` → `provideAutoSpy(Class)` / `provideAutoSpyForToken(TOKEN)` | `error`      | `--fix`   |          красно          |
| [`prefer-provide-activated-route`](/ru/utilities/eslint-rules#prefer-provide-activated-route) | собранный руками `ActivatedRoute` или `provideAutoSpy(ActivatedRoute)` → `provideActivatedRoute({ … })`                                 | `error`      | —         |          красно          |
| [`prefer-inject-spy`](/ru/utilities/eslint-rules#prefer-inject-spy)                           | `vi.spyOn(TestBed.inject(X), 'm')` → `injectSpy(X).m`                                                                                   | `error`      | подсказка |          красно          |
| [`no-unregistered-inject-spy`](/ru/utilities/eslint-rules#no-unregistered-inject-spy)         | `injectSpy(X)` для токена, который этот файл не регистрировал: вы получаете настоящий экземпляр                                         | `error`      | —         | красно _(по построению)_ |
| [`no-real-component-provider`](/ru/utilities/eslint-rules#no-real-component-provider)         | провайдер уровня компонента, прочитанный из фикстуры, когда его никто не подменил → `overrideComponentProvider(Component, X)`           | `error`      | —         |            —             |
| [`prefer-render-shallow`](/ru/utilities/eslint-rules#prefer-render-shallow)                   | `TestBed.createComponent` в файле, который ни разу не читает шаблон → `renderShallow(X)`                                                | `warn`       | подсказка |          зелено          |
| [`prefer-set-inputs`](/ru/utilities/eslint-rules#prefer-set-inputs)                           | `fixture.componentRef.setInput('title', v)` → `await setInputs(fixture, { title: v })`                                                  | `warn`       | подсказка |          зелено          |
| [`prefer-to-have-signal-value`](/ru/utilities/eslint-rules#prefer-to-have-signal-value)       | `expect(component.total()).toBe(3)` → `expect(component.total).toHaveSignalValue(3)`; **нужны типы**                                    | `warn`       | `--fix`   |          красно          |
| [`no-overridden-provider`](/ru/utilities/eslint-rules#no-overridden-provider)                 | два провайдера на один токен или провайдер, который заменяет `TestBed.overrideProvider`: более ранний не выполняется                    | `error`      | подсказка |          зелено          |
| [`no-inject-before-override`](/ru/utilities/eslint-rules#no-inject-before-override)           | `TestBed.inject()` / `injectSpy()` / `renderShallow()` в хуке, в тестах, которые ещё вызывают `override*`                               | `error`      | —         |          красно          |
| [`no-dead-schemas`](/ru/utilities/eslint-rules#no-dead-schemas)                               | `schemas` на тестовом модуле, который ничего не объявляет: схеме не к чему применяться                                                  | `error`      | —         | зелено _(по построению)_ |
| [`no-mistyped-use-value`](/ru/utilities/eslint-rules#no-mistyped-use-value)                   | `useValue`, который не подходит под примитивный тип, объявленный его токеном; **нужны типы**                                            | `error`      | —         | зелено _(по построению)_ |
| [`no-unknown-use-value-key`](/ru/utilities/eslint-rules#no-unknown-use-value-key)             | ключ в объектном `useValue`, которого нет у предоставляемого типа; **нужны типы**                                                       | `error`      | —         | зелено _(по построению)_ |
| [`no-instance-lifecycle-spy`](/ru/utilities/eslint-rules#no-instance-lifecycle-spy)           | `vi.spyOn(component, 'ngOnInit')`: спай хука на экземпляре Angular никогда не вызывает                                                  | `warn`       | —         |   зелено _(заглушка)_    |
| [`no-compile-components`](/ru/utilities/eslint-rules#no-compile-components)                   | `compileComponents()` под билдером, который встраивает шаблоны; молчит, пока нет `{ builder: 'inline-resources' }`                      | `error`      | подсказка |   — _(мёртвая строка)_   |
| [`no-relative-mock-under-builder`](/ru/utilities/eslint-rules#no-relative-mock-under-builder) | `vi.mock('./x')` в спеке, которую запускает `@angular/build:unit-test` → `provideAutoSpy(X)` / `overrideComponentProvider`              | `error`      | —         |          красно          |
| [`no-disabled-testbed-teardown`](/ru/utilities/eslint-rules#no-disabled-testbed-teardown)     | `teardown: { destroyAfterEach: false }` → удалите; каждая фикстура переживает свой тест                                                 | `error`      | —         |          зелено          |
| [`no-sync-testbed-await`](/ru/utilities/eslint-rules#no-sync-testbed-await)                   | `await` на `configureTestingModule` / `override*` / `createComponent`, которые не возвращают промис                                     | `error`      | подсказка |   — _(мёртвый await)_    |

### Доступ мимо публичного API {#reaching-past-the-public-surface}

Эти правила сообщают о тестах, которые читают приватные члены проверяемого класса.

| Правило                                                                           | На что срабатывает                                                                                                        | По умолчанию | Правка    |         Без него         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------ | --------- | :----------------------: |
| [`no-private-member-access`](/ru/utilities/eslint-rules#no-private-member-access) | `instance['privateMember']`, `(instance as any).privateMember`, `vi.spyOn(Object.getPrototypeOf(x), 'm')`; **нужны типы** | `error`      | —         | зелено _(по построению)_ |
| [`no-reflect-member-access`](/ru/utilities/eslint-rules#no-reflect-member-access) | `Reflect.get(component, 'x')` / `Reflect.set(service, 'x', v)`: то же самое, но с ключом, который не проверяет компилятор | `error`      | подсказка | зелено _(по построению)_ |

### Типы {#types}

Два правила сообщают о касте или типе, который компилятор отвергает с запутанным сообщением. Три
сообщают о коде, который выключает компилятор: каст над фикстурой, каст над методом спая и
комментарий над заглушкой.

| Правило                                                                                   | На что срабатывает                                                                        | По умолчанию | Правка              |           Без него           |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------ | ------------------- | :--------------------------: |
| [`no-mocked-for-spy`](/ru/utilities/eslint-rules#no-mocked-for-spy)                       | `Mocked<T>` в позиции типа → `Spy<T>`, вместе с импортом                                  | `error`      | `--fix` / подсказка |          компиляция          |
| [`prefer-as-spy`](/ru/utilities/eslint-rules#prefer-as-spy)                               | `TestBed.inject(X) as Spy<X>` → `asSpy(TestBed.inject(X))`, вместе с импортом             | `error`      | `--fix`             | компиляция _(по построению)_ |
| [`prefer-create-mock`](/ru/utilities/eslint-rules#prefer-create-mock)                     | объектный литерал под `as SomeType` → `createMock<SomeType>({ … })`                       | `warn`       | подсказка           |              —               |
| [`no-mock-cast`](/ru/utilities/eslint-rules#no-mock-cast)                                 | `TestBed.inject(S).m as Mock` → `injectSpy(S).m`                                          | `error`      | подсказка           |              —               |
| [`no-ts-expect-error-on-double`](/ru/utilities/eslint-rules#no-ts-expect-error-on-double) | `@ts-expect-error` / `@ts-ignore` над `nextWith`, `mockReturnValue`, `calledWith(…)` спая | `error`      | —                   |            зелено            |

### Консоль {#the-console}

Эти правила сообщают о выводе в консоль, который не увидит ни один консольный спай. Это пара к
[`setupAutoSpy({ strayConsole })`](/ru/utilities/setup) на этапе линта: та роняет тест во время прогона.

| Правило                                                                                   | На что срабатывает                                                                                                    | По умолчанию | Правка    |         Без него         |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------ | --------- | :----------------------: |
| [`no-passthrough-console-spy`](/ru/utilities/eslint-rules#no-passthrough-console-spy)     | `vi.spyOn(console, 'error')` без реализации: он всё равно печатает → `installConsoleSpies()`                          | `error`      | подсказка | зелено _(по построению)_ |
| [`no-console-in-spec`](/ru/utilities/eslint-rules#no-console-in-spec)                     | спека, которая вызывает `console.x(…)` или присваивает `console.x = …` и не возвращает его обратно                    | `error`      | —         | зелено _(по построению)_ |
| [`no-import-time-console-spies`](/ru/utilities/eslint-rules#no-import-time-console-spies) | импорт `vitest-auto-spy/console` в файле, который ни разу не вызывает `installConsoleSpies()` или `useConsoleSpies()` | `error`      | —         | зелено _(по построению)_ |
| [`no-unasserted-console-spy`](/ru/utilities/eslint-rules#no-unasserted-console-spy)       | консольный спай, который файл никогда не проверяет → проверьте его или дайте `useConsoleSpies()` заглушить консоль    | `warn`       | —         |          зелено          |

### Уход с jasmine {#coming-off-jasmine}

Эти правила — для тестов, которые ещё работают на [`vitest-auto-spy/jasmine`](/ru/migrating-jasmine)
или ещё содержат код на Jasmine. **В тестах, которые никогда не пользовались Jasmine, они не
срабатывают**; см. [Если вы никогда не пользовались Jasmine](#if-you-never-used-jasmine).

| Правило                                                                                         | На что срабатывает                                                                                            | По умолчанию | Правка              |           Без него            |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------ | ------------------- | :---------------------------: |
| [`no-jasmine-globals`](/ru/utilities/eslint-rules#no-jasmine-globals)                           | `jasmine.*`, голые `spyOn(` / `spyOnProperty(` / `spyOnAllFunctions(` / `fail(` / `pending(`, `.withContext(` | `error`      | —                   |   зелено _(случай `spyOn`)_   |
| [`jasmine-namespace-without-entry`](/ru/utilities/eslint-rules#jasmine-namespace-without-entry) | `.and` / `.calls` / `.withArgs` на спае библиотеки в файле, который ни разу не ставит слой совместимости      | `error`      | —                   |   красно _(по построению)_    |
| [`no-save-arguments-by-value`](/ru/utilities/eslint-rules#no-save-arguments-by-value)           | `spy.calls.saveArgumentsByValue()`: здесь он ничего не делает, и спека проверяет изменившееся состояние       | `error`      | —                   |   зелено _(по построению)_    |
| [`prefer-native-spy-api`](/ru/utilities/eslint-rules#prefer-native-spy-api)                     | `.and` / `.calls` там, где собственный API спая делает то же самое                                            | `error`      | `--fix` / подсказка | — _(сообщает о рабочем коде)_ |

## Какие правила чинят и почему их так мало {#which-rules-fix-and-why-so-few}

Восемь из 56 правил переписывают код под `--fix`. Девятнадцать предлагают правку как подсказку в
редакторе, которую вы принимаете вручную: у четырёх из них для некоторых форм есть и `--fix` (в
таблице ниже), а пятнадцать предлагают только подсказку. Граница зависит от того, чего стоит ошибочная догадка, а не
от того, насколько сложна правка.

| Правило                       | `--fix`                                                                                          | Подсказка                |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------ |
| `prefer-as-spy`               | всегда                                                                                           | —                        |
| `no-mocked-for-spy`           | параметр, возвращаемый тип или каст; переменная, чьё значение приходит из фабрик этой библиотеки | остальные переменные     |
| `prefer-provide-auto-spy`     | да                                                                                               | —                        |
| `prefer-to-have-signal-value` | да                                                                                               | —                        |
| `no-hand-assigned-global`     | значение, записанное в импортированный объект                                                    | —                        |
| `no-redundant-mock-reset`     | сброс, который раннер доказуемо уже сделал                                                       | остальные случаи         |
| `prefer-spy-on-own-method`    | точные формы                                                                                     | остальное                |
| `prefer-native-spy-api`       | когда спай доказуемо создан этой библиотекой                                                     | во всех остальных местах |

Пятнадцать правил предлагают только подсказку: `no-expect-in-subscribe`, `prefer-inject-spy`,
`no-object-define-property`, `no-overridden-provider`, `no-reflect-member-access`,
`no-import-time-spread`, `prefer-render-shallow`, `prefer-settle-dynamic-import`,
`prefer-create-mock`, `no-mock-cast`, `no-passthrough-console-spy`, `no-compile-components`,
`no-sync-testbed-await`, `no-redundant-smoke-test` и `prefer-set-inputs`.

**Исправление работает без присмотра, поэтому ошибиться ему должно быть безопасно.** Правило получает
`--fix`, когда ошибочная правка падает громко или невозможна:

- `no-mocked-for-spy` и `prefer-as-spy` меняют только типы. Ошибочная правка не даст файлу
  скомпилироваться, а это самое громкое и дешёвое падение из возможных.
- `prefer-as-spy` сохраняет ваш собственный каст: `asSpy` — типизированная функция-тождество, так что
  новая строка утверждает ровно то же, что старая.

**Подсказка — для правки, которая меняет поведение.** Вы видите дифф и принимаете её по одному вызову:

- Найдёт ли `injectSpy(X)` спай, зависит от `provideAutoSpy(X)`, который обычно лежит в другом файле.
- `mockValueProp` оставляет свойство записываемым там, где `Object.defineProperty` его запечатал.
- `no-expect-in-subscribe` переписывает тест целиком.
- `no-overridden-provider` удаляет строку провайдера; `no-import-time-spread` превращает константу в
  функцию, и к каждому использованию нужно дописать `()`.

**Никакого исправления** там, где ремонт затрагивает весь файл, а не один узел. `createSpyFromClass`
нужен класс, который объектный литерал нигде не называет. `provideAutoSpy` теряет возвращаемые
значения, которые настроил `useValue`. `Object.defineProperties` превращается в отдельный
`mockValueProp` на каждую запись.

В разделе каждого правила в [Правилах ESLint](/ru/utilities/eslint-rules) точно сказано, когда оно
предлагает исправление или подсказку и какие формы не трогает.

## Измерено: чего стоит каждое правило {#measured-what-each-rule-is-worth}

Колонка _Без него_ в разделе [Правила](#rules) взята из настоящих прогонов. Для каждого правила
написали одну пробную спеку с ассертом, который не может быть истинным. Пробы гоняли на Vitest 4.1.9,
с `isolate: false` там, где это важно, а половину про zone — под zone.js.

| Правило                        | Без правила прогон говорит                                                                                                                                                                                   |  Вердикт   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------: |
| `no-expect-in-subscribe`       | ничего: [4 из 4 форм зелёные на 4 поведениях потока](/ru/core/observable-assertions#measured-four-forms-against-four-streams)                                                                                |   зелено   |
| `no-done-callback`             | ничего, если `done()` стоит в колбэке: тело возвращает `undefined`, тест заканчивается, ассерт выполняется после него                                                                                        |   зелено   |
| `no-floating-assertion`        | без zone: `Unhandled Rejection`, код выхода 1, тест не назван. Под zone.js: одно из двух отклонений пропадает                                                                                                |   зелено   |
| `no-bare-called-with`          | ничего: спай, как и раньше, отвечает `undefined` на эти аргументы, а тест не проверяет ни одного вызова                                                                                                      |   зелено   |
| `no-shared-module-level-mock`  | ничего: собственное состояние фикстуры переходит между файлами при `isolate: false`                                                                                                                          |   зелено   |
| `no-object-define-property`    | ничего в файле, который подменил свойство; **следующий** файл читает подменённое значение                                                                                                                    |   зелено   |
| `no-mocked-for-spy`            | `TS2322 … missing the following properties from type 'CartService': http, cache`                                                                                                                             | компиляция |
| `prefer-create-spy-from-class` | `TypeError: cart.applyCoupon is not a function`                                                                                                                                                              |   красно   |
| `prefer-provide-auto-spy`      | то же самое, на один шаг DI дальше                                                                                                                                                                           |   красно   |
| `prefer-inject-spy`            | `spy.getPlans.nextWith is not a function`                                                                                                                                                                    |   красно   |
| `no-inject-before-override`    | `Cannot override provider when the test module has already been instantiated. Make sure you are not using \`inject\` before \`overrideProvider\``                                                            |   красно   |
| `no-overridden-provider`       | ничего, если рукописная подмена случайно отвечает как надо. Если прочитать через `injectSpy`, прогон красный, и [`injectSpy` говорит почему](/ru/adapters/angular#injectspy-says-when-it-got-the-real-thing) |   зелено   |

Семь из этих двенадцати защищают от теста, который **зелёный и неправильный**. Сам прогон о таком
отказе сообщить не может. Четыре защищают от красного теста, чьё сообщение и так понятно, и одно — от
ошибки компиляции.

Эта колонка — доказательство, а не уровень серьёзности. Конфиг не выводит из неё серьёзность: насколько
громкой должна быть находка, решает ваш проект. Одиннадцать правил на `warn` выбраны по другим
признакам, перечисленным в разделе [Как выглядит первый прогон](#_4-what-the-first-run-looks-like).

Четыре правила про Jasmine так не проверяли: их предмет — миграция, а не поведение раннера. Два из них
зелёные по построению: `saveArgumentsByValue()` здесь ничего не делает, а то, что `vi.spyOn` вызывает
настоящий метод, — документированное поведение Vitest.

`no-overridden-provider` — единственное правило, чей вердикт зависит от остального файла. С
`TestBed.inject` и ассертами на рукописную подмену всё проходит, а `provideAutoSpy` над ней так и не
выполнился.

### Во что плагин обходится на прогоне {#what-the-plugin-costs-to-run}

Весь конфиг `recommended` почти не добавляет времени линту: **56 мс** на 173 спек-файла и **68 мс** на
одну спеку размером 1,7 МБ. Больше замеров — на странице [Производительность](/ru/core/performance).
