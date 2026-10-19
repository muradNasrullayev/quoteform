const fs = require( 'fs' );
const { test, expect } = require( '@playwright/test' );

const { BASE_URL, restCall, signIn, withAdmin } = require( './helpers' );

function schema() {
	return {
		version: 1,
		settings: {
			currency: 'USD', currency_position: 'before', decimals: 2, submit_label: 'Send my request',
			success_action: 'message', success_message: 'Thanks — request received.', redirect_url: '', save_resume: false, store_ip: false,
		},
		fields: {
			name: { key: 'name', type: 'text', label: 'Your name', help: '', placeholder: '', required: true, default: '' },
			email: { key: 'email', type: 'email', label: 'Email', help: '', placeholder: '', required: true, default: '' },
			rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', placeholder: '', required: true, default: 1, min: 1, max: 10, step: 1 },
		},
		steps: [ { key: 'one', title: 'Your request', description: '', fields: [ 'name', 'email', 'rooms' ] } ],
		calculations: [ { key: 'total', label: 'Rooms', expression: '{rooms} * 50', visible: true } ],
		rules: [],
		notifications: [],
	};
}

async function publish( page, nonce, title ) {
	const created = await restCall( page, nonce, 'POST', '/quoteform/v1/forms', { title } );

	expect( created.status, created.body ).toBe( 201 );

	const fixture = { formId: created.json.id, postId: null, url: null };
	const saved = await restCall( page, nonce, 'PUT', `/quoteform/v1/forms/${ fixture.formId }`, { title, schema: schema() } );

	if ( saved.status !== 200 ) {
		await restCall( page, nonce, 'DELETE', `/quoteform/v1/forms/${ fixture.formId }` );
	}

	expect( saved.status, saved.body ).toBe( 200 );

	// Mövzunun şərh formasında da "Email"/"Website" label-ləri var — getByLabel strict rejimdə iki element tapardı.
	const post = await restCall( page, nonce, 'POST', '/wp/v2/posts', { title, content: `[quoteform id="${ fixture.formId }"]`, status: 'publish', comment_status: 'closed' } );

	if ( post.status !== 201 ) {
		// fixture hələ qaytarılmayıb, afterAll onu görməyəcək — yaratdığımız formanı burada silirik.
		await restCall( page, nonce, 'DELETE', `/quoteform/v1/forms/${ fixture.formId }` );
	}

	expect( post.status, post.body ).toBe( 201 );

	fixture.postId = post.json.id;
	fixture.url = post.json.link;

	return fixture;
}

function badgeCount( text ) {
	return Number( String( text ).replace( /\D/g, '' ) || '0' );
}

