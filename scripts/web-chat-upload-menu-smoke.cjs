// Hidden local fixture only. No platform account, real material or remote URL.
const {app,BrowserWindow}=require('electron');
const http=require('node:http');const assert=require('node:assert/strict');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');const {join}=require('node:path');const {tmpdir}=require('node:os');
const {createBrowserAdapter}=require('../src/desktop/web-chat-dom.cjs');
const {selectCurrentReply}=require('../src/desktop/web-chat.cjs');
let win,server,folder,failures=0;
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 try{
  folder=await mkdtemp(join(tmpdir(),'biaoxi-upload-menu-'));const file=join(folder,'匿名夹具.txt');await writeFile(file,'仅供本机上传菜单回归。');const imageFile=join(folder,'匿名图片.png');await writeFile(imageFile,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=','base64'));
  const html=`<!doctype html><meta charset="utf-8"><style>textarea,button,[role=listbox],[role=menu]{display:block}</style><button data-testid="upload_file_button">上传文件</button><div data-testid="chat_input"><textarea></textarea><div id="attachments" data-testid="attachment_area"></div></div><script>
  window.localClicks=0;window.cloudClicks=0;window.outsideClicks=0;window.outerClicks=0;window.innerClicks=0;window.pointerDowns=0;window.localPointerDowns=0;window.sendClicks=0;
  const trigger=document.querySelector('button');
  function showMenu(){const config=window.fixtureCase;if(config.noChooser)return;setTimeout(()=>{
   const menu=document.createElement('div');menu.setAttribute('role',config.menuRole||'listbox');
   if(config.cloudAncestor){menu.innerHTML='<div role="option" aria-label="选择云盘文件">选择云盘文件<span>上传文件或图片</span></div>';menu.firstElementChild.onclick=()=>window.cloudClicks++;document.body.append(menu);return;}
   if(config.delegatedCloudAncestor){menu.innerHTML='<div>选择云盘文件<span>上传文件或图片</span></div>';menu.firstElementChild.addEventListener('click',()=>window.cloudClicks++);document.body.append(menu);return;}
   if(config.nestedOptions){menu.innerHTML='<div role="option" aria-label="上传文件或图片"><div role="option"><span>上传文件或图片</span></div></div>';menu.firstElementChild.onclick=()=>window.outerClicks++;menu.firstElementChild.firstElementChild.onclick=()=>window.innerClicks++;document.body.append(menu);return;}
   const rows=config.sharedWrapper?document.createElement('div'):menu;if(config.sharedWrapper)menu.append(rows);
   for(let i=0;i<(config.cloudOnly?0:(config.duplicates||1));i++){
    const row=document.createElement('div');if(config.option)row.setAttribute('role','option');row.innerHTML='<span><span>上传文件或图片</span></span>';
    const choose=()=>{window.localClicks++;const input=document.createElement('input');input.type='file';input.hidden=true;input.onchange=()=>{
     const card=document.createElement('div'),isImage=config.imageCard&&input.files[0].name.endsWith('.png');card.dataset.testid=isImage?'attachment-image-card':config.providerCard?'attachment_file_item':'file_card';
     if(isImage){card.dataset.kind='image';card.setAttribute('role','button');card.setAttribute('aria-label',input.files[0].name);const preview=document.createElement('div');preview.dataset.testid='mdbox_image';const image=document.createElement('img');image.src=config.imageBroken?'data:image/png;base64,invalid':'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>');if(config.imagePending==='incomplete')Object.defineProperty(image,'complete',{value:false});preview.append(image);card.append(preview);for(const kind of ['loading','retry','progress'])if(config['image'+kind[0].toUpperCase()+kind.slice(1)]){const mask=document.createElement('div');mask.className=kind==='loading'?'loadingMask-fixture':kind==='retry'?'retryMask-fixture':'safe-progress';if(kind==='progress')mask.setAttribute('role','progressbar');mask.style.cssText='width:4px;height:4px;'+(config['image'+kind[0].toUpperCase()+kind.slice(1)]==='hidden'?'display:none':'');card.append(mask);}if(config.imagePending==='busy')card.setAttribute('aria-busy','true');}
     else if(config.providerCard){card.className='attachment-node-unrelatedHash';card.dataset.available=config.pending?'false':'true';const name=document.createElement('div');name.dataset.testid='message_nested_content_file_name';name.textContent=input.files[0].name;const subtitle=document.createElement('div');subtitle.dataset.testid='message_nested_content_file_subtitle';subtitle.textContent=config.readError?'读取失败':'txt ·315B';card.append(name,subtitle);}else card.textContent=input.files[0].name;
     document.querySelector('#attachments').append(card);if(config.extraCurrentCard){const extra=card.cloneNode(true);if(isImage)extra.setAttribute('aria-label','未选中的其他图片.png');else extra.querySelector('[data-testid="message_nested_content_file_name"]').textContent='未选中的其他文件.txt';document.querySelector('#attachments').append(extra);}
    };document.body.append(input);menu.remove();input.click();};
    if(config.localPointerOnly)row.onpointerdown=()=>{window.localPointerDowns++;choose();};else row.onclick=choose;rows.append(row);
   }
   const cloud=document.createElement('div');cloud.setAttribute('role','option');cloud.textContent='选择云盘文件';cloud.onclick=()=>window.cloudClicks++;rows.append(cloud);document.body.append(menu);
  },config.delay||0);}
  trigger.onclick=()=>{if(!window.fixtureCase.pointerOnly)showMenu();};trigger.onpointerdown=()=>{window.pointerDowns++;if(window.fixtureCase.pointerOnly)showMenu();};
  </script>`;
  server=http.createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const options={isAllowedURL:url=>new URL(url).origin===origin,uploadTimeoutMs:1000,chooserTimeoutMs:1000,menuPollMs:60};
  const upload=adapter=>adapter.upload({path:file,fileName:'匿名夹具.txt'},new AbortController().signal);
  const uploadImage=adapter=>adapter.upload({path:imageFile,fileName:'匿名图片.png'},new AbortController().signal);
  async function run(name,config,verify){
   await win.loadURL(origin);await win.webContents.executeJavaScript('window.fixtureCase='+JSON.stringify(config));
   if(config.proseMirror)await win.webContents.executeJavaScript(`(()=>{
    const editor=document.createElement('div');editor.className='tiptap ProseMirror';editor.contentEditable='true';editor.style.whiteSpace='pre-wrap';document.querySelector('textarea').replaceWith(editor);let rendered=false;
    editor.addEventListener('input',event=>{
     if(rendered||event.isTrusted||typeof event.data!=='string')return;rendered=true;let value=event.data;window.fixtureSourceLength=value.length;
     if(window.fixtureCase.mutate==='truncate')value=value.slice(0,-1);if(window.fixtureCase.mutate==='edit')value=value.replace('施工资质','无关资质');if(window.fixtureCase.mutate==='space')value=value.replace('A  B','A B');
     const lines=value.split('\\n');editor.replaceChildren();if(window.fixtureCase.lineBreaks){const paragraph=document.createElement('p');for(let i=0;i<lines.length;i++){if(i)paragraph.append(document.createElement('br'));paragraph.append(document.createTextNode(lines[i]));}editor.append(paragraph);}else for(const line of lines){const paragraph=document.createElement('p');if(line)paragraph.append(document.createTextNode(line));else{const br=document.createElement('br');br.className='ProseMirror-trailingBreak';paragraph.append(br);}editor.append(paragraph);}
    });
    const send=document.createElement('button');send.dataset.testid='chat_input_send_button';send.textContent='发送';send.onclick=()=>window.sendClicks++;document.body.append(send);
   })()`);
   try{await verify();assert.equal(await win.webContents.executeJavaScript('window.cloudClicks'),0,'must never click cloud drive');console.log(JSON.stringify({test:name,result:'PASS'}));}
   catch(error){failures++;console.error(JSON.stringify({test:name,result:'FAIL',message:error.message,...(config.proseMirror?{diagnostics:error.diagnostics}:{} )}));}
  }
  for(const option of [false,true])await run(option?'listbox_option_nested_label':'listbox_nonbutton_leaf_nested_label',{option},async()=>{
   await upload(createBrowserAdapter(win.webContents,'doubao',options));assert.equal(await win.webContents.executeJavaScript('window.localClicks'),1,'nested labels form one local choice');
  });
  await run('late_listbox_menu_is_polled',{option:true,delay:500},async()=>{
   await upload(createBrowserAdapter(win.webContents,'doubao',options));assert.equal(await win.webContents.executeJavaScript('window.localClicks'),1);
  });
  await run('pointerdown_trigger_uses_only_its_visible_target',{option:true,pointerOnly:true},async()=>{
   const adapter=createBrowserAdapter(win.webContents,'doubao',options);await upload(adapter);
   assert.equal(await win.webContents.executeJavaScript('window.pointerDowns'),1);
   const diagnostics=(await adapter.snapshot('diagnostics-only')).diagnostics;
   for(const [key,value] of Object.entries({menuCount:1,localChoiceCount:1,menuClicked:true,chooserReceived:true}))assert.equal(diagnostics[key],value,key);
  });
  await run('shared_wrapper_keeps_local_and_cloud_actions_separate',{sharedWrapper:true},async()=>{
   await upload(createBrowserAdapter(win.webContents,'doubao',options));assert.equal(await win.webContents.executeJavaScript('window.localClicks'),1);
  });
  await run('pointerdown_local_menu_uses_only_its_visible_target',{localPointerOnly:true},async()=>{
   const adapter=createBrowserAdapter(win.webContents,'doubao',options);await upload(adapter);assert.equal(await win.webContents.executeJavaScript('window.localClicks'),1);assert.equal(await win.webContents.executeJavaScript('window.localPointerDowns'),1);
   const chains=(await adapter.snapshot('diagnostics-only')).diagnostics.menuCandidateChains;assert.ok(chains.length>0);
   for(const chain of chains)for(const node of chain){assert.deepEqual(Object.keys(node),['tag','role','isExactLocal','ownCloudLabel','isBoundary','childrenCount']);assert.equal(typeof node.isExactLocal,'boolean');assert.equal(typeof node.ownCloudLabel,'boolean');assert.ok(Number.isInteger(node.childrenCount));}
   assert.doesNotMatch(JSON.stringify(chains),/上传文件或图片|选择云盘文件/,'candidate diagnostics contain no page labels');
  });
  await run('occluded_trigger_does_not_click_another_target',{option:true},async()=>{
   await win.webContents.executeJavaScript(`(()=>{const rect=document.querySelector('button').getBoundingClientRect(),overlay=document.createElement('div');overlay.style.cssText='position:fixed;z-index:99999;background:white;left:'+rect.left+'px;top:'+rect.top+'px;width:'+rect.width+'px;height:'+rect.height+'px';overlay.onpointerdown=()=>window.outsideClicks++;document.body.append(overlay);})()`);
   await assert.rejects(upload(createBrowserAdapter(win.webContents,'doubao',options)),/遮挡|目标|位置/);assert.equal(await win.webContents.executeJavaScript('window.outsideClicks'),0);
  });
  await run('multiple_local_choices_are_rejected',{option:true,duplicates:2},async()=>{
   await assert.rejects(upload(createBrowserAdapter(win.webContents,'doubao',options)),/多个|唯一/);assert.equal(await win.webContents.executeJavaScript('window.localClicks'),0);
  });
  await run('cloud_only_menu_never_uses_an_outside_label',{cloudOnly:true},async()=>{
   await win.webContents.executeJavaScript(`(()=>{const outside=document.createElement('button');outside.textContent='上传文件或图片';outside.onclick=()=>window.outsideClicks++;document.body.append(outside);})()`);
   await assert.rejects(upload(createBrowserAdapter(win.webContents,'doubao',options)),error=>error.code==='WEB_CHAT_CHOOSER_NOT_OPENED');assert.equal(await win.webContents.executeJavaScript('window.outsideClicks'),0);
  });
  await run('cloud_option_ancestor_cannot_be_activated_by_a_local_label',{cloudAncestor:true},async()=>{
   await assert.rejects(upload(createBrowserAdapter(win.webContents,'doubao',options)),error=>error.code==='WEB_CHAT_CHOOSER_NOT_OPENED');assert.equal(await win.webContents.executeJavaScript('window.cloudClicks'),0);
  });
  await run('cloud_ancestor_with_delegated_listener_cannot_be_activated',{delegatedCloudAncestor:true},async()=>{
   await assert.rejects(upload(createBrowserAdapter(win.webContents,'doubao',options)),error=>error.code==='WEB_CHAT_CHOOSER_NOT_OPENED');assert.equal(await win.webContents.executeJavaScript('window.cloudClicks'),0);
  });
  await run('nested_clickable_options_are_ambiguous',{nestedOptions:true},async()=>{
   try{await assert.rejects(upload(createBrowserAdapter(win.webContents,'doubao',options)),/嵌套|多个|歧义/);}
   finally{assert.equal(await win.webContents.executeJavaScript('window.innerClicks'),0);assert.equal(await win.webContents.executeJavaScript('window.outerClicks'),0);}
  });
  await run('chooser_absent_has_distinct_error',{noChooser:true},async()=>{
   const adapter=createBrowserAdapter(win.webContents,'doubao',options);await adapter.inspect();adapter.reset();
   await assert.rejects(upload(adapter),error=>error.code==='WEB_CHAT_CHOOSER_NOT_OPENED'&&/未打开/.test(error.message)&&/菜单\s*0.*本地项\s*0/.test(error.message)&&error.diagnostics?.menuCount===0&&error.diagnostics?.localChoiceCount===0&&error.diagnostics?.menuClicked===false&&error.diagnostics?.chooserReceived===false&&error.diagnostics?.editorCount===1&&error.diagnostics?.uploadCount===1);
  });
  await run('provider_receipt_is_scoped_to_current_input_not_history',{providerCard:true},async()=>{
   await win.webContents.executeJavaScript(`(()=>{const history=document.createElement('article');history.innerHTML='<div data-testid="attachment_area"><div data-testid="attachment_file_item" data-available="true"><div data-testid="message_nested_content_file_name">匿名夹具.txt</div><div data-testid="message_nested_content_file_subtitle">读取失败</div></div></div>';document.body.prepend(history);})()`);
   const adapter=createBrowserAdapter(win.webContents,'doubao',options);assert.equal((await adapter.inspect()).diagnostics.attachmentCount,0);await upload(adapter);assert.equal((await adapter.snapshot('receipt-check')).diagnostics.attachmentCount,1);
  });
  await run('provider_multiple_current_cards_reject_an_unselected_file',{providerCard:true,extraCurrentCard:true},async()=>{
   await assert.rejects(upload(createBrowserAdapter(win.webContents,'doubao',options)),/附件集合发生变化/);
  });
  await run('provider_selected_files_keep_two_distinct_current_receipts',{providerCard:true},async()=>{
   const adapter=createBrowserAdapter(win.webContents,'doubao',options);await upload(adapter);const second=join(folder,'匿名附件二.txt');await writeFile(second,'本机连续上传夹具。');await adapter.upload({path:second,fileName:'匿名附件二.txt'},new AbortController().signal);assert.equal((await adapter.snapshot('receipt-check')).diagnostics.attachmentCount,2);
  });
  await run('provider_unavailable_card_remains_pending_without_text_marker',{providerCard:true,pending:true},async()=>{
   await assert.rejects(upload(createBrowserAdapter(win.webContents,'doubao',options)),/未确认.*上传并处理完成/);
  });
  await run('provider_card_read_failure_stops_upload',{providerCard:true,readError:true},async()=>{
   await assert.rejects(upload(createBrowserAdapter(win.webContents,'doubao',options)),/附件卡片提示上传或处理失败/);
  });
  await run('provider_loaded_image_uses_exact_aria_name_only_in_current_input',{imageCard:true},async()=>{
   await win.webContents.executeJavaScript(`document.body.insertAdjacentHTML('afterbegin','<article><div data-testid="attachment_area"><div data-testid="attachment-image-card" data-kind="image" role="button" aria-label="匿名图片.png"><div data-testid="mdbox_image"></div><div class="retryMask-history" style="width:4px;height:4px"></div></div></div></article>')`);const adapter=createBrowserAdapter(win.webContents,'doubao',options);assert.equal((await adapter.inspect()).diagnostics.attachmentCount,0);await uploadImage(adapter);assert.equal((await adapter.snapshot('image-receipt')).diagnostics.attachmentCount,1);
  });
  await run('provider_selected_file_then_image_keep_two_receipts',{providerCard:true,imageCard:true},async()=>{
   const adapter=createBrowserAdapter(win.webContents,'doubao',options);await upload(adapter);await uploadImage(adapter);assert.equal((await adapter.snapshot('image-receipt')).diagnostics.attachmentCount,2);
  });
  await run('provider_extra_current_image_is_rejected',{imageCard:true,extraCurrentCard:true},async()=>{
   await assert.rejects(uploadImage(createBrowserAdapter(win.webContents,'doubao',options)),/附件集合发生变化/);
  });
  for(const imagePending of ['incomplete','busy'])await run('provider_image_'+imagePending+'_stays_pending',{imageCard:true,imagePending},async()=>{
   await assert.rejects(uploadImage(createBrowserAdapter(win.webContents,'doubao',options)),/未确认.*上传并处理完成/);
  });
  for(const kind of ['Loading','Progress'])await run('provider_image_visible_'+kind.toLowerCase()+'_stays_pending',{imageCard:true,['image'+kind]:true},async()=>{
   await assert.rejects(uploadImage(createBrowserAdapter(win.webContents,'doubao',options)),/未确认.*上传并处理完成/);
  });
  await run('provider_image_hidden_loading_and_progress_do_not_block_loaded_receipt',{imageCard:true,imageLoading:'hidden',imageProgress:'hidden'},async()=>{
   await uploadImage(createBrowserAdapter(win.webContents,'doubao',options));
  });
  for(const condition of ['imageRetry','imageBroken'])await run('provider_image_'+condition+'_fails_closed',{imageCard:true,[condition]:true},async()=>{
   await assert.rejects(uploadImage(createBrowserAdapter(win.webContents,'doubao',options)),/附件卡片提示上传或处理失败/);
  });
  const prompt='请逐项核验 REQ:prose-mirror\n项目：屋面工程\n\n资格：施工资质\n空格应保留：A  B\n尾行\n';
  for(const lineBreaks of [false,true])await run(lineBreaks?'prosemirror_hard_breaks_preserve_exact_prompt':'prosemirror_paragraph_layout_preserves_exact_prompt',{providerCard:true,proseMirror:true,lineBreaks},async()=>{
   const adapter=createBrowserAdapter(win.webContents,'doubao',options);await upload(adapter);await adapter.submit(prompt,'prose-mirror',new AbortController().signal);assert.equal(await win.webContents.executeJavaScript('window.fixtureSourceLength'),prompt.length);assert.equal(await win.webContents.executeJavaScript('window.sendClicks'),1);
  });
  for(const mutate of ['truncate','edit','space'])await run('prosemirror_'+mutate+'_still_rejects_with_numeric_difference',{providerCard:true,proseMirror:true,mutate},async()=>{
   const adapter=createBrowserAdapter(win.webContents,'doubao',options);await upload(adapter);await assert.rejects(adapter.submit(prompt,'prose-mirror',new AbortController().signal),error=>{assert.match(error.message,/内容与本次分析要求不一致/);const d=error.diagnostics,expectedDifference=mutate==='truncate'?prompt.length-1:mutate==='edit'?prompt.indexOf('施工资质'):prompt.indexOf('A  B')+2;assert.equal(d.editorExpectedLength,prompt.length);assert.equal(d.editorActualLength,prompt.length-(mutate==='edit'?0:1));assert.equal(d.editorFirstDifferenceIndex,expectedDifference);assert.ok(Number.isInteger(d.editorRenderedLength));assert.doesNotMatch(JSON.stringify(d),/施工资质|无关资质|屋面工程|请逐项核验/);return true;});assert.equal(await win.webContents.executeJavaScript('window.fixtureSourceLength'),prompt.length);assert.equal(await win.webContents.executeJavaScript('window.sendClicks'),0);
  });
  const replyRequest='provider-reply-1',replyJSON=JSON.stringify({requestId:replyRequest,categories:[],outputs:{}});
  const addMessage=(role,content,{streaming=false,copy=false}={})=>win.webContents.executeJavaScript(`(()=>{const article=document.querySelector('#message-thread')||document.body.appendChild(Object.assign(document.createElement('article'),{id:'message-thread'}));const message=document.createElement('div');message.dataset.testid=${JSON.stringify(role==='assistant'?'receive_message':'send_message')};message.dataset.messageRole=${JSON.stringify(role)};const body=document.createElement('div');body.dataset.testid='message_text_content';body.className='md-box-root';body.dataset.streaming=${JSON.stringify(String(streaming))};body.textContent=${JSON.stringify(content)};message.append(body);if(${copy}){const bar=document.createElement('div');bar.dataset.testid='message_action_bar';const button=document.createElement('button');button.dataset.testid='message_action_copy';button.innerHTML='<svg width="12" height="12"></svg>';bar.append(button);message.append(bar);}article.append(message);})()`);
  await run('provider_completed_reply_uses_fixed_role_content_and_own_action_bar',{},async()=>{
   const adapter=createBrowserAdapter(win.webContents,'doubao',options);await addMessage('assistant','旧回答',{copy:true});const baseline=await adapter.snapshot(replyRequest);await addMessage('user','请核验 '+replyRequest);await addMessage('assistant',replyJSON,{copy:true});const snapshot=await adapter.snapshot(replyRequest);assert.equal(snapshot.markerSeen,true);assert.deepEqual(snapshot.answers,[replyJSON]);assert.equal(snapshot.completionVisible,true);assert.equal(selectCurrentReply(baseline,snapshot,replyRequest),replyJSON);
  });
  await run('provider_streaming_true_overrides_copy_and_false_alone_is_incomplete',{},async()=>{
   const adapter=createBrowserAdapter(win.webContents,'doubao',options),baseline=await adapter.snapshot(replyRequest);await addMessage('user',replyRequest);await addMessage('assistant',replyJSON,{streaming:true,copy:true});let snapshot=await adapter.snapshot(replyRequest);assert.equal(snapshot.generating,true);assert.equal(selectCurrentReply(baseline,snapshot,replyRequest),null);
   await win.webContents.executeJavaScript(`document.querySelector('[data-testid="receive_message"] [data-testid="message_text_content"]').dataset.streaming='false';document.querySelector('[data-testid="message_action_bar"]').remove()`);snapshot=await adapter.snapshot(replyRequest);assert.equal(snapshot.generating,false);assert.equal(snapshot.completionVisible,false);assert.equal(selectCurrentReply(baseline,snapshot,replyRequest),null);
  });
  await run('provider_nested_markdown_uses_message_role_and_ancestor_streaming',{},async()=>{
   const adapter=createBrowserAdapter(win.webContents,'doubao',options),baseline=await adapter.snapshot(replyRequest);await addMessage('user',replyRequest);await addMessage('assistant',replyJSON,{streaming:true,copy:true});await win.webContents.executeJavaScript(`(()=>{const body=document.querySelector('[data-testid="receive_message"] [data-testid="message_text_content"]'),value=body.textContent;body.innerHTML='<article><div class="flow-markdown-body"></div></article>';body.querySelector('.flow-markdown-body').textContent=value;})()`);let snapshot=await adapter.snapshot(replyRequest);assert.equal(snapshot.generating,true);assert.equal(selectCurrentReply(baseline,snapshot,replyRequest),null);
   await win.webContents.executeJavaScript(`document.querySelector('[data-testid="receive_message"] [data-testid="message_text_content"]').dataset.streaming='false'`);snapshot=await adapter.snapshot(replyRequest);assert.equal(snapshot.generating,false);assert.equal(snapshot.completionVisible,true);assert.equal(selectCurrentReply(baseline,snapshot,replyRequest),replyJSON);
  });
  await run('provider_sibling_old_copy_does_not_complete_latest_answer',{},async()=>{
   const adapter=createBrowserAdapter(win.webContents,'doubao',options);await addMessage('assistant','旧回答 '+replyRequest,{copy:true});const baseline=await adapter.snapshot(replyRequest);await addMessage('user',replyRequest);await addMessage('assistant',replyJSON);const snapshot=await adapter.snapshot(replyRequest);assert.equal(snapshot.answers.length,1);assert.equal(snapshot.completionVisible,false);assert.equal(selectCurrentReply(baseline,snapshot,replyRequest),null);
  });
  await run('provider_reply_still_requires_current_request_id',{},async()=>{
   const adapter=createBrowserAdapter(win.webContents,'doubao',options),baseline=await adapter.snapshot(replyRequest);await addMessage('user',replyRequest);await addMessage('assistant',JSON.stringify({requestId:'different-request'}),{copy:true});const snapshot=await adapter.snapshot(replyRequest);assert.equal(snapshot.markerSeen,true);assert.equal(snapshot.completionVisible,true);assert.equal(snapshot.answers.length,1);assert.equal(selectCurrentReply(baseline,snapshot,replyRequest),null);
  });
  await run('provider_answer_cannot_supply_its_own_user_marker',{},async()=>{
   const adapter=createBrowserAdapter(win.webContents,'doubao',options),baseline=await adapter.snapshot(replyRequest);await addMessage('assistant',replyJSON,{copy:true});const snapshot=await adapter.snapshot(replyRequest);assert.equal(snapshot.markerSeen,false);assert.equal(selectCurrentReply(baseline,snapshot,replyRequest),null);
  });
  await run('provider_editor_and_user_content_are_excluded_from_answers_and_markers',{},async()=>{
   await win.webContents.executeJavaScript(`(()=>{const editor=document.createElement('div');editor.className='tiptap ProseMirror';editor.contentEditable='true';editor.innerHTML='<div data-testid="message_text_content"><span class="flow-markdown-body">${replyRequest}</span></div>';document.querySelector('textarea').replaceWith(editor);})()`);const adapter=createBrowserAdapter(win.webContents,'doubao',options);let snapshot=await adapter.snapshot(replyRequest);assert.equal(snapshot.markerSeen,false);assert.deepEqual(snapshot.answers,[]);
   await addMessage('user',replyRequest);await win.webContents.executeJavaScript(`document.querySelector('[data-testid="send_message"] [data-testid="message_text_content"]').classList.add('flow-markdown-body')`);snapshot=await adapter.snapshot(replyRequest);assert.equal(snapshot.markerSeen,true);assert.deepEqual(snapshot.answers,[]);
  });
  await run('chooser_without_target_has_distinct_error',{option:true},async()=>{
   const real=win.webContents.debugger,listeners=new Map();
   const debuggerAPI={isAttached:()=>real.isAttached(),attach:version=>real.attach(version),detach:()=>real.detach(),sendCommand:(...args)=>real.sendCommand(...args),on(name,listener){const wrapped=(event,method,params)=>listener(event,method,method==='Page.fileChooserOpened'?{...params,backendNodeId:undefined}:params);listeners.set(listener,wrapped);real.on(name,wrapped);},removeListener(name,listener){real.removeListener(name,listeners.get(listener));listeners.delete(listener);}};
   const wrapped={isDestroyed:()=>win.webContents.isDestroyed(),getURL:()=>win.webContents.getURL(),executeJavaScript:(...args)=>win.webContents.executeJavaScript(...args),focus:()=>win.webContents.focus(),sendInputEvent:event=>win.webContents.sendInputEvent(event),debugger:debuggerAPI};
   await assert.rejects(upload(createBrowserAdapter(wrapped,'doubao',options)),error=>error.code==='WEB_CHAT_CHOOSER_TARGET_MISSING'&&/已打开.*目标/.test(error.message));
   assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll("[data-testid=file_card]").length'),0);
  });
  console.log(JSON.stringify({result:failures?'FAIL':'PASS',failures,scope:'local fixture only',realProvider:'NOT_RUN'}));
 }catch(error){failures++;console.error(error.stack);}
 finally{if(win&&!win.isDestroyed())win.destroy();if(server)await new Promise(resolve=>server.close(resolve));if(folder)await rm(folder,{recursive:true,force:true});app.exit(failures?1:0);}
});
