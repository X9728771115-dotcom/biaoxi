// Explicit, traceable demonstration enterprise facts for eligibility tests.
// Clause/coverage review alone must not silently imply that these facts exist.
export function confirmedCompanyFixture(){
 return{id:'demonstration-company',name:'演示测试企业',records:[{id:'demo-license',type:'entity',name:'演示测试营业执照',verified:true,documentIds:['demo-license-original'],fields:{registeredName:'演示测试企业',subjectName:'演示测试企业',creditCode:'DEMONSTRATION-ONLY',evidence:[{kind:'license',documentId:'demo-license-original',verified:true}]},sources:[{documentId:'demo-license-original',blockId:'demo-license-original-b1',page:1,fileName:'演示测试营业执照.txt',quote:'企业名称：演示测试企业；营业执照：演示测试资料，仅供测试。'}]}]};
}
