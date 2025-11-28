import { chromium, Browser, Page } from 'playwright';
import * as cheerio from 'cheerio';

interface ScraperOptions{
    url: string;
    extractType?: "full" | "title" | "summary";
    timeout?: number;
    waitForSelector?: string;
    removeElements?: string[];
}

interface ScraperResult{
    url: string;
    title: string;
    content: string;
    author?: string;
    publishDate?: string;
    wordCount: number;
    mainImage?: string;
    success: boolean;
    error?: string;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser>{
    if(!browserInstance){
        browserInstance = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });
    }
    return browserInstance;
}

export async function scrapeWebsite(options: ScraperOptions): Promise<ScraperResult>{
    const {
        url,
        extractType = "full",
        timeout = 10000,
        waitForSelector = 'body',
        removeElements = ['script', 'style', 'nav', 'footer', 'ads', 'iframe', '.ad', '.advertisement', '#comments']
    } = options;

    let page: Page | null = null;

    try{
        const browser = await getBrowser();
        page = await browser.newPage();

        await page.setViewportSize({ width: 1920, height: 1080 });
        await (page as any).setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.route('**/*', (route)=>{
            const resourceType = route.request().resourceType();
            if(['image', 'media', 'font', 'websocket'].includes(resourceType)){
                route.abort();
            }else{
                route.continue();
            }
        });

        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: timeout
        });

        try{
            await page.waitForSelector(waitForSelector, { timeout: 5000 });
        }catch(e){
            console.warn('Wait for selector timed out, proceeding anyway');
        }

        await page.waitForTimeout(1000);

        const html = await page.content();
        const $ = cheerio.load(html);

        for(const selector of removeElements){
            $(selector).remove();
        }

        let title = '';
        title = $('meta[property="og:title"]').attr('content') || 
                $('meta[name="twitter:title"]').attr('content') ||
                $('title').text() ||
                $('h1').first().text() ||
                '';
        title = title.trim();

        let author = '';
        author = $('meta[name="author"]').attr('content') ||
                $('meta[property="article:author"]').attr('content') ||
                $('.author').first().text() ||
                $('[rel="author"]').first().text() ||
                $('[itemprop="author"]').first().text() ||
                '';
        author = author.trim();

        let publishDate = '';
        publishDate = $('meta[property="article:published_time"]').attr('content') ||
                     $('meta[name="publishdate"]').attr('content') ||
                     $('time[datetime]').attr('datetime') ||
                     $('.publish-date').first().text() ||
                     $('[itemprop="datePublished"]').attr('content') ||
                     '';
        publishDate = publishDate.trim();

        let mainImage = '';
        mainImage = $('meta[property="og:image"]').attr('content') ||
                   $('meta[name="twitter:image"]').attr('content') ||
                   $('article img').first().attr('src') ||
                   $('img').first().attr('src') ||
                   '';
        if(mainImage && !mainImage.startsWith('http')){
            try{
                const baseUrl = new URL(url);
                mainImage = new URL(mainImage, baseUrl.origin).href;
            }catch(e){
                mainImage = '';
            }
        }

        let content = '';

        const articleSelectors = [
            'article',
            '[role="article"]',
            '.article-content',
            '.post-content',
            '.entry-content',
            '.content',
            'main',
            '#content',
            '.story-body',
            '[itemprop="articleBody"]'
        ];

        let $article = null;
        for(const selector of articleSelectors){
            const elem = $(selector);
            if(elem.length > 0 && elem.text().trim().length > 100){
                $article = elem.first();
                break;
            }
        }

        if(!$article){
            $article = $('body');
        }

        $article.find('p, h1, h2, h3, h4, h5, h6, li, blockquote').each((i, elem)=>{
            const text = $(elem).text().trim();
            if(text.length > 0){
                content += text + '\n\n';
            }
        });

        if(content.length < 100){
            content = $article.text().trim().replace(/\s+/g, ' ');
        }

        content = content
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\t+/g, ' ')
            .replace(/  +/g, ' ')
            .trim();

        if(extractType === 'title'){
            content = title;
        }else if(extractType === 'summary'){
            const paragraphs = content.split('\n\n').filter(p=>p.length > 50);
            content = paragraphs.slice(0, 3).join('\n\n');
        }

        const wordCount = content.split(/\s+/).filter(w=>w.length > 0).length;

        await page.close();

        return {
            url,
            title,
            content,
            author: author || undefined,
            publishDate: publishDate || undefined,
            wordCount,
            mainImage: mainImage || undefined,
            success: true
        };

    }catch(error: any){
        if(page){
            await page.close().catch(()=>{});
        }

        console.error('Scraper error:', error.message);

        return {
            url,
            title: '',
            content: '',
            wordCount: 0,
            success: false,
            error: error.message
        };
    }
}

export async function closeBrowser(){
    if(browserInstance){
        await browserInstance.close();
        browserInstance = null;
    }
}

export async function scrapeMultipleUrls(urls: string[], options: Omit<ScraperOptions, 'url'> = {}): Promise<ScraperResult[]>{
    const results: ScraperResult[] = [];
    
    for(const url of urls){
        const result = await scrapeWebsite({ ...options, url });
        results.push(result);
        await new Promise(resolve=>setTimeout(resolve, 1000));
    }
    
    return results;
}