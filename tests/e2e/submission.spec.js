const { test, expect } = require( '@playwright/test' );

const { restCall, withAdmin } = require( './helpers' );

function schema( rules = [] ) {
	return {
		version: 1,
		settings: {
			currency: 'USD', currency_position: 'before', decimals: 2, submit_label: 'Get my quote',
			success_action: 'message', success_message: 'Thanks — we got it.', redirect_url: '', save_resume: false, store_ip: false,
		},
		fields: {
			rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', placeholder: '', required: true, default: 1, min: 1, max: 10, step: 1 },
			email: { key: 'email', type: 'email', label: 'Email', help: '', placeholder: '', required: true, default: '' },
		},
		steps: [
			{ key: 'one', title: 'Your home', description: '', fields: [ 'rooms' ] },
			{ key: 'two', title: 'Your email', description: '', fields: [ 'email' ] },
		],
		calculations: [ { key: 'total', label: 'Rooms', expression: '{rooms} * 50', visible: true } ],
		rules,
		notifications: [],
	};
}

const hideStepTwo = [ { target: { kind: 'step', key: 'two' }, action: 'hide', match: 'all', conditions: [ { field: 'rooms', operator: 'greater', value: 5 } ] } ];

async function publish( page, nonce, title, formSchema ) {
	const created = await restCall( page, nonce, 'POST', '/quoteform/v1/forms', { title } );

	expect( created.status, created.body ).toBe( 201 );

	const saved = await restCall( page, nonce, 'PUT', `/quoteform/v1/forms/${ created.json.id }`, { title, schema: formSchema } );

	expect( saved.status, saved.body ).toBe( 200 );

	// `comment_status: 'closed'` — Twenty Twenty-Five-nin şərh formu da "Email"
	// və "Website" etiketləri daşıyır (WP-nin öz şərh sahələri). Açıq qalsaydı,
	// `getByLabel( 'Email' )` bu formanın öz sahəsi ilə WordPress-in şərh
	// formundakı sahəni ayırd edə bilməzdi (strict mode violation).
	const post = await restCall( page, nonce, 'POST', '/wp/v2/posts', { title, content: `[quoteform id="${ created.json.id }"]`, status: 'publish', comment_status: 'closed' } );

	expect( post.status, post.body ).toBe( 201 );

	return { formId: created.json.id, postId: post.json.id, url: post.json.link };
}

async function remove( page, nonce, fixture ) {
	if ( ! fixture ) {
		return;
	}

	await restCall( page, nonce, 'DELETE', `/wp/v2/posts/${ fixture.postId }&force=true` );
	await restCall( page, nonce, 'DELETE', `/quoteform/v1/forms/${ fixture.formId }` );
}

test.describe( 'sending a quote', () => {
	let twoSteps = null;
	let shortcut = null;

	test.beforeAll( async ( { browser } ) => {
		const run = Date.now();

		await withAdmin( browser, async ( page, nonce ) => {
			twoSteps = await publish( page, nonce, `Submit two steps ${ run }`, schema() );
			shortcut = await publish( page, nonce, `Submit shortcut ${ run }`, schema( hideStepTwo ) );
		} );
	} );

	test.afterAll( async ( { browser } ) => {
		await withAdmin( browser, async ( page, nonce ) => {
			await remove( page, nonce, twoSteps );
			await remove( page, nonce, shortcut );
		} );
	} );

	test( 'a visitor sends the form and sees the price the server worked out', async ( { page } ) => {
		await page.goto( twoSteps.url );
		await page.getByLabel( 'Rooms' ).fill( '3' );
		await page.getByRole( 'button', { name: 'Next' } ).click();
		await page.getByLabel( 'Email' ).fill( 'jane@example.com' );
		await page.getByRole( 'button', { name: 'Get my quote' } ).click();

		const panel = page.locator( '[data-quoteform-success]' );

		await expect( panel ).toBeVisible( { timeout: 10000 } );
		await expect( panel ).toContainText( 'Thanks — we got it.' );
		await expect( panel ).toContainText( '$150.00' );
		await expect( panel ).toBeFocused();
	} );

	test( 'the submit button moves to the last step a rule leaves visible', async ( { page } ) => {
		await page.goto( shortcut.url );
		await page.getByLabel( 'Rooms' ).fill( '6' );

		await expect( page.getByRole( 'button', { name: 'Next' } ) ).toHaveCount( 0 );
		await page.getByRole( 'button', { name: 'Get my quote' } ).click();
		await expect( page.locator( '[data-quoteform-success]' ) ).toContainText( '$300.00', { timeout: 10000 } );
	} );

	test( 'a stale nonce from a cached page is renewed without the visitor noticing', async ( { page } ) => {
		let sessions = 0;

		await page.route( /quoteform(%2F|\/)v1(%2F|\/)session/, async ( route ) => {
			sessions += 1;
			const response = await route.fetch();
			const body = await response.json();

			await route.fulfill( { response, json: sessions === 1 ? { ...body, nonce: 'stale' } : body } );
		} );

		await page.goto( shortcut.url );
		await page.getByLabel( 'Rooms' ).fill( '7' );
		await page.getByRole( 'button', { name: 'Get my quote' } ).click();

		await expect( page.locator( '[data-quoteform-success]' ) ).toContainText( '$350.00', { timeout: 10000 } );
		expect( sessions ).toBe( 2 );
	} );

	test( 'the whole flow works from the keyboard', async ( { page } ) => {
		await page.goto( shortcut.url );
		await page.getByLabel( 'Rooms' ).fill( '6' );
		await page.getByRole( 'button', { name: 'Get my quote' } ).focus();
		await page.keyboard.press( 'Enter' );

		await expect( page.locator( '[data-quoteform-success]' ) ).toBeFocused( { timeout: 10000 } );
	} );
} );
