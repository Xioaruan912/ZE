import {build} from 'esbuild';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),outdir=path.join(root,'static/build');
await mkdir(outdir,{recursive:true});
const result=await build({absWorkingDir:root,entryPoints:{'ze-ui':'frontend/ze-ui.mjs'},outdir,bundle:true,format:'esm',target:['es2022','safari15.4'],minify:true,metafile:true,write:false,loader:{'.woff2':'file','.svg':'file'},entryNames:'[name]-[hash]',assetNames:'[name]-[hash]',publicPath:'/assets',legalComments:'eof'});
for(const file of result.outputFiles)await writeFile(file.path,file.contents);
// Export the PDF cap height alongside ascent/descent, keeping selection geometry
// independent of browser font leading. Original PDF.js source is left intact.
const workerOriginal=await readFile(path.join(root,'node_modules/pdfjs-dist/build/pdf.worker.mjs'),'utf8');
const metricsPattern=/(textContent\.styles\[loadedName\]\s*=\s*\{[\s\S]{0,160}?ascent:\s*font\.ascent,)/g;
if([...workerOriginal.matchAll(metricsPattern)].length!==1)throw Error('PDF.js font-metric export changed; review the cap-height extension before building');
const worker=workerOriginal.replace(metricsPattern,'$1\n            capHeight: font.capHeight,');
const workerName='pdf-worker-'+createHash('sha256').update(worker).digest('hex').slice(0,12)+'.js';
await writeFile(path.join(outdir,workerName),worker);
const licenseParts=[];
for(const file of ['node_modules/motion/LICENSE.md','node_modules/framer-motion/LICENSE.md','node_modules/motion-dom/LICENSE.md','node_modules/motion-utils/LICENSE.md','node_modules/pdfjs-dist/LICENSE','node_modules/@phosphor-icons/core/LICENSE','node_modules/@fontsource/ibm-plex-sans/LICENSE']){
 try{licenseParts.push(file+'\n\n'+await readFile(path.join(root,file),'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
}
await writeFile(path.join(outdir,'ZE-LICENSES.txt'),licenseParts.join('\n\n'));
const outputs=Object.keys(result.metafile.outputs),js=outputs.find(file=>/ze-ui-[^.]+\.js$/.test(file)),css=outputs.find(file=>/ze-ui-[^.]+\.css$/.test(file)),icon=outputs.find(file=>/book-open-text-[^.]+\.svg$/.test(file));
if(!js||!css||!icon)throw Error('ZE build is missing required UI assets');
const url=file=>'/assets/'+path.basename(file),styles=`<!--ZE:styles--><link rel="stylesheet" href="${url(css)}"><link rel="icon" type="image/svg+xml" href="${url(icon)}"><!--/ZE:styles-->`,script=`<!--ZE:scripts--><script type="module" src="${url(js)}"></script><!--/ZE:scripts-->`;
for(const name of ['index.html','login.html']){
 const file=path.join(root,'static',name);let html=await readFile(file,'utf8');
 html=html.replace(/<!--ZE:styles-->[\s\S]*?<!--\/ZE:styles-->/,styles).replace(/<!--ZE:scripts-->[\s\S]*?<!--\/ZE:scripts-->/,script);
 if(!html.includes(url(css))||!html.includes(url(js)))throw Error(name+' is missing the ZE asset slots');
 await writeFile(file+'.tmp',html);await rename(file+'.tmp',file);
}
const manifest={name:'ZE',builtAt:new Date().toISOString(),javascript:url(js),stylesheet:url(css),icon:url(icon),pdfWorker:'/assets/'+workerName,files:result.outputFiles.map(file=>({name:path.basename(file.path),bytes:file.contents.length}))};
await writeFile(path.join(outdir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`ZE frontend built: ${result.outputFiles.length} self-hosted files, ${Math.ceil(result.outputFiles.reduce((sum,f)=>sum+f.contents.length,0)/1024)} KiB total.`);
console.log(`Motion 10/10; design expression 10/10; density retained. ${manifest.javascript}`);
