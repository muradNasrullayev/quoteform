const { expect } = require( '@playwright/test' );

// `playwright.config.js` da bunu oxuyur — stack-in ünvanı İKİ yerdə yazılsaydı,
// birini dəyişib o birini unutmaq testləri səssizcə başqa sayta yönəldərdi.
const BASE_URL = 'http://localhost:8083';

// Bu sayt pretty permalink-siz qurulub (`make setup` onu təyin etmir), ona görə
// `/wp-json/…` 404 verir. `?rest_route=` HƏR iki halda işləyir — WordPress onu
// permalink quruluşundan asılı olmayaraq tanıyır.
const rest = ( route ) => `/index.php?rest_route=${ route }`;

/**
 * Builder-in özünün istifadə etdiyi REST nonce.
 *
 * `builder.spec.js` REST-ə testlərin özündə getmir: o, admin səhifəsini açır və
 * nonce-u `@wordpress/api-fetch`-in nonce middleware-i daşıyır. Həmin
 * middleware-in `nonceEndpoint`-i məhz budur (`wp.apiFetch.nonceEndpoint` bu
 * URL-i qaytarır), ona görə bu ikinci bir yanaşma deyil — eyni sessiya, eyni
 * nonce mənbəyi, sadəcə builder bundle-ı yüklənmədən oxunur: təmizləmə
 * builder-in JS-i qırıldığı üçün DÜŞMƏMƏLİDİR, onu testlərin özü tutur.
 */
async function restNonce( page ) {
	const response = await page.request.get( '/wp-admin/admin-ajax.php?action=rest-nonce' );

	expect( response.status(), 'the REST nonce endpoint' ).toBe( 200 );

	const nonce = ( await response.text() ).trim();

	expect( nonce, 'the REST nonce' ).not.toBe( '' );

	return nonce;
}

async function restCall( page, nonce, method, route, data ) {
	const response = await page.request.fetch( rest( route ), {
		method,
		headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' },
		...( data === undefined ? {} : { data } ),
	} );

	const body = await response.text();

	return { status: response.status(), body, json: body === '' ? null : JSON.parse( body ) };
}

// Qurğu bir dəfə qurulur, ziyarətçi isə çıxış etmiş olur: ön tərəf testləri heç
// vaxt giriş etmir, ona görə səhifədə admin bar yoxdur və görülən şey məhz
// ziyarətçinin gördüyüdür.
async function withAdmin( browser, work ) {
	const context = await browser.newContext( { baseURL: BASE_URL } );
	const page = await context.newPage();

	try {
		await signIn( page );

		return await work( page, await restNonce( page ) );
	} finally {
		await context.close();
	}
}

// `GET /quoteform/v1/forms` yalnız `publish` və `draft` qaytarır — trash-a
// atılan forma siyahıdan düşür, yəni bu funksiya "bu qaçışdan sonra sayta
// hansı formalar QALDI" sualına cavab verir.
async function formIds( page, nonce ) {
	const perPage = 100;
	const ids = [];

	for ( let pageNumber = 1; pageNumber <= 20; pageNumber += 1 ) {
		const listed = await restCall(
			page,
			nonce,
			'GET',
			`/quoteform/v1/forms&per_page=${ perPage }&page=${ pageNumber }`
		);

		expect( listed.status, `listing forms: ${ listed.body }` ).toBe( 200 );

		listed.json.forEach( ( form ) => ids.push( form.id ) );

		if ( listed.json.length < perPage ) {
			return ids;
		}
	}

	throw new Error( 'There are more forms on this site than the cleanup helper will page through.' );
}

async function signIn( page ) {
	await page.goto( '/wp-login.php' );
	await page.fill( '#user_login', 'admin' );
	await page.fill( '#user_pass', 'admin' );
	await page.click( '#wp-submit' );
	await expect( page ).toHaveURL( /wp-admin/ );
}

// Yalnız Tab ilə çatır: `.focus()` klaviatura yolunu atlayardı, halbuki
// testin bütün mənası o yolun keçilə bilməsidir.
async function tabTo( page, locator, what ) {
	const handle = await locator.elementHandle();

	if ( ! handle ) {
		throw new Error( `${ what } is not in the page at all` );
	}

	for ( let step = 0; step < 300; step += 1 ) {
		if ( await handle.evaluate( ( el ) => el === document.activeElement ) ) {
			return;
		}

		await page.keyboard.press( 'Tab' );
	}

	throw new Error( `Tab never reached ${ what }` );
}

async function activate( page, locator, what ) {
	await tabTo( page, locator, what );
	await page.keyboard.press( 'Enter' );
}

async function expectFocusKept( page, what ) {
	await expect
		.poll(
			() =>
				page.evaluate(
					() => ! document.activeElement || document.activeElement === document.body
				),
			{ message: `focus fell to <body> after ${ what }`, timeout: 3000 }
		)
		.toBe( false );
}

module.exports = {
	BASE_URL,
	activate,
	expectFocusKept,
	formIds,
	restCall,
	restNonce,
	signIn,
	tabTo,
	withAdmin,
};
