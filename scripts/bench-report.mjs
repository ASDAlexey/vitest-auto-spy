#!/usr/bin/env node
// Render `vitest bench --outputJson` output as the table this project publishes.
//
// The ratio column is the point. Absolute times from a shared CI runner are not portable — GitHub's
// own runners vary 10-30% between runs — but every arm here is measured back-to-back in one process
// on one machine, so the ratio cancels the dominant noise terms. The figure is always `p75`: these
// cases allocate by the hundred thousand and a GC pause lands in some samples and not others, which
// swings the mean, `hz`, and Vitest's own "N× faster" summary, while `p75` reproduces.

import { readFileSync } from 'node:fs';
import { argv, env, exit, stdout, version } from 'node:process';
import { cpus, release, totalmem, type as osType } from 'node:os';
import { fileURLToPath } from 'node:url';

import { paint, renderTable, styleFor } from './bench-table.mjs';

const BASELINE_PREFIX = 'vitest-auto-spy';

const STRINGS = {
  en: {
    locale: 'en-US',
    title: '## Head-to-head benchmarks',
    date: 'Date',
    node: 'Node',
    machine: 'Machine',
    cores: 'cores',
    measured: 'Measured',
    legendHeading: '### How to read these tables',
    notAResult: '> **Not a result.** Budgets were divided by {scale} (`--fast`). Re-run without it before quoting anything.',
    win: 'win',
    fastestHere: '**{name}** is fastest in this case, {ratio}× ahead of the runner-up.',
    legendShort: 'Column meanings and the fairness rules are in `bench/README.md`.',
    directions: '↓ lower is better, ↑ higher is better. In vs this package, above 1.00× means that library is slower. `✓` marks the fastest arm in that table, and the winner is not the same table to table.',
    library: 'Library',
    perOp: 'per operation',
    perSec: 'operations/sec',
    ratio: 'vs this package',
    rme: 'rme',
    spread: 'uncertainty',
    samples: 'samples',
    reproduce: 'Reproduce',
    legend: [
      '`↓` lower is better, `↑` higher is better. In **vs this package**, above 1.00× means that library is slower.',
      '- **per operation** — how long one operation takes, in microseconds. Lower is better. This is',
      '  the p75: three quarters of the timed iterations finished at or under it. It is used instead',
      '  of the mean because a garbage-collection pause among tens of thousands of samples moves the',
      '  mean and leaves the p75 alone.',
      '- **operations/sec** — the same figure the other way up. Computed from the p75, not from the',
      '  `hz` the runner prints, which comes from the mean and inherits its noise.',
      '- **samples** — how many iterations were timed. Every arm in one table runs the same count, on',
      '  purpose: these cases allocate, and collection scales with objects created rather than with',
      '  elapsed time, so an equal time budget would make the faster arm pay for its own speed.',
      '- **vs this package** — that arm divided by this package. Above 1.00x is slower, below is',
      '  faster. The ratio is what transfers to another machine; the microseconds do not.',
      '- **rme / uncertainty** — a single run reports `rme`, which bounds the *mean* and is dominated',
      '  by GC tails. A repeated run reports how far the *published median* can be off, which falls as',
      '  more whole runs are added. That is the figure to trust, and the one `--precise` buys.',
      '',
      'Compare only within a table. A gap under about 20% is not a gap on this stand.',
    ],
  },
  ru: {
    locale: 'ru-RU',
    title: '## Сравнение с другими библиотеками',
    date: 'Дата',
    node: 'Node',
    machine: 'Машина',
    cores: 'ядер',
    measured: 'Измерены',
    legendHeading: '### Как читать эти таблицы',
    notAResult: '> **Не результат.** Бюджеты уменьшены в {scale} раз (`--fast`). Прежде чем что-то цитировать, перезапусти без него.',
    win: 'победа',
    fastestHere: 'Быстрее всех здесь **{name}** — в {ratio}× быстрее следующего.',
    legendShort: 'Значения колонок и правила честности — в `bench/README.md`.',
    directions: '↓ меньше — лучше, ↑ больше — лучше. В к этому пакету больше 1.00× значит, что та библиотека медленнее. `✓` отмечает самую быструю руку в таблице, и победитель в разных таблицах разный.',
    library: 'Библиотека',
    perOp: 'на операцию',
    perSec: 'операций/сек',
    ratio: 'к этому пакету',
    rme: 'погрешн.',
    spread: 'неопредел.',
    samples: 'выборок',
    reproduce: 'Воспроизвести',
    legend: [
      '`↓` меньше — лучше, `↑` больше — лучше. В **к этому пакету** больше 1.00× значит, что та библиотека медленнее.',
      '- **на операцию** — сколько занимает одна операция, в микросекундах. Меньше — лучше. Это p75:',
      '  три четверти итераций уложились в это значение. Берётся вместо среднего, потому что пауза',
      '  сборщика мусора среди десятков тысяч замеров двигает среднее и не трогает p75.',
      '- **операций/сек** — то же число наоборот. Считается из p75, а не из `hz` раннера — тот',
      '  выводится из среднего и тащит его шум.',
      '- **выборок** — сколько итераций померили. У всех рук в таблице оно одинаковое, и это',
      '  намеренно: кейсы аллокационные, сборка мусора зависит от числа созданных объектов, а не от',
      '  времени, поэтому равный бюджет по времени заставил бы быструю руку платить за свою скорость.',
      '- **к этому пакету** — время руки, делённое на время пакета. Больше 1.00x — медленнее, меньше',
      '  — быстрее. На другую машину переносимо отношение, а не микросекунды.',
      '- **погрешность / неопределённость** — одиночный прогон печатает `rme`, а он ограничивает',
      '  *среднее*, которым правят хвосты сборщика. Повторный печатает, насколько может ошибаться',
      '  *публикуемая медиана*; она падает с числом целых прогонов. Верить надо ей — её и покупает',
      '  `--precise`.',
      '',
      'Сравнивать только внутри одной таблицы. Разрыв меньше примерно 20 % на этом стенде не разрыв.',
    ],
  },
  fr: {
    locale: 'fr-FR',
    title: '## Comparaison avec les autres bibliothèques',
    date: 'Date',
    node: 'Node',
    machine: 'Machine',
    cores: 'cœurs',
    measured: 'Mesurées',
    legendHeading: '### Comment lire ces tableaux',
    notAResult: '> **Pas un résultat.** Budgets divisés par {scale} (`--fast`). Relancez sans avant de citer quoi que ce soit.',
    win: 'gagne',
    fastestHere: '**{name}** est la plus rapide dans ce cas, {ratio}× devant la suivante.',
    legendShort: 'Le sens des colonnes et les règles d\'équité sont dans `bench/README.md`.',
    directions: '↓ plus bas vaut mieux, ↑ plus haut vaut mieux. Dans face à ce paquet, au-dessus de 1.00× cette bibliothèque est plus lente. `✓` marque la plus rapide du tableau, et le gagnant change d\'un tableau à l\'autre.',
    library: 'Bibliothèque',
    perOp: 'par opération',
    perSec: 'opérations/s',
    ratio: 'face à ce paquet',
    rme: 'marge',
    spread: 'incertitude',
    samples: 'échantillons',
    reproduce: 'Reproduire',
    legend: [
      '`↓` plus bas vaut mieux, `↑` plus haut vaut mieux. Dans **face à ce paquet**, au-dessus de 1.00× cette bibliothèque est plus lente.',
      '- **par opération** — durée d\'une seule opération, en microsecondes. Plus bas vaut mieux.',
      '  C\'est le p75 : trois quarts des itérations ont terminé en deçà. Il remplace la moyenne, car',
      '  une pause du ramasse-miettes parmi des dizaines de milliers de mesures déplace la moyenne',
      '  sans toucher au p75.',
      '- **opérations/s** — le même chiffre à l\'envers. Calculé depuis le p75, et non depuis le `hz`',
      '  affiché par le runner, qui dérive de la moyenne et en hérite le bruit.',
      '- **échantillons** — nombre d\'itérations mesurées. Identique pour chaque bibliothèque du',
      '  tableau, volontairement : ces cas allouent, et le ramasse-miettes suit le nombre d\'objets',
      '  créés plutôt que le temps écoulé.',
      '- **face à ce paquet** — le temps de cette bibliothèque divisé par celui de ce paquet.',
      '  Au-dessus de 1.00x elle est plus lente. C\'est le rapport qui se transpose à une autre',
      '  machine, pas les microsecondes.',
      '- **marge / incertitude** — un run isolé affiche `rme`, qui borne la *moyenne*, dominée par les',
      '  pauses du ramasse-miettes. Un run répété affiche de combien la *médiane publiée* peut se',
      '  tromper ; elle diminue avec le nombre de runs. C\'est elle qui compte.',
      '',
      'Ne comparez qu\'au sein d\'un même tableau. Un écart sous 20 % environ n\'en est pas un ici.',
    ],
  },
  zh: {
    locale: 'zh-CN',
    title: '## 与其他库的对比基准',
    date: '日期',
    node: 'Node',
    machine: '机器',
    cores: '核',
    measured: '被测版本',
    legendHeading: '### 如何阅读这些表格',
    notAResult: '> **这不是结果。** 预算被缩小为原来的 1/{scale}（`--fast`）。引用任何数字前请去掉该参数重跑。',
    win: '最快',
    fastestHere: '本用例中 **{name}** 最快，比第二名快 {ratio}×。',
    legendShort: '各列含义与公平性规则见 `bench/README.md`。',
    directions: '↓ 越小越好，↑ 越大越好。在 相对本包 一列中，大于 1.00× 表示该库更慢。 `✓` 标记该表中最快的一项，不同表格的胜者并不相同。',
    library: '库',
    perOp: '每次操作',
    perSec: '操作/秒',
    ratio: '相对本包',
    rme: '误差',
    spread: '不确定度',
    samples: '样本数',
    reproduce: '复现方式',
    legend: [
      '`↓` 越小越好，`↑` 越大越好。在 **相对本包** 一列中，大于 1.00× 表示该库更慢。',
      '- **每次操作** — 单次操作耗时，单位微秒，越小越好。这是 p75：四分之三的迭代在此值以内完成。',
      '  之所以不用平均值，是因为数万次采样中的一次垃圾回收停顿会拉动平均值，却不会影响 p75。',
      '- **操作/秒** — 同一数值的倒数表示。由 p75 计算得出，而非运行器输出的 `hz`——后者源自平均值，',
      '  因而继承了它的噪声。',
      '- **样本数** — 实际计时的迭代次数。同一表格内各库的次数刻意保持一致：这些用例会分配对象，',
      '  垃圾回收的频率取决于创建的对象数量而非耗时，若按相同时间预算，更快的库反而要为自己的速度付费。',
      '- **相对本包** — 该库耗时除以本包耗时。大于 1.00x 表示更慢，小于表示更快。可迁移到其他机器的',
      '  是这个比值，而不是微秒数。',
      '- **误差 / 不确定度** — 单次运行给出 `rme`，它约束的是*平均值*，而平均值由垃圾回收长尾主导。',
      '  重复运行给出*所发布中位数*的可能偏差，它随完整运行次数增加而减小。应以它为准，`--precise`',
      '  买的正是它。',
      '',
      '只在同一表格内比较。在本测试台上，小于约 20% 的差距不构成差距。',
    ],
  },
  es: {
    locale: 'es-ES',
    title: '## Comparativa con otras bibliotecas',
    date: 'Fecha',
    node: 'Node',
    machine: 'Máquina',
    cores: 'núcleos',
    measured: 'Medidas',
    legendHeading: '### Cómo leer estas tablas',
    notAResult: '> **No es un resultado.** Presupuestos divididos por {scale} (`--fast`). Vuelva a ejecutar sin él antes de citar nada.',
    win: 'gana',
    fastestHere: '**{name}** es la más rápida en este caso, {ratio}× por delante de la siguiente.',
    legendShort: 'El significado de las columnas y las reglas de equidad están en `bench/README.md`.',
    directions: '↓ menos es mejor, ↑ más es mejor. En frente a este paquete, por encima de 1.00× esa biblioteca es más lenta. `✓` marca la más rápida de esa tabla, y el ganador cambia de una tabla a otra.',
    library: 'Biblioteca',
    perOp: 'por operación',
    perSec: 'operaciones/s',
    ratio: 'frente a este paquete',
    rme: 'margen',
    spread: 'incertidumbre',
    samples: 'muestras',
    reproduce: 'Reproducir',
    legend: [
      '`↓` menos es mejor, `↑` más es mejor. En **frente a este paquete**, por encima de 1.00× esa biblioteca es más lenta.',
      '- **por operación** — lo que tarda una sola operación, en microsegundos. Menos es mejor. Es el',
      '  p75: tres cuartas partes de las iteraciones terminaron por debajo. Se usa en lugar de la',
      '  media porque una pausa del recolector de basura entre decenas de miles de muestras mueve la',
      '  media y deja el p75 intacto.',
      '- **operaciones/s** — la misma cifra al revés. Se calcula desde el p75, no desde el `hz` que',
      '  imprime el runner, que deriva de la media y hereda su ruido.',
      '- **muestras** — cuántas iteraciones se midieron. Igual para cada biblioteca de la tabla, a',
      '  propósito: estos casos asignan memoria, y la recolección escala con los objetos creados y no',
      '  con el tiempo transcurrido.',
      '- **frente a este paquete** — el tiempo de esa biblioteca dividido por el de este paquete. Por',
      '  encima de 1.00x es más lenta. Lo que se traslada a otra máquina es la proporción, no los',
      '  microsegundos.',
      '- **margen / incertidumbre** — una ejecución única da `rme`, que acota la *media*, dominada por',
      '  las colas del recolector. Una repetida da cuánto puede errar la *mediana publicada*, que baja',
      '  con el número de ejecuciones completas. Esa es la cifra fiable.',
      '',
      'Compare solo dentro de una misma tabla. Una diferencia por debajo del 20 % aquí no lo es.',
    ],
  },
  pt: {
    locale: 'pt-BR',
    title: '## Comparativo com outras bibliotecas',
    date: 'Data',
    node: 'Node',
    machine: 'Máquina',
    cores: 'núcleos',
    measured: 'Medidas',
    legendHeading: '### Como ler estas tabelas',
    notAResult: '> **Não é um resultado.** Orçamentos divididos por {scale} (`--fast`). Execute de novo sem ele antes de citar qualquer número.',
    win: 'vence',
    fastestHere: '**{name}** é a mais rápida neste caso, {ratio}× à frente da seguinte.',
    legendShort: 'O significado das colunas e as regras de justiça estão em `bench/README.md`.',
    directions: '↓ menos é melhor, ↑ mais é melhor. Em ante este pacote, acima de 1.00× aquela biblioteca é mais lenta. `✓` marca a mais rápida daquela tabela, e o vencedor muda de tabela para tabela.',
    library: 'Biblioteca',
    perOp: 'por operação',
    perSec: 'operações/s',
    ratio: 'ante este pacote',
    rme: 'margem',
    spread: 'incerteza',
    samples: 'amostras',
    reproduce: 'Reproduzir',
    legend: [
      '`↓` menos é melhor, `↑` mais é melhor. Em **ante este pacote**, acima de 1.00× aquela biblioteca é mais lenta.',
      '- **por operação** — quanto leva uma única operação, em microssegundos. Menos é melhor. É o',
      '  p75: três quartos das iterações terminaram abaixo disso. Ele substitui a média porque uma',
      '  pausa do coletor de lixo entre dezenas de milhares de amostras desloca a média e não mexe',
      '  no p75.',
      '- **operações/s** — a mesma cifra invertida. Calculada a partir do p75, não do `hz` impresso',
      '  pelo runner, que vem da média e herda o ruído dela.',
      '- **amostras** — quantas iterações foram medidas. Igual para cada biblioteca da tabela, de',
      '  propósito: estes casos alocam, e a coleta acompanha os objetos criados e não o tempo.',
      '- **ante este pacote** — o tempo daquela biblioteca dividido pelo deste pacote. Acima de 1.00x',
      '  é mais lenta. O que se transfere para outra máquina é a razão, não os microssegundos.',
      '- **margem / incerteza** — uma execução única dá `rme`, que limita a *média*, dominada pelas',
      '  caudas do coletor. Uma repetida dá o quanto a *mediana publicada* pode errar, e isso cai com o',
      '  número de execuções inteiras. É nela que se deve confiar.',
      '',
      'Compare apenas dentro de uma mesma tabela. Uma diferença abaixo de cerca de 20 % não é uma.',
    ],
  },
};

