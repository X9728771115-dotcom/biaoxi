export const CATEGORIES = [
 ['entity','营业执照与经营范围'],['qualification','资质要求'],['scoring','评分细则'],['rejection','废标点'],['payment','付款方式'],['method','评审方式'],['survey','现场勘查'],['sample','样品要求'],['performance','业绩要求'],['personnel','人员要求'],['deposit','投标保证金'],['eco','节能环保与强制采购'],['consistency','前后一致性'],['commitment','必须承诺']
].map(([id,title])=>({id,title}));
export const OUTPUTS = [{id:'risks',title:'废标项清单'},{id:'scoreItems',title:'必须加分项'},{id:'commitments',title:'必须承诺内容'},{id:'conclusion',title:'投标可行性结论'}];
