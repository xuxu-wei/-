// 开发验收：PLAYWRIGHT_MODULE、PLAYWRIGHT_EXECUTABLE 可指定已有本地运行时。
import {createRequire} from 'node:module';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = resolve('.work/m1/browser');
await mkdir(output, {recursive:true});
const base = process.env.M1_PREVIEW_URL || 'http://127.0.0.1:8000';
const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE} : {})});
const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const downloads = [];
page.on('download', download => downloads.push(download.suggestedFilename()));
const checks = [];
try {
  await page.goto(`${base}/web/single-compartment/`);
  await page.locator('#loading-note').waitFor({state:'hidden'});
  assert.equal(await page.locator('#u').inputValue(),'1');
  assert.equal(await page.locator('#k').inputValue(),'0.5');
  assert.equal(await page.locator('#h').inputValue(),'0.1');
  await page.locator('#u').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#u').inputValue(),'1.05');
  await page.locator('#reset').click();
  await page.locator('#play').click();
  await page.waitForFunction(()=>Number(document.getElementById('time').value)>0.1);
  assert.ok(Number(await page.locator('#amount-fill').getAttribute('height'))>0);
  assert.equal(await page.locator('#play').getAttribute('aria-pressed'),'true');
  await page.locator('#play').click();
  const pausedTime = await page.locator('#time').inputValue();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#time').inputValue(),pausedTime);
  await page.locator('#time').press('End');
  await page.locator('#play').click();
  await page.waitForFunction(()=>Number(document.getElementById('time').value)>0.1 && Number(document.getElementById('time').value)<20);
  await page.locator('#play').click();
  checks.push('默认参数、键盘调节、时间与存量实际推进、暂停冻结及终点重播');
  await page.locator('#reset').click();
  await page.locator('#stock-flow').screenshot({path:resolve(output,'desktop-stock.png')});

  await page.locator('#no-clearance').click();
  assert.match(await page.locator('#equilibrium-note').textContent(),/没有有限平衡/);
  await page.locator('#decay-example').click();
  assert.equal(await page.locator('#u').inputValue(),'0');
  assert.equal(await page.locator('#k').inputValue(),'0.75');
  assert.equal(await page.locator('#a0').inputValue(),'10');
  assert.equal(await page.locator('#h').inputValue(),'2');
  assert.match(await page.locator('#positivity-note').textContent(),/已经出现负/);
  assert.match(await page.locator('#stability-note').textContent(),/偏差收敛/);
  const coarse = Number(await page.locator('#error-value').textContent());
  await page.locator('#step-size').screenshot({path:resolve(output,'desktop-negative.png')});
  await page.locator('#halve-step').click();
  assert.equal(await page.locator('#h').inputValue(),'1');
  assert.ok(Number(await page.locator('#error-value').textContent()) < coarse);
  assert.match(await page.locator('#positivity-note').textContent(),/保持非负/);
  checks.push('零清除、共享参数、负值示例、减小步长与误差反馈');

  await page.locator('#reset').click();
  assert.equal(await page.locator('#time').inputValue(),'0');
  assert.equal(await page.locator('#a0').inputValue(),'0');
  for (const width of [1024,1366,1440,1920]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.ok(await page.locator('.chart-wrap svg').evaluateAll(charts=>charts.every(svg=>{
      const box=svg.getBoundingClientRect();
      return [...svg.querySelectorAll('text')].every(text=>{
        const bounds=text.getBoundingClientRect();
        return bounds.left>=box.left-1 && bounds.right<=box.right+1;
      });
    })), `Plot label clipped at ${width}px`);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(255, 255, 255)');
  }
  await page.setViewportSize({width:1024,height:900});
  assert.ok(await page.locator('.course-sidebar').isVisible());
  assert.ok(await page.locator('.sample-branch').evaluate(branch=>branch.open));
  assert.equal(await page.locator('.chapter-tabs [aria-current]').textContent(),'可视化与探索');
  await page.setViewportSize({width:1440,height:1000});
  checks.push('PC 1024/1366/1440/1920px 布局、图轴标签、白底和展开定位的统一目录');

  // 只拦截 OS 打开这一步，避免自动检查弹出六个 IDE；真实文件关联须另外人工核验。
  const session=await (await page.request.get(`${base}/api/session`)).json();
  assert.equal(session.notebooks.length,6);
  assert.equal(await page.locator('a[href$=".ipynb"]').count(),0);
  const requests=[];
  await page.route('**/api/notebooks/open',async route=>{
    const request=route.request();
    assert.equal(request.method(),'POST');
    assert.equal(request.headers()['x-local-token'],session.token);
    requests.push(request.postDataJSON().id);
    await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({status:'requested',message:'已请求系统默认 IDE 打开，请切换到 IDE 继续学习。'})});
  });
  const beforeOpen=page.url();
  for (const lesson of session.notebooks) {
    const button=page.locator(`#notebook-links [data-notebook="${lesson.id}"]`);
    await button.click();
    await page.waitForFunction(id=>document.querySelector(`#notebook-links [data-notebook="${id}"]`).closest('.open-action').textContent.includes('已请求系统默认 IDE'),lesson.id);
  }
  assert.deepEqual(requests,session.notebooks.map(item=>item.id));
  assert.equal(page.url(),beforeOpen);
  assert.deepEqual(downloads,[]);
  assert.equal(browser.contexts()[0].pages().length,1);
  await page.unroute('**/api/notebooks/open');
  await page.route('**/api/notebooks/open',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'系统未能打开 Notebook。请设置 .ipynb 的默认应用后重试。'})}));
  await page.locator('#notebook-links [data-notebook="S01"]').click();
  await page.waitForFunction(()=>document.querySelector('#notebook-links .open-feedback.error')?.textContent.includes('默认应用'));
  assert.equal(page.url(),beforeOpen);
  assert.deepEqual(downloads,[]);
  await page.unroute('**/api/notebooks/open');
  checks.push('六个 IDE 按钮的请求与成功/失败反馈；不下载或跳转浏览器 Notebook（OS 调用由人工另验）');

  if (!process.argv.includes('--ui-only')) {
    const vectors = JSON.parse(await readFile('.work/m1/reference-vectors.json','utf8'));
    const compared = await page.evaluate(async vectors => {
      const model = await import('/web/single-compartment/model.mjs');
      let worst=0;
      for (const vector of vectors) {
        const actual = model.euler(vector.parameters, vector.h);
        for (let i=0;i<actual.times.length;i++) {
          worst=Math.max(worst, Math.abs(actual.amounts[i]-vector.euler[i])/Math.max(1,...vector.exact.map(Math.abs)));
          worst=Math.max(worst, Math.abs(model.exactAmount(actual.times[i],vector.parameters)-vector.exact[i])/Math.max(1,...vector.exact.map(Math.abs)));
        }
      }
      return worst;
    }, vectors);
    assert.ok(compared<=1e-10,`Browser/Python mismatch: ${compared}`);
    checks.push(`${vectors.length} 组 Python 与浏览器参考值一致；最大归一化差 ${compared}`);
    for (const lesson of session.notebooks) {
      const response=await page.request.get(`${base}/${lesson.path}`);
      assert.equal(response.status(),200);
      assert.equal((await response.json()).nbformat,4);
    }
    checks.push('统一目录中的六节 Notebook 均为有效文件');
  }
  for (const path of ['/.git/config','/%E6%A8%A1%E6%8B%9F%E6%95%B0%E6%8D%AE/','/.work/install.log']) {
    assert.equal((await page.request.get(base+path)).status(),404);
  }
  checks.push('本地服务只提供教材内容');
  assert.deepEqual(errors,[]);
  const failure=await browser.newPage();
  await failure.route('**/app.mjs',route=>route.abort());
  await failure.goto(`${base}/web/single-compartment/`);
  await failure.waitForFunction(()=>document.querySelector('#loading-note').textContent.includes('交互未能加载'));
  assert.ok(await failure.locator('#play').isDisabled());
  await failure.close();
  checks.push('模块加载失败时显示原因，播放保持禁用');
  const report={browser:await browser.version(),playwright:require((process.env.PLAYWRIGHT_MODULE || 'playwright')+'/package.json').version,checks,consoleErrors:errors};
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {
  await browser.close();
}
