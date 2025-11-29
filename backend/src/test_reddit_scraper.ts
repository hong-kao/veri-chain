import { scrapeWebsite } from './utils/scraper.js';

async function testRedditScraper() {
    console.log('Testing Reddit scraper...\n');

    const testUrl = 'https://www.reddit.com/search?q=climate+change&sort=relevance&t=week';

    console.log(`Scraping: ${testUrl}\n`);

    const result = await scrapeWebsite({
        url: testUrl,
        extractType: 'full',
        timeout: 15000
    });

    console.log('=== SCRAPE RESULT ===');
    console.log(`Success: ${result.success}`);
    console.log(`Title: ${result.title}`);
    console.log(`Word Count: ${result.wordCount}`);
    console.log(`Content Length: ${result.content.length} characters`);

    if (result.error) {
        console.log(`Error: ${result.error}`);
    }

    console.log('\n=== FIRST 500 CHARS OF CONTENT ===');
    console.log(result.content.substring(0, 500));

    console.log('\n=== CHECKING FOR POST PATTERNS ===');
    const postMatches = result.content.match(/points.*?comments/gi) || [];
    console.log(`Found ${postMatches.length} post patterns`);

    if (postMatches.length > 0) {
        console.log('\nFirst 3 matches:');
        postMatches.slice(0, 3).forEach((match, i) => {
            console.log(`${i + 1}. ${match}`);
        });
    }

    process.exit(0);
}

testRedditScraper();
