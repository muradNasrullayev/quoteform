// Takes screenshot-1.png … screenshot-7.png for the wordpress.org plugin page
// and writes them to .wordpress-org/. Needs the dev site and setup.mjs first:
//
//   node .wordpress-org/screenshots/shoot.mjs
//
// It deletes the demo form's entries, submits three new ones as a visitor and
// then shoots the front end, the builder and the Entries screen.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const DIR = dirname( fileURLToPath( import.meta.url ) );
const OUT = dirname( DIR );
const fx = JSON.parse( readFileSync( DIR + '/fixture.json' ) );
const BASE = 'http://localhost:8083';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const HIDE = '.update-nag,#wp-admin-bar-updates,.notice,#wpfooter{display:none!important}';
const b = await chromium.launch( { args: [ '--lang=en-US' ] } );

// --- admin session
const actx = await b.newContext( { baseURL: BASE, viewport: { width: 1440, height: 900 }, locale: 'en-US', userAgent: UA } );
const a = await actx.newPage();
await a.goto( '/wp-login.php' );
await a.fill( '#user_login', 'admin' ); await a.fill( '#user_pass', 'admin' ); await a.click( '#wp-submit' );
await a.waitForURL( /wp-admin/ );
const nonce = ( await ( await a.request.get( '/wp-admin/admin-ajax.php?action=rest-nonce' ) ).text() ).trim();
const list = await ( await a.request.get( `${ BASE }/index.php?rest_route=/quoteform/v1/entries&form=${ fx.formId }`, { headers: { 'X-WP-Nonce': nonce } } ) ).json();
for ( const e of list.entries ?? list.items ?? [] ) {
	const r = await a.request.fetch( `${ BASE }/index.php?rest_route=/quoteform/v1/entries/${ e.id }`, { method: 'DELETE', headers: { 'X-WP-Nonce': nonce } } );
	console.log( 'deleted', e.id, r.status() );
}

// --- visitors
const vctx = await b.newContext( { viewport: { width: 1280, height: 900 }, locale: 'en-US', userAgent: UA } );
async function frontShot( p, name ) {
	await p.locator( ':focus' ).evaluateAll( ( els ) => els.forEach( ( el ) => el.blur() ) );
	await p.mouse.move( 0, 0 );
	await p.waitForTimeout( 400 );
	const t = await p.locator( 'h1' ).first().boundingBox();
	const f = await p.locator( '.quoteform' ).first().boundingBox();
	const pad = 48, x = Math.min( t.x, f.x ) - pad, y = t.y - pad;
	await p.screenshot( { path: `${ OUT }/${ name }`, clip: { x, y, width: f.width + pad * 2, height: f.y + f.height - y + pad } } );
}
const people = [
	[ 'Tom Becker', 'tom@example.com', '2', '1', 'Standard clean', [], 'fortnightly' ],
	[ 'Aisha Rahman', 'aisha@example.com', '3', '2', 'Move-out clean', [ 'Inside the oven', 'Inside the fridge' ], null ],
	[ 'Lena Fischer', 'lena@example.com', '4', '2', 'Deep clean', [ 'Inside the oven', 'Interior windows' ], 'weekly' ],
];
for ( const [ name, email, beds, baths, service, extras, freq ] of people ) {
	const last = name === 'Lena Fischer';
	const p = await vctx.newPage();
	await p.goto( fx.url );
	await p.getByLabel( 'Bedrooms' ).fill( beds );
	await p.getByLabel( 'Bathrooms' ).fill( baths );
	await p.getByLabel( service ).check();
	await p.getByRole( 'button', { name: 'Next' } ).click();
	for ( const e of extras ) await p.getByLabel( e ).check();
	if ( freq ) await p.getByLabel( 'How often?' ).selectOption( freq );
	await p.getByRole( 'button', { name: 'Next' } ).click();
	await p.getByLabel( 'Your name' ).fill( name );
	await p.getByLabel( 'Email' ).fill( email );
	if ( last ) await frontShot( p, 'screenshot-1.png' );
	await p.waitForTimeout( 3500 );
	await p.getByRole( 'button', { name: 'Get my quote' } ).click();
	await p.getByText( 'Thanks! We will confirm' ).waitFor( { timeout: 10000 } );
	if ( last ) await frontShot( p, 'screenshot-2.png' );
	await p.close();
}

// --- admin shots: crop below the content
async function adminShot( name ) {
	await a.addStyleTag( { content: HIDE } );
	await a.mouse.move( 1435, 895 );
	await a.waitForTimeout( 500 );
	const bottom = await a.evaluate( () => {
		let max = 0;
		document.querySelectorAll( '#wpbody-content *' ).forEach( ( el ) => {
			const r = el.getBoundingClientRect();
			if ( r.height > 0 && getComputedStyle( el ).display !== 'none' ) max = Math.max( max, r.bottom + window.scrollY );
		} );
		return Math.ceil( max );
	} );
	await a.setViewportSize( { width: 1440, height: Math.max( 560, bottom + 24 ) } );
	await a.mouse.move( 1435, Math.max( 560, bottom + 24 ) - 5 );
	await a.waitForTimeout( 300 );
	await a.screenshot( { path: `${ OUT }/${ name }` } );
	await a.setViewportSize( { width: 1440, height: 900 } );
}
async function openEditor() {
	await a.goto( '/wp-admin/admin.php?page=quoteform' );
	await a.getByRole( 'row' ).filter( { hasText: `ID ${ fx.formId }` } ).getByRole( 'button', { name: 'Edit' } ).click();
	await a.waitForTimeout( 1000 );
}
await openEditor();
await a.locator( 'nav' ).getByText( 'Pricing' ).click();
await adminShot( 'screenshot-3.png' );
await a.locator( 'nav' ).getByText( 'Fields' ).click();
await a.getByText( 'Type of cleaning (service)' ).click();
await adminShot( 'screenshot-4.png' );
await a.locator( 'nav' ).getByText( 'Rules' ).click();
await adminShot( 'screenshot-5.png' );
await a.goto( '/wp-admin/admin.php?page=quoteform-entries' );
await a.waitForTimeout( 1200 );
await adminShot( 'screenshot-6.png' );
await a.getByRole( 'row' ).filter( { hasText: 'Lena Fischer' } ).getByRole( 'link', { name: 'View' } ).or( a.getByRole( 'row' ).filter( { hasText: 'Lena Fischer' } ).getByRole( 'button', { name: 'View' } ) ).first().click();
await a.waitForTimeout( 1200 );
await adminShot( 'screenshot-7.png' );
await b.close();
console.log( 'done' );
