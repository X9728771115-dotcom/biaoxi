import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';

const fontPath = fileURLToPath(new URL('../../assets/SourceHanSansSC-Regular.otf', import.meta.url));

function row(pdf, widths, cells, y, height, { merged = false, startX = 40 } = {}) {
  let x = startX;
  const columns = merged ? [widths.reduce((sum, width) => sum + width, 0)] : widths;
  for (let index = 0; index < columns.length; index++) {
    pdf.rect(x, y, columns[index], height).stroke();
    const lines = Array.isArray(cells[index]) ? cells[index] : [cells[index] || ''];
    for (let line = 0; line < lines.length; line++) {
      pdf.fontSize(9).text(lines[line], x + 5, y + 8 + line * 15, { lineBreak: false });
    }
    x += columns[index];
  }
}

// A real PDF with independently specified table cells and a row split across pages.
// Values deliberately differ from the user document; this is a structural regression fixture.
export async function contentStructurePdf() {
  const pdf = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  pdf.font(fontPath);
  pdf.fontSize(14).text('第五章 评审办法', 40, 50, { lineBreak: false });
  // Simulate the small horizontal displacement used by synthetic PDF bold layers.
  pdf.fontSize(14).text('第五章 评审办法', 40.3, 50, { lineBreak: false });
  const widths = [45, 85, 215, 40, 45, 85];
  row(pdf, widths, ['分类', '评审内容', '具体标准和要求', '分值', '主客观', '证明材料'], 300, 40);
  row(pdf, widths, ['技术评审', '系统部署', ['配置方案完整得2分；', '每处偏离扣0.5分，'], '2', '主观', '方案说明'], 340, 400);
  pdf.fontSize(9).text('第1页', 270, 810, { lineBreak: false });
  pdf.addPage();
  row(pdf, widths, ['', '', ['缺项不得分；', '需说明升级方案。'], '', '', ''], 60, 75);
  row(pdf, widths, ['商务评审', '维护业绩', ['近三年同类合同每份1分，', '最多3分；合同及验收报告。'], '3', '客观', ['合同', '验收报告']], 135, 120);
  pdf.fontSize(9).text('第2页', 270, 810, { lineBreak: false });
  pdf.addPage();
  pdf.fontSize(14).text('第二章 商务要求', 40, 50, { lineBreak: false });
  const business = [35, 35, 90, 355];
  row(pdf, business, ['序号', '性质', '要求名称', '完整要求'], 100, 35);
  row(pdf, business, ['1', '★', '交付周期', ['收到订单后25日历天', '交付验收完成。']], 135, 65);
  row(pdf, business, ['2', '★', '付款方式', ['验收合格后支付80%；', '其余20%在保修期满后支付。']], 200, 65);
  row(pdf, business, ['3', '★', '条件承诺', ['如需安装，必须提交安装承诺；', '非安装范围不适用。']], 265, 65);
  pdf.fontSize(10).text('1.供应商须提供有效许可证；不满足按无效响应处理。', 40, 380, { lineBreak: false });
  pdf.fontSize(9).text('第3页', 270, 810, { lineBreak: false });
  pdf.addPage();
  pdf.fontSize(14).text('第三章 政策适用', 40, 50, { lineBreak: false });
  row(pdf, [200, 315], ['事项', '说明'], 90, 35);
  row(pdf, [200, 315], ['投标（响应）保证⾦', '不收取保证⾦'], 125, 40);
  row(pdf, [200, 315], ['履约保证⾦', '不缴纳'], 165, 40);
  pdf.fontSize(11).text('本项⽬涉及强制采购节能产品：', 40, 280, { lineBreak: false });
  row(pdf, [45, 120, 150, 200], ['序号', '采购品目名称', '标的名称', '产品名称'], 320, 40);
  row(pdf, [45, 120, 150, 200], ['不涉及'], 360, 35, { merged: true });
  pdf.fontSize(9).text('第4页', 270, 810, { lineBreak: false });
  pdf.end();
  return done;
}

// A single connected grid changes its column scheme and has a vertical merged cell.
// The classification is deliberately printed beneath the other cells to ensure
// reading order is recovered from its borders rather than its text baseline.
export async function complexGridPdf() {
  const pdf = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  pdf.font(fontPath);
  pdf.fontSize(14).text('第六章 评审标准', 40, 50, { lineBreak: false });
  row(pdf, [130, 385], ['评审内容', '评审标准'], 90, 35);
  row(pdf, [130, 385], ['分值构成', '商务部分6分'], 125, 35);
  const widths = [45, 85, 215, 40, 45, 85];
  row(pdf, widths, ['分类', '评审内容', '具体标准和要求', '分值', '主客观', '证明材料'], 160, 35);
  pdf.rect(40, 195, widths[0], 295).stroke();
  pdf.fontSize(9).text('商务评审', 45, 430, { lineBreak: false });
  for (const [top, title, standard, score] of [
    [225, '管理体系', '具有有效体系证书得4分。', '4'],
    [325, '实施案例', '合同和验收资料齐全得2分。', '2']
  ]) {
    let x = 85;
    const cells = [title, standard, score, '客观', '材料清单'];
    for (let column = 1; column < widths.length; column++) {
      pdf.rect(x, top, widths[column], 100).stroke();
      pdf.fontSize(9).text(cells[column - 1], x + 5, top + 8, { lineBreak: false });
      x += widths[column];
    }
  }
  pdf.rect(85, 425, 470, 65).stroke();
  pdf.fontSize(9).text('-第1⻚-', 270, 810, { lineBreak: false });
  pdf.end();
  return done;
}

export async function textLayoutPdf() {
  const pdf = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  pdf.font(fontPath);
  const header = () => pdf.fontSize(9).text('示例采购文件', 40, 18, { lineBreak: false });
  const line = (text, y, x = 40) => pdf.fontSize(10).text(text, x, y, { lineBreak: false });
  header();
  line('目录', 80);
  line('废标风险识别…………7', 120);
  line('必须承诺内容…………12', 150);
  line('1', 810, 280);
  pdf.addPage();
  header();
  line('第一章 项目要求', 70);
  line('供应商应具备有效施工资质，', 110);
  line('并提供完整承诺和证明资料。', 134);
  line('1.供应商须提交授权证明，', 200);
  line('由法定代表人签署并加盖公章。', 224);
  line('第2页', 810, 280);
  pdf.addPage();
  header();
  line('第二章 附件要求', 70);
  line('施工工艺必须完整说明。', 110);
  line('报价资料应按要求提交。', 110, 43);
  line('详见附件：施工图纸.pdf', 200);
  line('第3页', 810, 280);
  pdf.end();
  return done;
}

export async function nestedGridPdf() {
  const pdf = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  pdf.font(fontPath);
  row(pdf, [35, 35, 100, 345], ['序号', '性质', '内容名称', '具体要求'], 90, 35);
  row(pdf, [35, 35, 100, 345], ['1', '★', '资料要求', '须符合以下明细：'], 125, 400);
  row(pdf, [120, 210], ['事项', '说明'], 210, 35, { startX: 220 });
  row(pdf, [120, 210], ['维护资格', '提供有效维护资质证书。'], 245, 60, { startX: 220 });
  pdf.end();
  return done;
}