function usage() {
  stdout.write(
    [
      'Render a markdown benchmark table from `vitest bench --outputJson` output.',
      '',
      'Usage:',
      '  node scripts/bench-report.mjs <results.json> [--lang en|ru|fr|zh|es|pt]',
      '',
      'Writes a boxed table to a terminal and markdown to a pipe (--markdown forces markdown), so CI gets:',
      '  node scripts/bench-report.mjs bench-results.json >> "$GITHUB_STEP_SUMMARY"',
      '',
      'Language follows the shell locale (`LANG` / `LC_ALL`); `--lang <code>` overrides it.',
      'Available: en, ru, fr, zh, es, pt. Anything else falls back to English.',
      'The numbers are identical either way — only the words change.',
      '',
    ].join('\n'),
  );
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    stdout.write(`Cannot read ${path}: ${error.message}\n`);
    exit(1);
  }
}

/** The measured competitors and their exact pins — a table without them cannot be checked. */
function competitorVersions() {
  const bench = readJson(fileURLToPath(new URL('../bench/package.json', import.meta.url)));

  return Object.entries(bench.devDependencies ?? {}).map(([name, range]) => `${name}@${range}`);
}

function environment(t) {
  const cpu = cpus()[0]?.model ?? 'unknown CPU';

  return [
    `- **${t.date}** ${new Date().toISOString().slice(0, 10)}`,
    `- **${t.node}** ${version}, **${osType()}** ${release()}`,
    `- **${t.machine}** ${cpu}, ${cpus().length} ${t.cores}, ${Math.round(totalmem() / 1e9)} GB`,
    `- **${t.measured}** ${competitorVersions().join(', ')}`,
  ];
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/**
 * How far the PUBLISHED figure — the median of the runs — can be off, as a percentage of itself.
 *
 * Not the spread of the individual runs: that is a property of the machine and does not fall as more
 * runs are added, which made the extra passes of `--precise` look like they bought nothing. The
 * median's own standard error does fall, as 1.253·σ/√n, and it is what a reader depends on.
 */
function medianUncertainty(values) {
  if (values.length < 2) {
    return 0;
  }

  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1);

  return (1.253 * Math.sqrt(variance)) / Math.sqrt(values.length);
}

