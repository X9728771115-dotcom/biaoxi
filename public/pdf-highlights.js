const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/g,'');
/** Find an actual consecutive source span. Repeated common fragments do not define a span. */
export function selectSourceItems(items = [],quote = '') {
 const stream=[];let joined='';
 for(const item of items){const value=normalize(item.str);if(!value)continue;stream.push({item,start:joined.length,end:joined.length+value.length});joined+=value;}
 const candidates=String(quote).split('|').map(normalize).filter(value=>value.length>=3).sort((a,b)=>b.length-a.length);
 for(const wanted of candidates){const start=joined.indexOf(wanted);if(start<0)continue;const end=start+wanted.length;return stream.filter(part=>part.start<end&&part.end>start).map(part=>part.item);}
 return [];
}
