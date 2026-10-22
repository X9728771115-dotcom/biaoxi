const {allowedProviderURL}=require('./web-chat.cjs');
const {stat}=require('node:fs/promises');
// These DOM profiles are experimental. A missing or ambiguous control fails closed;
// the profiles do not imply that logged-in real-provider operation has been verified.
const profiles={
 doubao:{qualityMode:'expert',editor:['div.tiptap.ProseMirror[contenteditable="true"]','textarea'],upload:['button[data-testid="upload_file_button"]'],send:['button[data-testid="send_button"]','button[data-testid="chat_input_send_button"]','button[aria-label="发送"]'],assistant:['[data-testid="receive_message"][data-message-role="assistant"] [data-testid="message_text_content"]','[data-message-author-role="assistant"] .flow-markdown-body','[data-role="assistant"] .flow-markdown-body','[data-testid="message_block"][data-role="assistant"]','div.flow-markdown-body'],user:['[data-message-author-role="user"]','[data-role="user"]','[data-testid="message_text_content"]'],attachments:['[data-testid="chat_input"] [data-testid="attachment_area"] [data-testid="attachment_file_item"]','[data-testid="chat_input"] [data-testid="attachment_area"] [data-testid="attachment-image-card"][data-kind="image"][role="button"]','[data-testid="file_card"]','[data-testid="attachment_item"]','[data-testid*="file-card"]','[class*="file-card"]','[class*="fileCard"]']},
 deepseek:{environmentRisk:true,editor:['textarea#chat-input','textarea[placeholder*="DeepSeek"]','textarea[placeholder*="发送"]','textarea'],upload:['button[aria-label="上传文件"]','button[title="上传文件"]','[data-testid="upload_file_button"]'],send:['button[aria-label="发送"]','button[title="发送"]','[data-testid="send_button"]'],assistant:['[data-message-author-role="assistant"] .ds-markdown','[data-role="assistant"] .ds-markdown','.ds-markdown'],user:['[data-message-author-role="user"]','[data-role="user"]','.fbb737a4'],attachments:['[data-testid="file_card"]','[data-testid="attachment_item"]','[class*="file-card"]','[class*="fileCard"]']}
};

