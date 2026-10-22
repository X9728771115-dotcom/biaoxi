const {contextBridge,ipcRenderer}=require('electron');
const invoke=name=>(...args)=>ipcRenderer.invoke('biaoxi-web-chat:'+name,...args);
contextBridge.exposeInMainWorld('biaoxiWebChat',{
 open:invoke('open'),context:invoke('context'),start:invoke('start'),cancel:invoke('cancel'),inspect:invoke('inspect'),reload:invoke('reload'),bounds:invoke('bounds'),
 onState(callback){if(typeof callback!=='function')return ()=>{};const listener=(_event,state)=>callback(state);ipcRenderer.on('biaoxi-web-chat:state',listener);return ()=>ipcRenderer.removeListener('biaoxi-web-chat:state',listener);}
});