/**
 * Across repeated runs the published figure is the median p75, and the trust column becomes how far
 * that figure moved between runs — which is what a reader actually needs, and what `rme` cannot
 * tell them: `rme` bounds the MEAN, and the mean here is dominated by garbage-collection tails.
 */
function renderGroup(group, t, aligned, runs) {
  const rows = group.benchmarks ?? [];
  const baseline = rows.find((row) => row.name.startsWith(BASELINE_PREFIX));
  const title = group.fullName.replace(/^.*?>\s*/, '');
  const repeated = runs > 1;

  // The winner is not the same table to table — this package takes the cases where a test touches a
   // few methods and loses the ones where it touches them all — so each table says who won it.
  const values = rows.map((row) => (repeated ? median(row.p75Runs) : row.p75));
  const best = Math.min(...values);
  const runnerUp = Math.min(...values.filter((value) => value !== best));

  const body = rows.map((row, index) => {
    const self = row === baseline;
    const fastest = values[index] === best;
    const marked = fastest ? `${row.name} ✓` : row.name;
    const name = self && !aligned ? `**${marked}**` : marked;
    const value = repeated ? median(row.p75Runs) : row.p75;
    const base = repeated ? median(baseline.p75Runs) : baseline.p75;
    const spread = repeated ? (medianUncertainty(row.p75Runs) / value) * 100 : row.rme;

    return [
      name,
      `${(value * 1000).toFixed(2)} µs`,
      Math.round(1000 / value).toLocaleString(t.locale),
      self ? '—' : `${(value / base).toFixed(2)}×`,
      `±${spread.toFixed(1)}%`,
      row.sampleCount.toLocaleString(t.locale),
    ];
  });

  // Arrows rather than a sentence under every table: eleven repetitions of the same note would be
  // noise, and the direction belongs to the column, not to the case.
  const headers = [t.library, `${t.perOp} ↓`, `${t.perSec} ↑`, t.ratio, `${repeated ? t.spread : t.rme} ↓`, t.samples];

  const winner = rows[values.indexOf(best)].name;
  const verdict = t.fastestHere.replace('{name}', winner).replace('{ratio}', (runnerUp / best).toFixed(2));
  // Green when this package won the table, red when it did not — the one thing a reader scrolling a
  // dozen tables wants to know before reading any of them. Ignored outside a terminal.
  const color = baseline && values[rows.indexOf(baseline)] === best ? 'green' : 'red';

  return [
    aligned ? `  ${paint(title, color)}` : `#### ${title}`,
    '',
    ...renderTable(headers, body, { style: aligned ? 'box' : 'markdown', indent: aligned ? '  ' : '', color: aligned ? color : undefined }),
    '',
    aligned ? `  ${paint(verdict.replace(/\*\*/g, ''), color)}` : verdict,
    '',
  ];
}

