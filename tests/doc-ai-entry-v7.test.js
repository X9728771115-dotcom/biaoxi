import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import * as app from '../public/app.js';
import {companyLibraryHTML} from '../public/company-view.js';

const feature=name=>{assert.equal(typeof app[name],'function',`缺少界面行为：${name}`);return app[name];};
const page=async()=>load(await readFile(new URL('../public/index.html',import.meta.url),'utf8'));

test('旧 Word 与 DOCX 都能通过上传前格式校验，其他格式仍被拒绝',()=>{
 const supported=feature('supportsUploadFile');
 for(const name of ['谈判文件.doc','谈判文件.DOC','资格.docx','工程量.xlsx','原件.pdf'])assert.equal(supported(name),true,name);
 for(const name of ['程序.exe','无后缀文件','伪装.doc.exe'])assert.equal(supported(name),false,name);
});

test('主文件、附件、证照与企业库的文件选择器都可选择 DOC',async()=>{
 const $=await page();
 for(const id of ['tender-input','attachment-input','evidence-input'])assert.ok($('#'+id).attr('accept').split(',').includes('.doc'),id);
 const library=load(companyLibraryHTML({id:'company',name:'测试企业',records:[]},{type:'all',documents:[]}));
 assert.ok(library('#company-import-input').attr('accept').split(',').includes('.doc'));
});

test('报告页面直接说明免费网页分析所在版本，按钮关联可见用法',async()=>{
 const $=await page(),button=$('#open-web-chat'),help=$('#web-chat-report-help');
 assert.match(button.text(),/豆包.*DeepSeek.*分析/);
 assert.equal(button.attr('aria-describedby'),'web-chat-report-help');
 assert.equal(help.length,1);assert.equal(help.attr('hidden'),undefined);
 assert.match(help.text(),/桌面版/);
 assert.ok(help.closest('#analysis-view').length);
});

test('浏览器禁用免费对话框时显示原因、桌面用法和 API 区别',()=>{
 const guidance=feature('webChatUsage')({available:false});
 assert.equal(guidance.disabled,true);
 assert.match(guidance.reportHelp,/浏览器版/);assert.match(guidance.reportHelp,/桌面版/);
 assert.match(guidance.reportHelp,/选择平台.*登录.*开始/);
 assert.match(guidance.reportHelp,/API/);
 assert.match(guidance.loginStatus,/浏览器版/);
});

test('桌面入口可用且说明登录后才开始，DeepSeek 异常不冒充接通',()=>{
 const guidance=feature('webChatUsage')({available:true});
 assert.equal(guidance.disabled,false);
 assert.match(guidance.reportHelp,/离线报告.*选择平台.*登录.*开始/);
 assert.match(guidance.reportHelp,/DeepSeek.*环境异常.*未打通/);
 assert.match(guidance.loginStatus,/开始.*发送/);
 assert.doesNotMatch(guidance.loginStatus,/尚待验证/);
 assert.equal(feature('webChatUsage')({available:true,busy:true}).disabled,true);
 assert.equal(feature('webChatUsage')({available:true,busy:false}).disabled,false);
});

test('DeepSeek 保留可选入口，失败任务错误仍可见',async()=>{
 const $=await page();
 assert.equal($('#web-chat-provider option[value="deepseek"]').attr('disabled'),undefined);
 assert.equal(app.jobPanelVisible({status:'failed',error:'未读取到正文'}),true);
 assert.equal($('#job-message').attr('role'),'status');
});

test('上传与设置明确区分 API 联网分析和免费网页方式',async()=>{
 const $=await page();
 assert.match($('input[name="analysis-mode"][value="online"]').parent().text(),/API/);
 assert.match($('#settings-form h2').first().text(),/API/);
 assert.match($('.web-chat-settings>div').first().text(),/桌面版/);
});
