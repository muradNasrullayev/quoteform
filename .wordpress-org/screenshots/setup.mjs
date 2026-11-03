// Creates the "Home cleaning quote" demo form and a page that shows it, on the
// dev site (`make up`, http://localhost:8083). Run once, before shoot.mjs:
//
//   node .wordpress-org/screenshots/setup.mjs
//
// It writes the form and page ids to fixture.json next to this file.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const DIR = dirname( fileURLToPath( import.meta.url ) );

const BASE = 'http://localhost:8083';
const rest = ( r ) => `${ BASE }/index.php?rest_route=${ r }`;
const opt = ( label, value, price ) => ( { label, value, price } );

const schema = {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2, submit_label: 'Get my quote', success_action: 'message', success_message: 'Thanks! We will confirm your booking within one working day.', redirect_url: '', save_resume: false, store_ip: false },
	fields: {
		bedrooms: { key: 'bedrooms', type: 'slider', label: 'Bedrooms', help: '', placeholder: '', required: true, default: 3, min: 1, max: 8, step: 1 },
		bathrooms: { key: 'bathrooms', type: 'number', label: 'Bathrooms', help: '', placeholder: '', required: true, default: 2, min: 1, max: 6, step: 1 },
		service: { key: 'service', type: 'radio', label: 'Type of cleaning', help: '', placeholder: '', required: true, default: 'standard', options: [ opt( 'Standard clean', 'standard', 0 ), opt( 'Deep clean', 'deep', 80 ), opt( 'Move-out clean', 'move_out', 140 ) ] },
		extras: { key: 'extras', type: 'checkbox', label: 'Extras', help: '', placeholder: '', required: false, default: [], options: [ opt( 'Inside the oven', 'oven', 35 ), opt( 'Inside the fridge', 'fridge', 25 ), opt( 'Interior windows', 'windows', 45 ) ] },
		frequency: { key: 'frequency', type: 'select', label: 'How often?', help: 'Weekly cleaning is 10% off.', placeholder: '', required: true, default: 'once', options: [ opt( 'Just once', 'once', 0 ), opt( 'Every two weeks', 'fortnightly', 0 ), opt( 'Every week', 'weekly', 0 ) ] },
		name: { key: 'name', type: 'text', label: 'Your name', help: '', placeholder: '', required: true, default: '' },
		email: { key: 'email', type: 'email', label: 'Email', help: 'We send the confirmation here.', placeholder: '', required: true, default: '' },
	},
	steps: [
		{ key: 'home', title: 'Your home', description: '', fields: [ 'bedrooms', 'bathrooms', 'service' ] },
		{ key: 'extras_step', title: 'Extras', description: '', fields: [ 'extras', 'frequency' ] },
		{ key: 'contact', title: 'Your details', description: '', fields: [ 'name', 'email' ] },
	],
	calculations: [
		{ key: 'rooms', label: 'Rooms', expression: '{bedrooms} * 40 + {bathrooms} * 30', visible: true },
		{ key: 'service_extras', label: 'Service and extras', expression: '{service.price} + {extras.price}', visible: true },
		{ key: 'discount', label: 'Weekly discount', expression: 'if({frequency} == "weekly", round(({rooms} + {service_extras}) * -0.1, 2), 0)', visible: true },
		{ key: 'total', label: 'Total', expression: '{rooms} + {service_extras} + {discount}', visible: false },
	],
	rules: [
		{ target: { kind: 'field', key: 'frequency' }, action: 'hide', match: 'all', conditions: [ { field: 'service', operator: 'equals', value: 'move_out' } ] },
	],
	notifications: [],
};

const browser = await chromium.launch();
const ctx = await browser.newContext( { baseURL: BASE } );
const page = await ctx.newPage();
await page.goto( '/wp-login.php' );
await page.fill( '#user_login', 'admin' );
await page.fill( '#user_pass', 'admin' );
await page.click( '#wp-submit' );
await page.waitForURL( /wp-admin/ );
const nonce = ( await ( await page.request.get( '/wp-admin/admin-ajax.php?action=rest-nonce' ) ).text() ).trim();
const call = async ( method, route, data ) => {
	const r = await page.request.fetch( rest( route ), { method, headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' }, ...( data ? { data } : {} ) } );
	const body = await r.text();
	if ( r.status() >= 300 ) throw new Error( `${ method } ${ route } ${ r.status() } ${ body }` );
	return JSON.parse( body );
};
const title = 'Home cleaning quote';
const form = await call( 'POST', '/quoteform/v1/forms', { title } );
await call( 'PUT', `/quoteform/v1/forms/${ form.id }`, { title, schema } );
const post = await call( 'POST', '/wp/v2/pages', { title: 'Get a cleaning quote', content: `<!-- wp:shortcode -->[quoteform id="${ form.id }"]<!-- /wp:shortcode -->`, status: 'publish', comment_status: 'closed' } );
writeFileSync( DIR + '/fixture.json', JSON.stringify( { formId: form.id, pageId: post.id, url: post.link } ) );
console.log( form.id, post.id, post.link );
await browser.close();
