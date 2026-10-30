// Renders the wordpress.org banner and icon PNGs from banner.html and icon.html.
//
// Run from the repository root:  node .wordpress-org/render.mjs
// Then copy the PNGs to the `assets/` directory of the SVN working copy and commit.
// The HTML loads its fonts from Google Fonts, so the render needs network access.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dir = dirname( fileURLToPath( import.meta.url ) );

// [ source, CSS width, CSS height, device scale factor, output ]
const jobs = [
	[ 'banner.html', 772, 250, 1, 'banner-772x250.png' ],
	[ 'banner.html', 772, 250, 2, 'banner-1544x500.png' ],
	[ 'icon.html', 256, 256, 0.5, 'icon-128x128.png' ],
	[ 'icon.html', 256, 256, 1, 'icon-256x256.png' ],
];

const browser = await chromium.launch();

for ( const [ source, width, height, scale, output ] of jobs ) {
	const page = await browser.newPage( { viewport: { width, height }, deviceScaleFactor: scale } );

	await page.goto( `file://${ dir }/${ source }` );
	await page.evaluate( () => document.fonts.ready );

	// A missing web font falls back silently, so stop instead of writing a wrong image.
	if ( ! ( await page.evaluate( () => document.fonts.check( '800 40px "Bricolage Grotesque"' ) ) ) ) {
		throw new Error( `${ source }: Bricolage Grotesque did not load. Check the network connection.` );
	}

	await page.screenshot( { path: `${ dir }/${ output }` } );
	console.log( output );
	await page.close();
}

await browser.close();