/** Fold repeated runs into one shape, keeping every run's p75 so the spread can be measured. */
function mergeRuns(paths) {
  const merged = new Map();

  for (const path of paths) {
    for (const file of readJson(path).files ?? []) {
      for (const group of file.groups ?? []) {
        const existing = merged.get(group.fullName);

        if (!existing) {
          merged.set(group.fullName, {
            ...group,
            benchmarks: group.benchmarks.map((benchmark) => ({ ...benchmark, p75Runs: [benchmark.p75] })),
          });
          continue;
        }

        for (const benchmark of group.benchmarks) {
          existing.benchmarks.find((candidate) => candidate.name === benchmark.name)?.p75Runs.push(benchmark.p75);
        }
      }
    }
  }

  return [...merged.values()];
}

function main() {
  const args = argv.slice(2);
  const positionals = [];
  // The shell's own locale is the default, so `LANG=ru_RU.UTF-8` needs no extra variable; `--lang`
  // still wins, because a CI log has to stay English whatever the machine is set to.
  let requested = env['LC_ALL'] ?? env['LANG'] ?? 'en';

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--lang') {
      requested = args[index + 1] ?? requested;
      index += 1;
    } else if (!args[index].startsWith('-')) {
      positionals.push(args[index]);
    }
  }

  // Match on the two-letter prefix, so `pt_BR.UTF-8`, `zh-Hans` and a bare `fr` all land correctly.
  const code = requested.toLowerCase().slice(0, 2);
  const lang = code in STRINGS ? code : 'en';
  const path = positionals[0];

  if (!path || args.includes('-h') || args.includes('--help')) {
    usage();
    exit(path ? 0 : 1);
  }

  const t = STRINGS[lang];
  const aligned = styleFor(stdout, args) === 'box';
  // A stray flag value arriving as a positional is the failure this catches: it used to be read as
  // a file name and reported as a missing file, which named the symptom and hid the cause.
  const stray = positionals.find((candidate) => !candidate.endsWith('.json'));

  if (stray) {
    stdout.write(`Expected a .json results file, got "${stray}". Check the flags you passed.\n`);
    exit(1);
  }

  // A shrunken run is for iterating on the benchmark, never for quoting. Say so where it cannot be
  // missed, in whichever language the report is being read.
  const scale = Number(env['BENCH_SCALE'] ?? 1) || 1;
  const warning = scale < 1 ? [t.notAResult.replace('{scale}', String(Math.round(1 / scale))), ''] : [];

  const groups = mergeRuns(positionals);

  if (groups.length === 0) {
    stdout.write('No benchmark groups in the results file.\n');
    exit(1);
  }

  const head = aligned
    ? [t.title.replace('## ', ''), '', ...environment(t).map((line) => line.replace(/\*\*/g, '').replace(/^- /, '  ')), '', `  ${t.directions.replace(/`/g, '')}`, `  ${t.legendShort.replace(/`/g, '')}`, '']
    : [t.title, '', ...environment(t), '', t.legendHeading, '', ...t.legend, ''];

  stdout.write(
    [
      ...warning,
      ...head,
      ...groups.flatMap((group) => renderGroup(group, t, aligned, positionals.length)),
      `${aligned ? '  ' : ''}${t.reproduce}: ${aligned ? '' : '`'}npm ci && npm ci --prefix bench && npm run bench:vs${aligned ? '' : '`'}`,
      '',
    ].join('\n'),
  );
}

main();
