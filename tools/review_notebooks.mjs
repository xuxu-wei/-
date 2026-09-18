// 先运行 check_m1.py --preview，再启动 serve.py --previews。
import {createRequire} from 'node:module';
import {mkdir, readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output=resolve('.work/m1/notebook-review');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1280,height:1000}});
const report=[];
try {
  for(const file of (await readdir('.work/m1/previews')).filter(x=>x.endsWith('.html')).sort()) {
    await page.goto(`http://127.0.0.1:8000/.work/m1/previews/${file}`,{waitUntil:'networkidle'});
    const headings=await page.locator('h2').allTextContents();
    assert.ok(headings.some(x=>x.includes('数学解释与推导')));
    assert.ok(headings.some(x=>x.includes('练习与参考资料')));
    const figures=page.locator('img[src^="data:image/png"]');
    const count=await figures.count();
    for(let i=0;i<count;i++) {
      assert.ok(await figures.nth(i).evaluate(img=>img.naturalWidth>100 && img.complete));
      await figures.nth(i).screenshot({path:resolve(output,`${file.slice(0,2)}-figure-${i+1}.png`)});
    }
    await page.screenshot({path:resolve(output,`${file.slice(0,2)}-page.png`)});
    report.push({file,figures:count,teachingSections:headings.length});
  }
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
