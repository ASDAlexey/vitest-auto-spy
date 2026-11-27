---
title: Вызов оригинала, когда аргументы не совпали
description: Задайте ответ через calledWith для выбранных аргументов и сохраните исходную реализацию для остальных вызовов.
---

# Вызов оригинала, когда аргументы не совпали

Передайте `passthrough: 'unmatched'`, чтобы подменить ответ для конкретного аргумента, а не для всего метода.

```ts
import { createSpyFromInstance } from 'vitest-auto-spy';

const prices = createSpyFromInstance({ price: (sku: string) => sku.length }, { passthrough: 'unmatched' });
prices.price.calledWith('sale').mockReturnValue(0);

prices.price('sale'); // 0 при каждом совпадении
prices.price('apple'); // 5 из исходной функции
```

При `passthrough: true` настройка `calledWith` по-прежнему отключает оригинал для всего метода. Если нужны оба ответа, выберите `'unmatched'`.

Для мока раннера передайте опцию при первом вызове `adoptMock`. Для модуля укажите её при создании пространства имён:

```ts
import { vi } from 'vitest';
import { adoptMock, moduleNamespace } from 'vitest-auto-spy';

const mock = adoptMock(
  vi.fn((sku: string) => sku.length),
  { passthrough: 'unmatched' },
);
mock.calledWith('sale').mockReturnValue(0);

const namespace = moduleNamespace({ price: (sku: string) => sku.length }, { passthrough: 'unmatched' });
adoptMock(namespace.price).calledWith('sale').mockReturnValue(0);
```

При совпадении спай возвращает настроенный ответ, даже `undefined`. Если аргументы не подошли для `mustBeCalledWith`, спай бросает ошибку. При промахе `calledWith` спай возвращает заданный ответ по умолчанию, например `returns: { price: 10 }`. Если такого ответа нет, спай вызывает оригинал ровно один раз. Правило с `calledWith('sale').once()` перестаёт действовать после первого совпадения.

Для метода `this` — исходный экземпляр. Для экспорта модуля и принятого мока `this` — объект, на котором вызвали функцию. Если до `adoptMock` у мока не было реализации, промах возвращает `undefined`.
