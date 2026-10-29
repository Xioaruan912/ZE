export function indexText(items){
 let text='',map=[];
 for(let item=0;item<items.length;item++){const source=items[item].str;if(typeof source!=='string')continue;
  for(let start=0;start<source.length;){const character=String.fromCodePoint(source.codePointAt(start)),end=start+character.length,normalized=character.normalize('NFKC').toLocaleLowerCase();for(let j=0;j<normalized.length;j++){const char=/\s/.test(normalized[j])?' ':normalized[j];if(char===' '&&text.endsWith(' '))continue;text+=char;map.push({item,start,end})}start=end}
  const current=items[item];let next;for(let j=item+1;j<items.length;j++)if(typeof items[j].str==='string'){next=items[j];break}
  const touching=!current.hasEOL&&current.transform&&next?.transform&&Math.abs(current.transform[5]-next.transform[5])<2&&next.transform[4]-current.transform[4]-current.width<Math.abs(current.transform[0])*.15;
  if(current.hasEOL&&text.endsWith('-')){text=text.slice(0,-1);map.pop()}else if(!touching&&!text.endsWith(' ')){text+=' ';map.push(null)}
 }
 return {text,map,items};
}
export function findMatches(index,query,limit=1000){
 const needle=query.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();if(!needle)return [];const matches=[];
 for(let from=0;matches.length<limit;){const at=index.text.indexOf(needle,from);if(at<0)break;const parts=[];for(const point of index.map.slice(at,at+needle.length)){if(!point)continue;const last=parts.at(-1);if(last?.item===point.item)last.end=point.end;else parts.push({...point})}matches.push({at,parts,snippet:index.text.slice(Math.max(0,at-35),at+needle.length+65)});from=at+needle.length}
 return matches;
}
export function createNavigationHistory(){let back=[],forward=[];return {get canBack(){return !!back.length},get canForward(){return !!forward.length},push(anchor){if(anchor){back.push({...anchor});if(back.length>80)back.shift();forward=[]}},back(current){if(!back.length)return null;forward.push(current);return back.pop()},forward(current){if(!forward.length)return null;back.push(current);return forward.pop()}}}
export function collectReferences(pages){
 const result=[];let started=false;
 for(const {page,index} of pages){const lines=[];let offset=0;for(const item of index.items){if(typeof item.str!=='string')continue;const last=lines.at(-1);if(last&&!last.endLine){last.text+=' '+item.str;last.endLine=!!item.hasEOL}else lines.push({text:item.str,item:offset,endLine:!!item.hasEOL});offset++}
  for(const line of lines){if(/^(references|bibliography|参考文献)\s*$/i.test(line.text.trim())){started=true;continue}if(!started)continue;const match=line.text.match(/^\s*\[([\d]+)\]\s*(.*)/);if(match)result.push({label:match[1],title:match[2],page,item:line.item});else if(result.length&&line.text.trim())result.at(-1).title+=' '+line.text.trim()}
 }return result;
}
