import {createLegacyDocFixture,createLegacyNativeObject} from './legacy-doc-fixture.js';

// Handwritten public test material, not an extract from a submitted document.
// Distinct numbered records make loss in the beginning, middle or tail visible.
export function createPublicLongLegacyDocFixture(){
  const paragraphs=[
    '合成长文演练：SYNTH-DOC-2026-01，仅用于文件读取测试。',
    '第一章 合成项目约定',
    '资格条件：供应商须具备有效的施工资质，证明材料须另行核验。',
    '报价规则：最高限价为780000元，报价超过该限价的响应无效。',
    '工期要求：合同生效后47日历天完成验收。',
    '验收规则：完成防水试验且整改关闭后办理验收。',
    '付款条件：验收合格并完成审计后支付合同价的92%，其余8%按质保约定支付。',
    '序号\x07演练部位\x07核验事项\x07',
    'SYNTH-01\x07合成节点A\x07防水收口与排水坡度\x07',
    '第二章 连续编号的长文核验记录',
    ...Array.from({length:1400},(_,index)=>`合成核验记录${String(index+1).padStart(4,'0')}：本条为虚构的屋面巡检记录，核对示例构造的基层、搭接、固定和收口，所有责任与处理结果均由测试人员另行复核。`),
    '第三章 合成内嵌附件目录',
    '附件说明：合成甲标段图纸.pdf、合成乙标段图纸.pdf、合成技术要求.rar、合成节点说明.rar仅用于附件清点测试。',
    '全文结束核对：SYNTH-DOC-END-1400，尾部内容必须完整保留。',
  ];
  const pdfA=Buffer.from('%PDF-1.7\n% synthetic-a\n%%EOF\n');
  const pdfB=Buffer.from('%PDF-1.7\n% synthetic-b\n%%EOF\n');
  const rar=Buffer.from('Rar!\x1a\x07\x00');
  return createLegacyDocFixture({
    body:paragraphs.join('\r')+'\r',
    notes:{footnotes:'合成脚注：图纸附件未展开前，节点尺寸保持待核验。'},
    objects:[
      createLegacyNativeObject('synthetic-a.pdf',pdfA,{unicodeName:'合成甲标段图纸.pdf'}),
      createLegacyNativeObject('synthetic-b.pdf',pdfB,{unicodeName:'合成乙标段图纸.pdf'}),
      createLegacyNativeObject('synthetic-requirements.rar',rar,{unicodeName:'合成技术要求.rar'}),
      createLegacyNativeObject('synthetic-details.rar',rar,{unicodeName:'合成节点说明.rar'}),
    ],
  });
}
