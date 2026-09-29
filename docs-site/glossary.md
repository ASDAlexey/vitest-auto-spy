---
title: Glossary
description: The words these docs use, what each one means in a spec, and the Russian term the translation uses for it.
---

# Glossary

The words these docs use, in plain terms. Each entry says what the word means in a spec and, where it
helps, which function it points to. The last column is the term the Russian pages use.

## Spies and doubles

| Term               | Meaning                                                                                                                                             | RU                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| spy                | A stand-in function. It records every call and answers what you set. `createSpyFromClass(UserService)` gives an object whose every method is a spy. | спай                    |
| `Spy<T>`           | The type of that object: every method of `T` typed as a spy, plus the helpers its return type allows (`resolveWith`, `nextWith`, …).                | `Spy<T>`                |
| test double        | Any object that stands in for a real dependency in a test. A spy object is one kind.                                                                | подмена, тестовый дубль |
| stub               | A double that only answers with preset values and records nothing. `createMock<T>()` builds one.                                                    | стаб                    |
| mock               | A double told in advance which calls to expect; it fails on the others. `mustBeCalledWith` and `strict` turn a spy into one.                        | мок                     |
| fake               | A working, simplified implementation, such as an in-memory store. This library does not build fakes.                                                | фейк                    |
| fixture            | A ready test object with sensible defaults, such as a `User` with every field filled. See [Fixtures without casts](/utilities/fixtures).            | фикстура                |
| preset (`returns`) | Setting a spy's answer when you create it, instead of on a later line: `createSpyFromClass(UserService, { returns: { load: of(user) } })`.          | задать заранее          |
| `overrides`        | Replacing a member with a plain value that is no longer a spy. See [returns vs overrides](/core/returns-vs-overrides).                              | `overrides`             |
| strict             | A mode where a method you did not configure throws instead of returning `undefined`. See [Strict mode](/core/strict-mode).                          | строгий режим           |
| lazy spy           | A method spy built on first read rather than up front. It saves memory on wide classes and behaves the same in a spec.                              | ленивый спай            |
| helper             | A method the library adds to a spy, such as `resolveWith`, `nextWith` or `calledWith`. See [Control helpers](/core/control-helpers).                | хелпер                  |

## Packages and setup

| Term              | Meaning                                                                                                                                                                          | RU                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| entry point       | The import path you pick for your runner or framework: `vitest-auto-spy`, `vitest-auto-spy/angular`, `vitest-auto-spy/bun`. See [Entry points](/core/installation#entry-points). | точка входа          |
| runner adapter    | The link between the library and your runner's mock function (`vi.fn()`, Bun's `mock()`, `node:test`'s `mock.fn()`). Importing an entry point registers it.                      | адаптер раннера      |
| setup file        | A file your runner loads before every spec file, such as `vitest.setup.ts` listed in `setupFiles`. Global switches go there.                                                     | setup-файл           |
| spec file         | One test file, such as `user.service.spec.ts`.                                                                                                                                   | спека, файл теста    |
| suite             | All the tests of a project, or the tests of one `describe` block.                                                                                                                | набор тестов         |
| peer dependency   | A package the library uses but does not install; your project provides it. All of them are optional here.                                                                        | peer-зависимость     |
| externalize       | Vitest loads a package from `node_modules` as is instead of processing it with the rest of your code. Angular can then end up with two copies of `@angular/core/testing`.        | вынести из обработки |
| inline            | The opposite: Vitest processes the package with your code, so it shares one copy of each dependency (`server.deps.inline`).                                                      | инлайнить            |
| type augmentation | Adding members to a library's types from your own code with `declare module`.                                                                                                    | расширение типов     |

## Angular

| Term              | Meaning                                                                                                                                                | RU                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| `TestBed`         | Angular's test module. It builds components and services with real dependency injection (DI).                                                          | `TestBed`            |
| provider          | An entry in `providers: [...]` that tells DI what to hand out for a class or token. `provideAutoSpy(UserService)` is one.                              | провайдер            |
| inject            | Getting an instance from DI, with `inject()` or `TestBed.inject()`. `injectSpy(UserService)` does the same and returns it typed as `Spy<UserService>`. | получить через DI    |
| zoneless          | Angular without zone.js. Change detection runs on signals, and `fakeAsync` is not available.                                                           | zoneless             |
| shallow render    | Rendering a component with its child components replaced by empty stand-ins. See `renderShallow` on the [Angular](/adapters/angular) page.             | поверхностный рендер |
| standalone        | A component that lists its own `imports` instead of belonging to an `NgModule`. A spec puts it in `TestBed`'s `imports`.                               | standalone-компонент |
| unit-test builder | Angular CLI's `@angular/build:unit-test`, which runs Vitest from `ng test`.                                                                            | билдер unit-test     |

## Runtime words

| Term             | Meaning                                                                                                                                 | RU                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| instantiate      | Create an instance with `new`. The library never does this to the class you spy on, so its constructor does not run.                    | создать экземпляр |
| prototype        | The object that holds a class's methods. The library reads it to find the methods to spy on.                                            | прототип          |
| instance field   | A property set in the constructor or as `name = value` in the class body. It is not on the prototype, so it needs its own option.       | поле экземпляра   |
| `isolate: false` | A Vitest option that runs many spec files in one shared environment. Faster, but a global left changed by one file leaks into the next. | `isolate: false`  |
