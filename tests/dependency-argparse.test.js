import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow } from 'docx';
import mammoth from 'mammoth';

const require = createRequire(import.meta.url);
const mammothRequire = createRequire(require.resolve('mammoth'));
const mammothCli = join(dirname(require.resolve('mammoth/package.json')), 'bin', 'mammoth');

test('Mammoth CLI dependency does not evaluate unbounded numeric precision in help templates', () => {
  const { ArgumentParser } = mammothRequire('argparse');
  const parser = new ArgumentParser({ prog: 'synthetic-security-check', addHelp: false });
  parser.addArgument(['--value'], {
    type: 'float', defaultValue: 1, help: 'Synthetic precision %(defaultValue).101f'
  });
  let help;
  assert.doesNotThrow(() => { help = parser.formatHelp(); });
  assert.ok(help.includes('--value'));
  assert.ok(help.includes('Synthetic precision'));
});

test('Mammoth CLI keeps help and rejects unsupported output formats after dependency replacement', () => {
  const help = spawnSync(process.execPath, [mammothCli, '--help'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(help.status, 0, help.stderr);
  for (const flag of ['--output-format', '--style-map', '--output-dir']) assert.ok(help.stdout.includes(flag), flag);
  const invalid = spawnSync(process.execPath, [mammothCli, 'synthetic.docx', '--output-format', 'unsupported'], {
    encoding: 'utf8', timeout: 30000
  });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /invalid choice/i);
});

test('Mammoth library and CLI retain synthetic Chinese DOCX tables, options and output paths', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'biaoxi-dependency-docx-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, '合成 采购.docx');
  const output = join(directory, '合成 输出.html');
  const styleMap = join(directory, 'styles.map');
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: [
    new Paragraph({ text: '合成采购要求', heading: HeadingLevel.HEADING_1 }),
    new Paragraph('营业执照必须提供，保证金免缴。'),
    new Table({ rows: [new TableRow({ children: [
      new TableCell({ children: [new Paragraph('付款条件')] }),
      new TableCell({ children: [new Paragraph('验收合格后支付 90%，质保金 10%。')] })
    ] })] })
  ] }] }));
  await writeFile(input, buffer);
  await writeFile(styleMap, "p[style-name='Heading 1'] => h2:fresh\n");
  const html = (await mammoth.convertToHtml({ buffer })).value;
  assert.match(html, /<h1>合成采购要求<\/h1>/);
  assert.match(html, /<table>/);
  assert.ok(html.includes('验收合格后支付 90%，质保金 10%。'));
  const result = spawnSync(process.execPath, [
    mammothCli, input, output, '--style-map', styleMap, '--output-format', 'html'
  ], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const converted = await readFile(output, 'utf8');
  assert.match(converted, /<h2>合成采购要求<\/h2>/);
  assert.match(converted, /<table>/);
  assert.ok(converted.includes('营业执照必须提供，保证金免缴。'));
  assert.ok(converted.includes('验收合格后支付 90%，质保金 10%。'));
});