test.describe( 'the entries screen', () => {
	test.describe.configure( { mode: 'serial' } );

	// `null` = "heç nə yaratmamışıq". beforeAll düşsə də Playwright afterAll-u işlədir —
	// o zaman heç nəyə toxunulmur.
	let fixture = null;

	test.beforeAll( async ( { browser } ) => {
		await withAdmin( browser, async ( page, nonce ) => {
			fixture = await publish( page, nonce, `Entries e2e ${ Date.now() }` );
		} );
	} );

	test.afterAll( async ( { browser } ) => {
		if ( fixture === null ) {
			return;
		}

		await withAdmin( browser, async ( page, nonce ) => {
			// Forma bu qaçışda yaradılıb, ona görə onun bütün müraciətləri bizimdir.
			const listed = await restCall( page, nonce, 'GET', `/quoteform/v1/entries&form=${ fixture.formId }` );

			expect( listed.status, listed.body ).toBe( 200 );

			const ids = listed.json.items.map( ( item ) => item.id );

			if ( ids.length > 0 ) {
				const removed = await restCall( page, nonce, 'POST', '/quoteform/v1/entries/batch', { action: 'delete', ids } );

				expect( removed.status, removed.body ).toBe( 200 );
			}

			if ( fixture.postId !== null ) {
				await restCall( page, nonce, 'DELETE', `/wp/v2/posts/${ fixture.postId }&force=true` );
			}

			await restCall( page, nonce, 'DELETE', `/quoteform/v1/forms/${ fixture.formId }` );
		} );
	} );

	test( 'a sent quote is listed as new, read when opened, exported and deleted', async ( { browser, page } ) => {
		await signIn( page );
		await page.goto( '/wp-admin/admin.php?page=quoteform-entries' );

		const badge = page.locator( '#adminmenu .quoteform_unread-badge .pending-count' ).first();
		const before = badgeCount( await badge.textContent() );

		// Ziyarətçi (ayrı, giriş etməmiş kontekst) formanı göndərir.
		const visitor = await browser.newContext( { baseURL: BASE_URL } );
		const guest = await visitor.newPage();

		await guest.goto( fixture.url );
		await guest.getByLabel( 'Your name' ).fill( '=HYPERLINK("http://example.test")' );
		await guest.getByLabel( 'Email' ).fill( 'jane@example.com' );
		await guest.getByLabel( 'Rooms' ).fill( '3' );
		await guest.getByRole( 'button', { name: 'Send my request' } ).click();
		await expect( guest.locator( '[data-quoteform-success]' ) ).toContainText( '$150.00', { timeout: 10000 } );
		await visitor.close();

		// Siyahı: New, mətn olduğu kimi, server formatlı total, menyu nişanı +1.
		await page.goto( `/wp-admin/admin.php?page=quoteform-entries&form=${ fixture.formId }` );

		const row = page.getByRole( 'row' ).filter( { hasText: 'jane@example.com' } );

		await expect( row ).toContainText( 'New' );
		await expect( row ).toContainText( '=HYPERLINK("http://example.test")' );
		await expect( row ).toContainText( '$150.00' );
		await expect( badge ).toHaveText( String( before + 1 ) );

		// Açılış: detal, fokus başlıqda, oxunmuş, nişan geri azalır.
		await row.getByRole( 'link', { name: /^View entry #\d+$/ } ).click();

		await expect( page ).toHaveURL( /entry=\d+/ );
		await expect( page.getByRole( 'heading', { level: 1, name: /^Entry #\d+$/ } ) ).toBeFocused();
		await expect( page.locator( '.quoteform_entry__status' ) ).toHaveText( 'Read' );
		await expect( page.getByText( 'jane@example.com' ) ).toBeVisible();
		await expect( badge ).toHaveText( String( before ) );

		// "Geri" siyahıya qaytarır; sətir artıq New deyil.
		await page.goBack();
		await expect( page ).not.toHaveURL( /entry=/ );
		await expect( row ).toBeVisible();
		await expect( row.locator( '.quoteform_entries__new' ) ).toHaveCount( 0 );

		// CSV: bu formanın sütunları, BOM, formul qoruyucusu.
		const downloading = page.waitForEvent( 'download' );

		await page.getByRole( 'link', { name: 'Export CSV' } ).click();

		const download = await downloading;

		expect( download.suggestedFilename() ).toMatch( /^quoteform-entries-\d{4}-\d{2}-\d{2}\.csv$/ );

		const csv = fs.readFileSync( await download.path(), 'utf8' );

		expect( csv.charCodeAt( 0 ) ).toBe( 0xfeff );
		expect( csv ).toContain( 'Your name' );
		expect( csv ).toContain( 'jane@example.com' );
		expect( csv ).toContain( '"\'=HYPERLINK(""http://example.test"")"' );

		// Silmə: təsdiqlə, sonra boş filtr halı və fokus başlıqda.
		await row.getByRole( 'button', { name: /^Delete entry #\d+$/ } ).click();
		await page.getByRole( 'button', { name: 'Delete permanently' } ).click();

		await expect( page.getByText( 'No entries match these filters.' ) ).toBeVisible();
		await expect( page.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).toBeFocused();
	} );

	test( 'filters and sorting survive a reload', async ( { page } ) => {
		await signIn( page );
		await page.goto( `/wp-admin/admin.php?page=quoteform-entries&form=${ fixture.formId }&status=read&orderby=total&order=asc&junk=1` );

		await expect( page.getByRole( 'combobox', { name: 'Form' } ) ).toHaveValue( String( fixture.formId ) );
		await expect( page.getByRole( 'combobox', { name: 'Status' } ) ).toHaveValue( 'read' );
		await expect( page ).toHaveURL( new RegExp( `\\?page=quoteform-entries&form=${ fixture.formId }&status=read&orderby=total&order=asc$` ) );

		await page.reload();

		await expect( page.getByRole( 'combobox', { name: 'Status' } ) ).toHaveValue( 'read' );
	} );
} );
