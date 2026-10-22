// Dedicated extraction/UI fixtures, explicitly fictional and excluded from default data.
// Run from app: node tests/fixtures/create-extractor-fixtures.js
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

const directory = dirname(fileURLToPath(import.meta.url));
const font = join(directory, '../../assets/SourceHanSansSC-Regular.otf');
const text = await readFile(join(directory, '综合招标-测试用途.txt'), 'utf8');

async function savePdf(fileName, build) {
  const pdf = new PDFDocument({ size: 'A4', margin: 48, info: { Title: '标析测试例文（虚构）', Author: '标析软件测试' } });
  const chunks = [];
  const complete = new Promise((resolve, reject) => { pdf.on('data', chunk => chunks.push(chunk)); pdf.on('end', resolve); pdf.on('error', reject); });
  build(pdf);
  pdf.end();
  await complete;
  await writeFile(join(directory, fileName), Buffer.concat(chunks));
}

await savePdf('综合招标-测试用途.pdf', pdf => {
  pdf.font(font).fontSize(10).text(text, { lineGap: 4 });
});

GlobalFonts.registerFromPath(font, 'BiaoxiTestChinese');
const canvas = createCanvas(1800, 1450);
const context = canvas.getContext('2d');
context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
context.fillStyle = '#111111'; context.font = '44px BiaoxiTestChinese';
const lines = [
  '标析中文扫描验证（全部为虚构测试内容）',
  '',
  '投标保证金金额为 20000 元。',
  '未提交有效投标保证金的，投标无效。',
  '营业执照经营范围应包含办公家具销售。',
  '项目负责人 1 名，技术负责人 1 名。',
  '',
  '显示器为本测试文件约定的政府强制采购产品。',
  '必须提供型号匹配且在有效期内的节能认证。',
  '环境标志产品认证属于评分项，最高 5 分。',
  '',
  '验收合格并提交发票后 30 日内支付 95%。',
  '剩余 5% 质保金在质保期届满后支付。',
  '现场踏勘为自愿参加，不作为资格硬门槛。',
  '样品需要办公椅 1 件，未提供仅对应项不得分。',
  '必须提交售后服务承诺函，并签字盖章。'
];
lines.forEach((line, index) => context.fillText(line, 75, 100 + index * 74));
const image = canvas.toBuffer('image/png');
await writeFile(join(directory, '中文扫描条款-测试用途.png'), image);
await savePdf('中文扫描条款-测试用途.pdf', pdf => { pdf.image(image, 30, 30, { fit: [535, 780], align: 'center', valign: 'center' }); });
console.log('已生成虚构中文 PDF、扫描图片和扫描 PDF 测试素材。');