function inspectDOM(profile,action,payload){
 const visible=node=>!!node&&!node.hidden&&node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden';
 const all=selectors=>[...new Set(selectors.flatMap(selector=>[...document.querySelectorAll(selector)]))].filter(visible);
 const enabled=node=>visible(node)&&!node.disabled&&node.getAttribute('aria-disabled')!=='true';
 const text=node=>(node.innerText||node.textContent||'').slice(0,1024*1024);
 const labels=node=>[...new Set([node.getAttribute('aria-label'),node.getAttribute('title'),text(node)].filter(Boolean).map(value=>value.replace(/\s+/g,' ').trim()))];
 const label=node=>labels(node).join(' ');
 const buttons=()=>[...document.querySelectorAll('button,[role="button"]')].filter(enabled);
 const buttonMatches=(selectors,pattern)=>{const direct=all(selectors).filter(enabled);return direct.length?direct:buttons().filter(node=>labels(node).some(value=>pattern.test(value)));};
 const exactButton=(selectors,pattern)=>{const matches=buttonMatches(selectors,pattern);return matches.length===1?matches[0]:null;};
 const editors=all(profile.editor).filter(enabled);const editor=editors.length===1?editors[0]:null;
 const uploadMatches=buttonMatches(profile.upload,/^(?:上传文件|添加附件|添加文件|Attach files?|Upload files?)$/i),upload=uploadMatches.length===1?uploadMatches[0]:null;
 const sendMatches=buttonMatches(profile.send,/^(?:发送|发送消息|Send|Send message)$/i),send=sendMatches.length===1?sendMatches[0]:null;
 const stop=exactButton(['button[data-testid="stop_button"]','button[aria-label="停止生成"]','button[title="停止生成"]','button[aria-label="Stop generating"]'],/^(?:停止生成|停止回答|Stop generating)$/i);
 const alerts=all(['[role="alert"]','[role="dialog"]','[data-testid*="error"]']);
 const cardNodes=all(profile.attachments).filter(node=>!node.matches('[data-testid="attachment-image-card"]')||!!node.closest('[data-testid="chat_input"] [data-testid="attachment_area"]'));const cards=cardNodes.filter(node=>!cardNodes.some(other=>other!==node&&other.contains(node)));
 const isImageCard=node=>node.matches('[data-testid="attachment-image-card"][data-kind="image"][role="button"]');
 const imageReceipt=node=>{
  const parts=[node,...node.querySelectorAll('*')].filter(visible),images=[...node.querySelectorAll('[data-testid="mdbox_image"] img')];
  const mask=prefix=>parts.some(part=>[...part.classList].some(value=>value.startsWith(prefix)));
  return {error:mask('retryMask-')||images.some(image=>image.complete&&(!image.naturalWidth||!image.naturalHeight)),pending:!images.length||images.some(image=>!image.complete)||mask('loadingMask-')||parts.some(part=>part.getAttribute('role')==='progressbar'||part.getAttribute('aria-busy')==='true')};
 };
 const fileReceipt=name=>{
  const nameMatches=node=>[node,...node.querySelectorAll('[data-testid="message_nested_content_file_name"],[title],[data-filename],span,p,div')].some(part=>part.getAttribute('title')===name||part.getAttribute('data-filename')===name||(part.textContent||'').trim()===name);
  const found=cards.filter(node=>isImageCard(node)?node.getAttribute('aria-label')===name:nameMatches(node));
  const failed=cards.some(node=>isImageCard(node)&&imageReceipt(node).error||/上传失败|解析失败|处理失败|读取失败|无法读取|文件过大|不支持|upload failed|unsupported file|error/i.test(text(node)));
  const pending=found.some(node=>isImageCard(node)?imageReceipt(node).pending:node.matches('[data-testid="attachment_file_item"]')&&node.getAttribute('data-available')!=='true'||/上传中|解析中|处理中|uploading|processing/i.test(text(node))||node.querySelector('[role="progressbar"],[aria-busy="true"]'));
  return {found:found.length>0,count:found.length,totalCount:cards.length,pending,error:failed};
 };
 const alertText=alerts.map(text).join('\n').slice(0,10000);
 // Match only the observed, visible DeepSeek modal. Quoted conversation text
 // and title/body nodes owned by different dialogs are not platform warnings.
 const riskVisible=node=>{
  if(!visible(node)||node.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
  for(let parent=node;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0')return false;}
  return true;
 };
 const riskDialog='div.ds-modal-content.ds-elevated[role="dialog"]';
 const environmentRisk=profile.environmentRisk===true&&all(['div.ds-modal[aria-modal="true"]']).some(modal=>riskVisible(modal)&&[...modal.querySelectorAll(riskDialog)].some(dialog=>riskVisible(dialog)&&dialog.closest('div.ds-modal[aria-modal="true"]')===modal&&[...dialog.querySelectorAll('.ds-modal-content__title')].some(title=>riskVisible(title)&&title.closest('[role="dialog"]')===dialog&&text(title).trim()==='使用环境异常')&&[...dialog.querySelectorAll('.ds-modal-content__main')].some(body=>riskVisible(body)&&body.closest('[role="dialog"]')===dialog&&text(body).includes('当前页面的使用环境可能存在数据和隐私泄露风险，为保障安全，建议您使用我们的官方产品。'))));
 const captcha=all(['iframe[src*="captcha"]','[id*="captcha"]','[class*="captcha"]']).length>0||/完成验证|滑块验证|安全验证|人机验证|verify you are human/i.test(alertText);
 const loginInputs=all(['input[placeholder*="手机号"]','input[type="password"]','input[placeholder*="验证码"]']);
 const loginButtons=buttons().filter(node=>labels(node).some(value=>/^(?:登录|立即登录|登录或注册|Sign in|Log in)$/i.test(value)));
 const needsLogin=/\/(?:sign_in|login)(?:[/?#]|$)/.test(location.href)||loginInputs.length>0||loginButtons.length>0||(!editor&&/登录|sign in/i.test(alertText));
 const quota=/额度.{0,8}(?:不足|用完)|次数.{0,8}(?:上限|用完)|稍后再试|Too many requests|rate limit/i.test(alertText);
 const error=/上传失败|文件.{0,10}(?:无法|不支持|超过)|upload failed|unsupported file/i.test(alertText);
 let blocked=environmentRisk?{stage:'environment-risk',message:'平台提示当前使用环境受限，已停止网页分析；请按平台提示使用官方产品。'}:captcha?{stage:'captcha',message:'请在平台网页内完成安全验证，然后重新开始。'}:needsLogin?{stage:'login',message:'请在下方平台网页内登录你的账号，再点击检查登录。'}:quota?{stage:'quota',message:'平台提示额度或频率限制，请按网页提示处理。'}:error?{stage:'upload-error',message:'平台提示文件上传错误，已停止发送。'}:null;
 // Counts and readiness are safe to show locally. Never include page text,
 // account names, cookies, conversation contents or local paths in diagnostics.
 const diagnostics={documentReady:document.readyState,editorCount:editors.length,uploadCount:uploadMatches.length,sendCount:sendMatches.length,attachmentCount:cards.length,generating:!!stop,environmentRisk,authentication:blocked?'blocked':'unconfirmed'};
 const fail=message=>{throw Object.assign(new Error(message),{diagnostics});};
 const clickTarget=(node,name)=>{
  const rect=node.getBoundingClientRect(),left=Math.max(0,rect.left),top=Math.max(0,rect.top),right=Math.min(innerWidth,rect.right),bottom=Math.min(innerHeight,rect.bottom);
  if(right-left<2||bottom-top<2)fail(`唯一${name}没有可点击的可见位置，停止操作。`);
  const point={x:Math.floor((left+right)/2),y:Math.floor((top+bottom)/2)},hit=document.elementFromPoint(point.x,point.y);
  if(hit!==node&&!node.contains(hit))fail(`唯一${name}被其他目标遮挡，停止操作。`);
  return {point,rect:{x:left,y:top,width:right-left,height:bottom-top}};
 };
 if(action==='diagnostics')return diagnostics;
 if(action==='inspect'){
  if(blocked)return {...blocked,ready:false,diagnostics};
  if(editor&&('value' in editor?editor.value:editor.innerText).trim())return {ready:false,stage:'draft',message:'输入框中有未发送的草稿，请先自行处理，标析不会覆盖草稿。',diagnostics};
  if(cards.length)return {ready:false,stage:'attachments',message:'当前输入区已有附件，请先移除或在平台内新建对话，再开始本次文件分析。',diagnostics};
  return {ready:!!editor&&!!upload,stage:editor&&upload?'ready':'unsupported',diagnostics,message:editor&&upload?'已找到唯一聊天输入与上传入口；这只表示控件可用，登录及本次上传仍需平台实际确认。':`当前页面未找到唯一可用控件（输入框 ${editors.length} 个，上传入口 ${uploadMatches.length} 个）。请先登录；已登录时需核对平台页面适配。`};
 }
 if(action==='snapshot'){
  if(environmentRisk)return {...blocked,assistantIds:[],answers:[],markerSeen:false,markerAfterBaseline:false,generating:!!stop,completionVisible:false,diagnostics};
  const assistantRole='[data-message-author-role="assistant"],[data-role="assistant"],[data-message-role="assistant"]',userRole='[data-message-author-role="user"],[data-role="user"],[data-message-role="user"]';
  const touchesEditor=node=>editors.some(input=>node===input||input.contains(node)||node.contains(input));
  const candidates=all(profile.assistant).filter(node=>!touchesEditor(node)&&!node.closest(userRole));
  // Prefer message content over a legacy whole-message match (which includes
  // action buttons), then retain the outer content root so nested markdown does
  // not discard preceding text. Several sibling roots may belong to one reply.
  const content=candidates.filter(node=>!node.matches('[data-testid="message_block"][data-role="assistant"]')||!candidates.some(other=>other!==node&&node.contains(other)));
  const nodes=content.filter(node=>!content.some(other=>other!==node&&other.contains(node))).sort((a,b)=>a===b?0:a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
  const users=all([...profile.user,userRole]).filter(node=>!touchesEditor(node)&&!node.closest(assistantRole)&&!nodes.some(answer=>answer===node||answer.contains(node)||node.contains(answer)));
  const marker=users.find(node=>text(node).includes(payload.requestId));
  const groups=[];
  for(const node of nodes){
   // Only an explicit assistant owner can join fragments. Unknown wrappers keep
   // their own identity; unrelated messages and old tasks are never concatenated.
   const owner=node.closest(assistantRole)||node;let group=groups.find(item=>item.owner===owner);
   if(!group){group={owner,parts:[]};groups.push(group);}group.parts.push(node);
  }
  const current=marker?groups.filter(group=>!!(marker.compareDocumentPosition(group.owner)&Node.DOCUMENT_POSITION_FOLLOWING)):groups;
  const cache=globalThis.__biaoxiChatNodeIds||(globalThis.__biaoxiChatNodeIds={nodes:new WeakMap(),next:1,epoch:Math.random().toString(36).slice(2)});
  const id=node=>{if(!cache.nodes.has(node))cache.nodes.set(node,cache.epoch+':'+cache.next++);return cache.nodes.get(node);};
  const replyText=group=>group.parts.map(node=>node.innerText||node.textContent||'').join('\n');
  if(current.some(group=>replyText(group).length>1024*1024))return {stage:'oversized',message:'平台回答过长，未静默截断或保存，请在平台查看。',assistantIds:[],answers:[],diagnostics};
  const answers=current.slice(-20).map(replyText),last=current.at(-1)?.owner,messageRoles=assistantRole+','+userRole,container=last?.closest(messageRoles)||last?.closest('[data-testid="message_block"],article')||last?.parentElement;
  const belongsToCurrent=node=>{const owner=node.closest(messageRoles);return !owner||owner===container;};
  const fixedCopy=container&&[...container.querySelectorAll('[data-testid="message_action_bar"] button[data-testid="message_action_copy"]')].some(node=>enabled(node)&&belongsToCurrent(node));
  const legacyCompletion=container&&[...container.querySelectorAll('button,[role="button"]')].some(node=>enabled(node)&&belongsToCurrent(node)&&/复制|copy|重新生成|regenerate/i.test(label(node)));
  const streaming=current.some(group=>group.owner.getAttribute('data-streaming')==='true'||group.parts.some(node=>node.getAttribute('data-streaming')==='true'||node.closest('[data-testid="message_text_content"][data-streaming="true"]')||node.querySelector('[data-streaming="true"]')));
  const generating=!!stop||streaming,completion=!generating&&!!(fixedCopy||legacyCompletion);
  const hasLaterUser=!!last&&users.some(node=>{const owner=node.closest(userRole)||node;return !last.contains(owner)&&!owner.contains(last)&&!!(last.compareDocumentPosition(owner)&Node.DOCUMENT_POSITION_FOLLOWING);});
  const snapshot={assistantIds:current.slice(-20).map(group=>id(group.owner)),answers,markerSeen:!!marker,markerAfterBaseline:!!marker,hasLaterUser,generating,completionVisible:completion,...blocked,diagnostics:{...diagnostics,generating,assistantCount:current.length,markerSeen:!!marker,completionVisible:completion}};
  // Doubao may return its actual office-quota restriction as an assistant turn,
  // outside alerts/dialogs and without our requestId. Match only the observed
  // complete short notice after this task's latest user turn, never quotations.
  const precedingUsers=last?[...new Set(users.map(node=>node.closest(userRole)||node))].filter(node=>!node.contains(last)&&!last.contains(node)&&!!(node.compareDocumentPosition(last)&Node.DOCUMENT_POSITION_FOLLOWING)).sort((a,b)=>a===b?0:a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1):[];
  const latestUser=precedingUsers.at(-1),latest=current.at(-1),noticeParts=latest?.parts.filter(riskVisible)||[],raw=noticeParts.map(node=>node.innerText||node.textContent||'').join('\n');
  const hiddenText=raw.length<=600&&noticeParts.some(node=>[...node.querySelectorAll('*')].some(part=>!riskVisible(part)&&text(part).trim()));
  const quoted=noticeParts.some(node=>node.matches('blockquote,q,pre,code')||node.closest('blockquote,q,pre,code')||node.querySelector('blockquote,q,pre,code'));
  const officeNotice=/^近[1-9]\d?天办公能力的免费额度用完了，我得休息一阵子了，预计\d{1,2}月\d{1,2}日\d{1,2}[:：]\d{2}恢复为你服务，到时我再接着帮你。开通豆包订阅，免等待，继续为你服务。(?:你也可以点击左下角切换到对话，继续使用快速模型。)?$/;
  if(!blocked&&profile.qualityMode==='expert'&&marker&&last?.matches(assistantRole)&&riskVisible(last)&&!hasLaterUser&&latestUser&&text(latestUser).includes(payload.requestId)&&raw.length<=600&&!hiddenText&&!quoted&&officeNotice.test(raw.replace(/\s+/g,''))){
   return {...snapshot,stage:'quota',message:'豆包办公能力免费额度已用完，当前分析已停止；请在平台额度恢复后重试。',diagnostics:{...snapshot.diagnostics,quotaNotice:true}};
  }
  return snapshot;
 }
 if(blocked)throw Object.assign(new Error(blocked.message),{blockingStage:blocked.stage,diagnostics});
 if(action==='review-current'){
  const proof=payload.reviewProof,reviewFail=message=>{throw Object.assign(new Error(message),{blockingStage:'review',diagnostics});};
  if(profile.qualityMode!=='expert'||!proof||typeof proof.requestId!=='string'||!proof.requestId||typeof proof.previousAssistantId!=='string'||!proof.previousAssistantId||typeof proof.previousAnswer!=='string'||!proof.previousAnswer||!proof.previousAnswer.includes(proof.requestId)||typeof proof.url!=='string'||location.href!==proof.url)reviewFail('复核证明或当前会话地址已变化，未填入或发送复核要求。');
  inspectDOM(profile,'quality-mode-current',{});
  if(cards.length||!editor)reviewFail('复核只允许原会话空白输入区且无附件，未填入或发送。');
  const snapshot=inspectDOM(profile,'snapshot',{requestId:proof.requestId});
  if(snapshot.stage||!snapshot.markerSeen||!snapshot.markerAfterBaseline||snapshot.generating||!snapshot.completionVisible||snapshot.hasLaterUser!==false||snapshot.assistantIds?.at(-1)!==proof.previousAssistantId||snapshot.answers?.at(-1)!==proof.previousAnswer)reviewFail('首轮回答、会话或后续用户消息已变化，未填入或发送复核要求。');
  return {ready:true,diagnostics};
 }
 if(action.startsWith('quality-mode-')){
  const qualityFail=message=>{throw Object.assign(new Error(message),{blockingStage:'quality-mode',diagnostics});};
  if(profile.qualityMode!=='expert')qualityFail('当前平台没有已确认的专家模式适配，未发送。');
  const scopes=all(['[role="menu"]','[role="listbox"]']).filter(riskVisible);
  if([...alerts,...scopes].filter(riskVisible).some(node=>/升级|订阅|付费|购买|会员|premium|unlock/i.test(text(node))))qualityFail('平台要求升级、订阅或付费，标析不会点击购买或回退快速模式；未发送本次材料。');
  if(action!=='quality-mode-current'&&(!editor||!upload||stop||cards.length||('value' in editor?editor.value:editor.innerText).trim()))qualityFail('专家模式确认前页面、输入框或附件已变化，请先处理草稿及平台提示；未发送本次材料。');
  Object.assign(diagnostics,{qualityMenuCount:scopes.length});
  if(scopes.length>1)qualityFail('发现多个可见模式菜单，不能唯一确认专家选项，未发送本次材料。');
  if(action==='quality-mode-option'){
   // A modal menu may aria-hide/inert its underlying trigger. Once our initial
   // trigger click opened this unique menu, validate only its visible options;
   // the initial and final mode-button checks remain strict and independent.
   if(!scopes.length)return {pending:true,diagnostics};
   const scope=scopes[0],semantic=[...scope.querySelectorAll('[role="menuitem"],[role="menuitemradio"],[role="option"]')].filter(riskVisible);
   const options=semantic.length?semantic:[...scope.querySelectorAll('button,[role="button"]')].filter(riskVisible);
   const matching=value=>options.filter(node=>labels(node).some(name=>name===value));
   const fast=matching('豆包 快速'),expert=matching('豆包 专家');
   if(options.length!==2||fast.length!==1||expert.length!==1||fast[0]===expert[0]||!enabled(expert[0])||expert[0].closest('[disabled],[aria-disabled="true"],[inert]'))qualityFail('未找到同一菜单内唯一可用的“豆包 专家”选项，停止切换；不会回退快速模式。');
   return {...clickTarget(expert[0],'豆包专家选项'),diagnostics};
  }
  const modePattern=/^豆包 (?:快速|专家)$/;
  const outsideMessages='[role="menu"],[role="listbox"],[data-message-author-role],[data-role="user"],[data-role="assistant"],[data-message-role],[data-testid="message_text_content"]';
  const modeButtons=[...document.querySelectorAll('button,[role="button"]')].filter(node=>riskVisible(node)&&!node.closest(outsideMessages)&&labels(node).some(value=>modePattern.test(value)));
  if(modeButtons.length!==1||!enabled(modeButtons[0])||modeButtons[0].closest('[disabled],[aria-disabled="true"],[inert]'))qualityFail('未找到唯一可用的“豆包 快速/豆包 专家”模式按钮，未发送本次材料。');
  const modeButton=modeButtons[0],modeLabels=labels(modeButton).filter(value=>modePattern.test(value));
  if(new Set(modeLabels).size!==1)qualityFail('豆包模式标识不一致，未发送本次材料。');
  const mode=modeLabels[0]==='豆包 专家'?'expert':'fast';Object.assign(diagnostics,{qualityMode:mode,qualityMenuCount:scopes.length});
  if(action==='quality-mode-current'){
   if(mode!=='expert'||scopes.length)qualityFail('豆包专家模式已变化或未保持就绪，停止上传和发送；不会回退快速模式。');
   return {mode,diagnostics};
  }
  if(action==='quality-mode-status')return {mode,menuCount:scopes.length,diagnostics};
  if(action==='quality-mode-trigger'){
   if(mode!=='fast'||scopes.length)qualityFail('模式或菜单已变化，未自动切换或发送。');
   return {...clickTarget(modeButton,'豆包模式按钮'),diagnostics};
  }
  qualityFail('未知的专家模式操作，未发送。');
 }
 if(action==='upload-trigger'){
  if(!upload)fail('未找到唯一文件上传按钮，未发送任何消息。');
  return clickTarget(upload,'上传按钮');
 }
 if(action==='upload-menu'){
  const scopes=all(['[role="menu"]','[role="listbox"]']);
  const nodes=[...new Set([...scopes.flatMap(scope=>[...scope.querySelectorAll('button,[role="button"],[role="menuitem"],[role="option"],div,span,p')]),...all(['[role="menuitem"]'])])];
  const exactLocal=node=>labels(node).some(value=>/^(?:上传文件或图片|上传文件|从本地上传|上传本地文件|本地文件|Upload files?|Upload from (?:this )?(?:computer|device)|From (?:this )?(?:computer|device))$/i.test(value));
  const boundary=node=>node.matches('button,[role="button"],[role="menuitem"],[role="option"],a[href]')||['onclick','onpointerdown','onmousedown'].some(key=>typeof node[key]==='function');
  const ownLabels=node=>[node.getAttribute('aria-label'),node.getAttribute('title'),[...node.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE).map(child=>child.textContent).join(' ')].filter(Boolean);
  const cloudLabel=values=>values.some(value=>/云盘|cloud\s*(?:drive|files?)/i.test(value));
  const matches=nodes.filter(node=>enabled(node)&&typeof node.click==='function'&&!node.closest('[disabled],[aria-disabled="true"],[inert]')).filter(exactLocal);
  const targets=[];Object.assign(diagnostics,{menuCount:scopes.length,localLabelCount:matches.length,cloudAncestorRejectedCount:0,menuCandidateChains:[]});
  for(const node of matches){
   const scope=node.closest('[role="menu"],[role="listbox"]'),boundaries=[],ancestors=[];
   for(let parent=node;parent&&parent!==scope;parent=parent.parentElement){
    ancestors.push(parent);
    if(boundary(parent))boundaries.push(parent);
   }
   // Shared wrappers can contain both actions. Full descendant text identifies
   // semantic/clickable rows; plain wrappers contribute only their own labels.
   if(diagnostics.menuCandidateChains.length<8)diagnostics.menuCandidateChains.push(ancestors.slice(0,8).map(parent=>({tag:parent.tagName.toLowerCase(),role:['button','menuitem','option','menu','listbox'].includes(parent.getAttribute('role'))?parent.getAttribute('role'):'none',isExactLocal:exactLocal(parent),ownCloudLabel:cloudLabel(ownLabels(parent)),isBoundary:boundary(parent),childrenCount:parent.children.length})));
   if(ancestors.some(parent=>cloudLabel(boundary(parent)?labels(parent):ownLabels(parent)))){diagnostics.cloudAncestorRejectedCount++;continue;}
   if(boundaries.length>1){diagnostics.localChoiceCount=boundaries.length;fail('发现嵌套的可点击上传菜单项，无法唯一确认，已停止操作。');}
   targets.push(boundaries[0]||node);
  }
  // Only pure label nesting is collapsed. Distinct semantic/clickable rows
  // were rejected above, before any click can bubble into two handlers.
  const uniqueTargets=[...new Set(targets)],choices=uniqueTargets.filter(node=>!uniqueTargets.some(other=>other!==node&&node.contains(other)));
  diagnostics.localChoiceCount=choices.length;
  if(choices.length>1)fail('发现多个本地上传菜单项，无法唯一确认，已停止操作。');
  const menuDiagnostics={menuCount:scopes.length,localChoiceCount:choices.length,localLabelCount:diagnostics.localLabelCount,cloudAncestorRejectedCount:diagnostics.cloudAncestorRejectedCount,menuCandidateChains:diagnostics.menuCandidateChains};
  return {clicked:false,...menuDiagnostics,...(choices.length===1?clickTarget(choices[0],'本地上传菜单项'):{})};
 }
 if(action==='file-receipt'){
  // A card's own failure message is often outside any alert/dialog element.
  return fileReceipt(payload.fileName);
 }
 if(action==='fill'){
  // The mode can change during receipt awaits after submit's entry check. Guard
  // in this DOM task before exposing any prompt text to the external editor.
  if(payload.requireQualityMode===true)inspectDOM(profile,'quality-mode-current',{});
  if(payload.reviewProof)inspectDOM(profile,'review-current',{reviewProof:payload.reviewProof});
  if(!editor)fail('未找到唯一的聊天输入框。');
  const existing='value' in editor?editor.value:editor.innerText;
  if(existing.trim())fail('输入框中有未发送的草稿，请自行处理后重新开始；标析没有覆盖草稿。');
  editor.focus();
  if('value' in editor){const setter=Object.getOwnPropertyDescriptor(editor instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(editor,payload.prompt);editor.dispatchEvent(new Event('input',{bubbles:true}));}
  else {if(!document.execCommand('insertText',false,payload.prompt))fail('无法填入当前聊天输入框；未自动发送。');editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:payload.prompt}));}
  return true;
 }
 if(action==='send'){
  if(payload.requireQualityMode===true)inspectDOM(profile,'quality-mode-current',{});
  if(payload.reviewProof)inspectDOM(profile,'review-current',{reviewProof:payload.reviewProof});
  if(!editor)fail('输入框已变化，未发送。');
  const rendered='value' in editor?editor.value:editor.innerText;
  const linearize=node=>{
   if(node.nodeType===Node.TEXT_NODE)return node.textContent||'';
   if(node.nodeType===Node.COMMENT_NODE)return '';
   if(node.nodeType!==Node.ELEMENT_NODE)return null;
   if(node.tagName==='BR')return node.classList.contains('ProseMirror-trailingBreak')?'':'\n';
   if(node!==editor&&!['P','DIV','SPAN','STRONG','EM','B','I','U','S','CODE','A','MARK','SUB','SUP'].includes(node.tagName))return null;
   const children=[...node.childNodes],isBlock=child=>child.nodeType===Node.ELEMENT_NODE&&['P','DIV'].includes(child.tagName);
   const hasBlocks=children.some(isBlock),parts=[];
   for(const child of children){
    if(hasBlocks&&!isBlock(child)){if(child.nodeType===Node.COMMENT_NODE||child.nodeType===Node.TEXT_NODE&&!child.textContent)continue;return null;}
    const part=linearize(child);if(part===null)return null;parts.push(part);
   }
   return parts.join(hasBlocks?'\n':'');
  };
  // ProseMirror represents source newlines as paragraph boundaries or BRs.
  // Preserve text, spaces and empty paragraphs; do not trim or fold whitespace.
  const domValue='value' in editor?rendered:linearize(editor),value=domValue===null?rendered:domValue;
  if(value!==payload.prompt){
   let firstDifference=0;while(firstDifference<Math.min(value.length,payload.prompt.length)&&value[firstDifference]===payload.prompt[firstDifference])firstDifference++;
   Object.assign(diagnostics,{editorActualLength:value.length,editorExpectedLength:payload.prompt.length,editorFirstDifferenceIndex:firstDifference,editorRenderedLength:rendered.length});
   fail('输入框内容与本次分析要求不一致，未发送。');
  }
  // Check in the same DOM task as the click: input handlers or users can change
  // attachments after fill, while the page enables its send button.
  const expected=payload.expectedFiles;
  if(!Array.isArray(expected)||!expected.length&&!payload.reviewProof||new Set(expected).size!==expected.length||cards.length!==expected.length)fail('本次附件已变化，停止发送。');
  for(const name of expected){const receipt=fileReceipt(name);if(receipt.error||receipt.pending||receipt.count!==1)fail('本次附件已变化或未处理完成，停止发送。');}
  if(!send)fail('未找到唯一且可用的发送按钮，未发送。');send.click();return true;
 }
 if(action==='stop'){if(stop)stop.click();return !!stop;}
 throw new Error('未知的网页操作。');
}

const sleep=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal.aborted)return reject(new Error('已取消'));
 const abort=()=>{clearTimeout(timer);reject(new Error('已取消'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});
});
function createBrowserAdapter(webContents,provider,{isAllowedURL=url=>allowedProviderURL(provider,url),uploadTimeoutMs=120000,chooserTimeoutMs=5000,menuPollMs=100,qualityModeTimeoutMs=5000,qualityModePollMs=100}={}){
 const profile=profiles[provider];if(!profile)throw new Error('不支持的网页平台。');
 const check=signal=>{if(signal?.aborted)throw new Error('已取消');if(webContents.isDestroyed()||!isAllowedURL(webContents.getURL()))throw new Error('网页已关闭或离开所选平台，停止操作。');};
 const evaluate=async(action,payload={},signal)=>{
  check(signal);
  const result=await webContents.executeJavaScript(`(()=>{try{return {ok:true,value:(${inspectDOM.toString()})(${JSON.stringify(profile)},${JSON.stringify(action)},${JSON.stringify(payload)})};}catch(error){return {ok:false,error:String(error.message||'当前网页操作未完成').slice(0,500),blockingStage:error.blockingStage,diagnostics:error.diagnostics};}})()`,true);
  check(signal);if(!result?.ok)throw Object.assign(new Error(result?.error||'当前网页操作未完成。'),{blockingStage:result?.blockingStage,diagnostics:result?.diagnostics});return result.value;
 };
 const qualityLimit=Number.isFinite(qualityModeTimeoutMs)?Math.min(10000,Math.max(1,qualityModeTimeoutMs)):5000;
 const qualityTimeout=()=>Object.assign(new Error('限定时间内未确认豆包专家模式，未发送本次材料；不会回退快速模式。'),{blockingStage:'quality-mode'});
 const boundedQuality=(action,signal,deadline=Date.now()+qualityLimit,payload={})=>new Promise((resolve,reject)=>{
  signal=signal||new AbortController().signal;
  const left=deadline-Date.now();if(left<=0){reject(qualityTimeout());return;}
  let finished=false;const finish=(callback,value)=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',abort);callback(value);};
  const abort=()=>finish(reject,new Error('已取消')),timer=setTimeout(()=>finish(reject,qualityTimeout()),left);signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted){abort();return;}
  evaluate(action,payload,signal).then(value=>finish(resolve,value),error=>finish(reject,error));
 });
 const nativeClick=(target,signal)=>{check(signal);webContents.sendInputEvent({type:'mouseMove',...target.point});webContents.sendInputEvent({type:'mouseDown',...target.point,button:'left',clickCount:1});webContents.sendInputEvent({type:'mouseUp',...target.point,button:'left',clickCount:1});check(signal);};
 const uploaded=[];let uploadDiagnostics={},controlDiagnostics={},qualityConfirmed=false,submittedRequestId=null,reviewUsed=false;
 const safeControlKeys=['documentReady','editorCount','uploadCount','sendCount','attachmentCount','generating','environmentRisk','authentication','assistantCount','markerSeen','completionVisible'];
 const withUploadDiagnostics=async(action,payload)=>{const value=await evaluate(action,payload);controlDiagnostics=Object.fromEntries(safeControlKeys.filter(key=>value.diagnostics?.[key]!==undefined).map(key=>[key,value.diagnostics[key]]));return {...value,diagnostics:{...value.diagnostics,...uploadDiagnostics}};};
 return {
  inspect:()=>withUploadDiagnostics('inspect'),snapshot:requestId=>withUploadDiagnostics('snapshot',{requestId}),reset(){uploaded.length=0;uploadDiagnostics={};submittedRequestId=null;reviewUsed=false;},
  ...(profile.qualityMode==='expert'?{async ensureQualityMode(signal){
   qualityConfirmed=false;
   signal=signal||new AbortController().signal;
   const deadline=Date.now()+qualityLimit,bounded=action=>boundedQuality(action,signal,deadline);
   const pause=()=>sleep(Math.max(1,Math.min(Number.isFinite(qualityModePollMs)?Math.max(1,qualityModePollMs):100,deadline-Date.now())),signal);
   let status=await bounded('quality-mode-status');
   if(status.menuCount)throw Object.assign(new Error('页面已有打开的菜单，请先关闭后再分析；标析未操作现有菜单。'),{blockingStage:'quality-mode',diagnostics:status.diagnostics});
   if(status.mode==='fast'){
    const trigger=await bounded('quality-mode-trigger');check(signal);if(Date.now()>=deadline)throw qualityTimeout();nativeClick(trigger,signal);
    while(true){const option=await bounded('quality-mode-option');if(option.point){check(signal);if(Date.now()>=deadline)throw qualityTimeout();nativeClick(option,signal);break;}await pause();}
    while(true){status=await bounded('quality-mode-status');if(status.mode==='expert'&&!status.menuCount)break;await pause();}
   }
   const readiness=await bounded('inspect');
   if(!readiness.ready)throw Object.assign(new Error(readiness.message||'专家模式切换后页面尚未准备好，未发送本次材料。'),{blockingStage:readiness.stage||'quality-mode',diagnostics:readiness.diagnostics});
   status=await bounded('quality-mode-status');
   if(status.mode!=='expert'||status.menuCount)throw Object.assign(new Error('豆包专家模式未保持就绪，未发送本次材料。'),{blockingStage:'quality-mode',diagnostics:status.diagnostics});
   qualityConfirmed=true;return {...readiness,qualityMode:'expert',diagnostics:{...readiness.diagnostics,qualityMode:'expert'}};
  }}:{}),
  async upload(file,signal){
   check(signal);if(qualityConfirmed)await boundedQuality('quality-mode-current',signal);if(!file?.path||!file?.fileName)throw new Error('本次上传文件无效。');const info=await stat(file.path);if(!info.isFile()||!info.size)throw new Error('本次原文件为空或不存在。');check(signal);
   const before=await evaluate('file-receipt',{fileName:file.fileName},signal);
   if(before.error)throw new Error('当前附件卡片提示上传失败，停止本次任务。');
   if(before.count||before.totalCount!==uploaded.length)throw new Error('输入区附件已变化或已有同名文件，停止本次任务。');
   const debuggerAPI=webContents.debugger;let attached=false,opened,listener;
   const stats={menuCount:0,localChoiceCount:0,localLabelCount:0,cloudAncestorRejectedCount:0,menuCandidateChains:[],menuClicked:false,chooserReceived:false,triggerClicked:false};uploadDiagnostics=stats;
   try {
    if(!debuggerAPI.isAttached()){debuggerAPI.attach('1.3');attached=true;}
    const chooser=new Promise(resolve=>{listener=(_event,method,params)=>{if(method==='Page.fileChooserOpened'){opened=params;stats.chooserReceived=true;resolve(params);}};debuggerAPI.on('message',listener);});
    await debuggerAPI.sendCommand('Page.enable');await debuggerAPI.sendCommand('Page.setInterceptFileChooserDialog',{enabled:true});
    if(typeof webContents.sendInputEvent!=='function')throw new Error('当前桌面窗口不支持可确认的原生上传点击，停止操作。');
    webContents.focus?.();const trigger=await evaluate('upload-trigger',{},signal);nativeClick(trigger,signal);stats.triggerClicked=true;
    // Use the chooser's real file input, including detached inputs. Do not inject
    // synthetic file contents or call the site's private upload endpoints.
    const chooserDeadline=Date.now()+chooserTimeoutMs;let menuClicked=false;
    while(!opened&&Date.now()<chooserDeadline){
     check(signal);
     if(!menuClicked){const menu=await evaluate('upload-menu',{},signal);for(const key of ['menuCount','localChoiceCount','localLabelCount','cloudAncestorRejectedCount','menuCandidateChains'])stats[key]=menu[key];if(menu.point){nativeClick(menu,signal);menuClicked=true;stats.menuClicked=true;}}
     if(!opened)await Promise.race([chooser,sleep(Math.max(1,Math.min(menuPollMs,chooserDeadline-Date.now())),signal)]);
    }
    check(signal);
    if(!opened)throw Object.assign(new Error('平台在限定时间内未打开本地文件选择器；未向其他隐藏文件控件填入材料。'),{code:'WEB_CHAT_CHOOSER_NOT_OPENED'});
    if(!Number.isInteger(opened.backendNodeId)||opened.backendNodeId<=0)throw Object.assign(new Error('平台已打开文件选择器，但未提供可确认的目标文件控件；未填入材料。'),{code:'WEB_CHAT_CHOOSER_TARGET_MISSING'});
    // stat, receipts, debugger setup and the native chooser all yielded since
    // entry. Recheck immediately before handing paths to the external input.
    if(qualityConfirmed)await boundedQuality('quality-mode-current',signal);
    check(signal);
    await debuggerAPI.sendCommand('DOM.setFileInputFiles',{backendNodeId:opened.backendNodeId,files:[file.path]});
    check(signal);const deadline=Date.now()+uploadTimeoutMs;let stableAt=0;
    while(Date.now()<deadline){
     const receipt=await evaluate('file-receipt',{fileName:file.fileName},signal);
     if(receipt.error)throw new Error(`“${file.fileName}”附件卡片提示上传或处理失败。`);
     if(receipt.totalCount>uploaded.length+1||receipt.count>1)throw new Error('本次附件集合发生变化，停止发送。');
     if(receipt.count===1&&receipt.totalCount===uploaded.length+1&&!receipt.pending){if(!stableAt)stableAt=Date.now();if(Date.now()-stableAt>=500){uploaded.push(file.fileName);return;}}
     else stableAt=0;
     await sleep(180,signal);
    }
    throw new Error(`未确认“${file.fileName}”上传并处理完成；未发送分析要求。`);
   }catch(error){
    error.diagnostics={...controlDiagnostics,...stats,...error.diagnostics,menuClicked:stats.menuClicked,chooserReceived:!!opened};
    uploadDiagnostics={...stats,menuCount:error.diagnostics.menuCount,localChoiceCount:error.diagnostics.localChoiceCount,chooserReceived:!!opened};
    const d=error.diagnostics;
    error.message+=`（上传检查：触发器已点 ${d.triggerClicked?'是':'否'}，菜单 ${d.menuCount}，本地项 ${d.localChoiceCount}，菜单已点 ${d.menuClicked?'是':'否'}，选择器事件 ${d.chooserReceived?'是':'否'}）`;
    throw error;
   }finally {
    if(listener)debuggerAPI.removeListener('message',listener);
    if(!webContents.isDestroyed()&&debuggerAPI.isAttached()){await debuggerAPI.sendCommand('Page.setInterceptFileChooserDialog',{enabled:false}).catch(()=>{});if(attached)debuggerAPI.detach();}
   }
  },
  async submit(prompt,requestId,signal,options){
   check(signal);if(typeof prompt!=='string'||!prompt.includes(requestId)||prompt.length>150000)throw new Error('本次分析要求无效或过长。');
   let reviewProof;
   if(options?.reviewOnly===true){
    if(provider!=='doubao'||!qualityConfirmed||submittedRequestId!==requestId||reviewUsed||uploaded.length||typeof options.previousAssistantId!=='string'||!options.previousAssistantId||options.previousAssistantId.length>200||typeof options.previousAnswer!=='string'||!options.previousAnswer||options.previousAnswer.length>1024*1024||!options.previousAnswer.includes(requestId))throw Object.assign(new Error('本次纯文本复核缺少同任务首答、专家模式或一次复核资格，未填入或发送。'),{blockingStage:'review'});
    reviewProof={requestId,previousAssistantId:options.previousAssistantId,previousAnswer:options.previousAnswer,url:webContents.getURL()};reviewUsed=true;
    await boundedQuality('review-current',signal,Date.now()+qualityLimit,{reviewProof});
   }
   if(qualityConfirmed)await boundedQuality('quality-mode-current',signal);
   for(const fileName of uploaded){const receipt=await evaluate('file-receipt',{fileName},signal);if(receipt.error||receipt.count!==1||receipt.pending||receipt.totalCount!==uploaded.length)throw new Error('本次附件已变化或未处理完成，停止发送。');}
   await evaluate('fill',{prompt,requireQualityMode:qualityConfirmed,...(reviewProof?{reviewProof}:{})},signal);await sleep(180,signal);await evaluate('send',{prompt,expectedFiles:[...uploaded],requireQualityMode:qualityConfirmed,...(reviewProof?{reviewProof}:{})},signal);uploaded.length=0;if(!reviewProof)submittedRequestId=requestId;
  },
  async stop(){uploaded.length=0;await evaluate('stop');}
 };
}
module.exports={createBrowserAdapter};
