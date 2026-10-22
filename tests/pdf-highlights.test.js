import test from 'node:test';import assert from 'node:assert/strict';import {selectSourceItems} from '../public/pdf-highlights.js';
test('PDF定位只高亮完整条款所在连续文字，不泛高亮其他评分行的共用扣分语句',()=>{
 const items=['施工组织整体设想','供应商对本工程施工组织整体设想：得7分，','发现一处不全面扣0.5分。','现场布置','现场布置合理得5分，','发现一处不全面扣0.5分。'].map(str=>({str}));
 const chosen=selectSourceItems(items,'| 施工组织整体设想 | 供应商对本工程施工组织整体设想：得7分，发现一处不全面扣0.5分。 | 7.0000 |');
 assert.deepEqual(chosen.map(x=>x.str),items.slice(1,3).map(x=>x.str));
});
test('兼容汉字和换行仍可连续定位，引用不能匹配时不伪造高亮',()=>{
 const items=[{str:'施⼯技术'},{str:'措施合理。'},{str:'其他内容'}];assert.equal(selectSourceItems(items,'施工技术措施合理。').length,2);assert.equal(selectSourceItems(items,'不存在的技术措施').length,0);
});
