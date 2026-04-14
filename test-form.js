const puppeteer = require('puppeteer');

(async () => {
    try {
        console.log('Launching puppeteer...');
        const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
        const page = await browser.newPage();
        
        console.log('Navigating to page...');
        await page.goto('http://localhost:3001/sell-product.html', { waitUntil: 'networkidle0' });
        
        console.log('Setting values...');
        await page.evaluate(() => {
            document.querySelector('[name="title"]').value = 'Test Watch';
            document.querySelector('[name="price"]').value = '1000';
            document.querySelector('#category-select').value = 'Electronics';
            document.querySelector('#category-select').dispatchEvent(new Event('change'));
            document.querySelector('[name="endTime"]').value = '2026-12-31T23:59';
            document.querySelector('#base-description').value = 'Some desc';
            
            // Checkboxes
            document.getElementById('check-ownership').checked = true;
            document.getElementById('check-authenticity').checked = true;
            document.getElementById('check-media').checked = true;
            document.getElementById('check-terms').checked = true;
            
            // Trigger input events
            document.querySelector('form').dispatchEvent(new Event('input'));
        });
        
        console.log('Checking button state...');
        const state = await page.evaluate(() => {
            const btn = document.getElementById('submit-btn');
            
            // Check form values 
            const form = document.getElementById('sell-form');
            const title = form.title ? form.title.value : 'missing';
            const price = form.price ? form.price.value : 'missing';
            
            const checks = ['check-ownership', 'check-authenticity', 'check-media', 'check-terms'];
            const allChecks = checks.every(id => document.getElementById(id).checked);
            
            return {
                disabled: btn.disabled,
                textContent: btn.textContent,
                title,
                price,
                allChecks,
                hasVideoVar: window.videoInput ? window.videoInput.files.length : 0,
                hasImagesVar: window.imageFiles ? window.imageFiles.length : 0
            };
        });
        
        console.log('State:', state);
        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
