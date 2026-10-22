import {createService} from './service.js';import {fileURLToPath} from 'node:url';
const dataDir=process.env.BIAOXI_DATA_DIR||fileURLToPath(new URL('../../.data/',import.meta.url));
const service=await createService({dataDir,port:Number(process.env.BIAOXI_PORT||43221)});console.log(`标析本地服务：${service.url}\n数据目录：${dataDir}\n浏览器模式密钥只在本次进程保存；桌面版使用系统安全存储。`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await service.close();process.exit(0);});
