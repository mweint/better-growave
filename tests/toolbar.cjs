const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
let click,found=true,executions=[],badges=[];
const browser={action:{onClicked:{addListener(fn){click=fn;}},setBadgeText:async value=>badges.push(value.text),setTitle:async()=>{}},
  scripting:{executeScript:async request=>{executions.push(request);return [{result:found}];}}};
vm.runInNewContext(fs.readFileSync('extension/background.js','utf8'),{browser});
(async()=>{
 await click({id:1,url:'http://example.test/pages/wishlist'});assert.equal(executions.length,0);
 found=false;await click({id:1,url:'https://example.test/pages/wishlist'});assert.equal(executions.length,1);assert.equal(badges.at(-1),'?');
 found=true;await click({id:1,url:'https://example.test/pages/wishlist'});
 assert.deepEqual(Array.from(executions.at(-1).files),['core.js','cart.js','content.js']);
 assert.equal(executions.at(-1).target.tabId,1);assert.equal(badges.at(-1),'');
 console.log('PASS: toolbar only injects after an explicit click on a supported HTTPS wishlist.');
})().catch(e=>{console.error(e);process.exit(1);});
