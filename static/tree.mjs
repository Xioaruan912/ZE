export function buildTree(collections){
 const nodes = new Map(collections.map(c=>[c.key,{...c,children:[]}]))
 const roots=[]
 for (const node of nodes.values()){
   const parent=nodes.get(node.parentCollection)
   if(parent && parent!==node) parent.children.push(node); else roots.push(node)
 }
 const sort=arr=>{arr.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));arr.forEach(n=>sort(n.children))};sort(roots)
 return roots
}
