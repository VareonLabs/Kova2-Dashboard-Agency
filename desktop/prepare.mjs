import { readFileSync,writeFileSync,mkdirSync,copyFileSync,rmSync,chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { execFileSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const iconRoot=resolve(root,'build-resources/VareonHQ.iconset');rmSync(iconRoot,{recursive:true,force:true});mkdirSync(iconRoot,{recursive:true});
const svg=readFileSync(resolve(root,'public/favicon.svg'),'utf8');
for(const size of [16,32,64,128,256,512,1024]){const data=new Resvg(svg,{fitTo:{mode:'width',value:size}}).render().asPng();if([16,32,128,256,512].includes(size))writeFileSync(resolve(iconRoot,`icon_${size}x${size}.png`),data);if([32,64,256,512,1024].includes(size))writeFileSync(resolve(iconRoot,`icon_${size/2}x${size/2}@2x.png`),data);}
execFileSync('/usr/bin/iconutil',['-c','icns',iconRoot,'-o',resolve(root,'build-resources/VareonHQ.icns')]);
copyFileSync(process.execPath,resolve(root,'build-resources/node'));chmodSync(resolve(root,'build-resources/node'),0o755);
execFileSync('/usr/bin/xcrun',['swiftc','-O','-module-cache-path','/private/tmp/vareon-swift-cache',resolve(root,'desktop/keychain.swift'),'-o',resolve(root,'build-resources/keychain-helper')]);
console.log('Desktop icon and bundled Node runtime are ready.');
