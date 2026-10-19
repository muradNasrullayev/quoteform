const { test, expect } = require( '@playwright/test' );

const { expectFocusKept, restCall, tabTo, withAdmin } = require( './helpers' );

function settings() {
	return {
		currency: 'USD',
		currency_position: 'before',
		decimals: 2,
		submit_label: 'Get my quote',
		success_action: 'message',
		success_message: 'Thanks — your quote is on the way.',
		redirect_url: '',
		save_resume: true,
		store_ip: false,
	};
}

/**
 * İki sahə, üç addım, ortadakını gizlədən bir qayda.
 *
 * Etiketlər və addım BAŞLIQLARI ssenarinin selektorlarıdır, doldurucu deyil:
 * `Rooms`/`Urgency` `getByLabel`-in, `Notes` isə `getByRole( 'heading' )`-in
 * axtardığı mətndir (addımın başlığı öz `title`-ıdır, içindəki sahənin etiketi
 * deyil — ona görə `notes` sahəsi qəsdən başqa cür adlanır).
 */
function quoteSchema() {
	return {
		version: 1,
		settings: settings(),
		fields: {
			rooms: {
				key: 'rooms',
				type: 'number',
				label: 'Rooms',
				help: 'How many rooms need cleaning?',
				placeholder: '',
				required: true,
				default: 1,
				min: 1,
				max: 100,
				step: 1,
			},
			urgency: {
				key: 'urgency',
				type: 'select',
				label: 'Urgency',
				help: '',
				placeholder: '',
				required: false,
				default: '',
				options: [
					{ label: 'Standard', value: 'standard', price: 0 },
					{ label: 'Express', value: 'express', price: 60 },
				],
			},
			details: {
				key: 'details',
				type: 'textarea',
				label: 'Extra details',
				help: '',
				placeholder: '',
				required: false,
				default: '',
			},
			notes: {
				key: 'notes',
				type: 'textarea',
				label: 'Anything else',
				help: '',
				placeholder: '',
				required: false,
				default: '',
			},
		},
		steps: [
			{ key: 'step_one', title: 'Your property', description: '', fields: [ 'rooms', 'urgency' ] },
			{ key: 'step_two', title: 'Details', description: '', fields: [ 'details' ] },
			{ key: 'step_three', title: 'Notes', description: '', fields: [ 'notes' ] },
		],
		calculations: [
			{
				key: 'total',
				expression: '{rooms} * 50 + {urgency.price}',
				label: 'Total',
				visible: true,
			},
		],
		rules: [
			{
				target: { kind: 'step', key: 'step_two' },
				action: 'hide',
				match: 'all',
				conditions: [ { field: 'rooms', operator: 'greater', value: 2 } ],
			},
		],
		notifications: [],
	};
}

// Sıfıra bölmə KOMPİLYASİYA vaxtı tutulmur (`CalculationValidator` yalnız
// ifadəni qurur, onu hesablamır) — yəni belə bir formul REALDIR: sayt sahibi
// onu saxlaya bilir və ziyarətçi onunla üzləşir.
function brokenSchema() {
	const schema = quoteSchema();

	schema.calculations[ 0 ].expression = '{rooms} / 0';

	return schema;
}

/**
 * Formanı REST üzərindən qurur (builder UI-ından keçmək bu dəsti hər builder
 * baqına bağlayardı), sonra `[quoteform id="…"]` shortcode-u ilə bir yazı
 * dərc edir və onun ünvanını qaytarır.
 */
async function publishForm( page, nonce, title, schema ) {
	const created = await restCall( page, nonce, 'POST', '/quoteform/v1/forms', { title } );

	expect( created.status, `creating the form: ${ created.body }` ).toBe( 201 );

	const formId = created.json.id;

	const saved = await restCall( page, nonce, 'PUT', `/quoteform/v1/forms/${ formId }`, {
		title,
		schema,
	} );

	expect( saved.status, `saving the schema: ${ saved.body }` ).toBe( 200 );

	const post = await restCall( page, nonce, 'POST', '/wp/v2/posts', {
		title,
		content: `[quoteform id="${ formId }"]`,
		status: 'publish',
	} );

	expect( post.status, `publishing the post: ${ post.body }` ).toBe( 201 );

	return { formId, postId: post.json.id, url: post.json.link };
}

// HƏR iki silmə yoxlanılır. Yoxlanılmasaydı, icazəsi dəyişmiş və ya nonce-u
// bitmiş bir təmizləmə 403 qaytarardı, dəst isə yaşıl qalıb hər qaçışda
// PAYLAŞILAN bazaya sətir yığardı — bu stack uzunömürlüdür, `playwright.config.js`
// onu sıfırlamır.
async function removeForm( page, nonce, fixture ) {
	if ( ! fixture ) {
		return;
	}

	const post = await restCall( page, nonce, 'DELETE', `/wp/v2/posts/${ fixture.postId }&force=true` );

	expect( post.status, `removing the published post: ${ post.body }` ).toBe( 200 );

	const form = await restCall( page, nonce, 'DELETE', `/quoteform/v1/forms/${ fixture.formId }` );

	expect( form.status, `removing the form: ${ form.body }` ).toBe( 200 );
}

test.describe( 'the rendered form', () => {
	let quote;
	let broken;

	test.beforeAll( async ( { browser } ) => {
		const run = Date.now();

		await withAdmin( browser, async ( page, nonce ) => {
			quote = await publishForm( page, nonce, `Renderer quote ${ run }`, quoteSchema() );
			broken = await publishForm( page, nonce, `Renderer broken ${ run }`, brokenSchema() );
		} );
	} );

	test.afterAll( async ( { browser } ) => {
		await withAdmin( browser, async ( page, nonce ) => {
			await removeForm( page, nonce, quote );
			await removeForm( page, nonce, broken );
		} );
	} );

	test( 'prices a multi-step form live and skips a hidden step', async ( { page } ) => {
		await page.goto( quote.url );

		const total = page.locator( '[data-quoteform-total]' );
		// Gedişat mətni `[data-quoteform-progress]` ilə tutulur, `getByText`
		// ilə YOX: eyni cümləni canlı sahə də deyir ("Step 1 of 2. Total …"),
		// ona görə `getByText( 'Step 1 of 2' )` elan gəldikdən sonra İKİ element
		// tapır və strict mode pozuntusu verir — testin nə vaxt qaçdığından asılı.
		const progress = page.locator( '[data-quoteform-progress]' );

		await expect( progress ).toHaveText( 'Step 1 of 3' );
		await expect( total ).toHaveText( '$50.00' );

		await page.getByLabel( 'Urgency' ).selectOption( 'express' );
		await expect( total ).toHaveText( '$110.00' );

		await page.getByLabel( 'Rooms' ).fill( '3' );
		await expect( total ).toHaveText( '$210.00' );
		await expect( progress ).toHaveText( 'Step 1 of 2' );

		await page.getByRole( 'button', { name: 'Next' } ).click();

		await expect( page.getByRole( 'heading', { name: 'Notes' } ) ).toBeVisible();

		// Gizlənən addım ATLANIR — nə göstərilir, nə də səhifədə qalır.
		await expect( page.getByRole( 'heading', { name: 'Details' } ) ).toHaveCount( 0 );
		await expect( page.getByLabel( 'Extra details' ) ).toHaveCount( 0 );

		// `urgency` BİRİNCİ addımdadır, ona görə gizlənən addım onun 60-ını
		// qiymətdən çıxarmır; son addımda açılış da görünür.
		await expect( total ).toHaveText( '$210.00' );
		await expect( page.locator( '[data-quoteform-breakdown]' ) ).toContainText( '$210.00' );
	} );

	test( 'is driven entirely by the keyboard, and never drops focus', async ( { page } ) => {
		await page.goto( quote.url );

		const total = page.locator( '[data-quoteform-total]' );
		const progress = page.locator( '[data-quoteform-progress]' );
		const rooms = page.getByLabel( 'Rooms' );
		const urgency = page.getByLabel( 'Urgency' );

		await expect( total ).toHaveText( '$50.00' );

		// Rəqəm sahəsini yalnız klaviatura ilə 1-dən 3-ə qaldırır.
		await tabTo( page, rooms, 'the Rooms field' );
		await page.keyboard.press( 'ArrowUp' );
		await page.keyboard.press( 'ArrowUp' );

		await expect( rooms ).toHaveValue( '3' );
		await expect( total ).toHaveText( '$150.00' );
		await expect( progress ).toHaveText( 'Step 1 of 2' );
		await expectFocusKept( page, 'typing into Rooms' );

		// Görünürlük dəyişdi, amma CARİ addım dəyişmədi — forma fokusu
		// ziyarətçinin əlindən almamalıdır.
		await expect( rooms ).toBeFocused();

		// Bağlı `<select>`-də oxlar platformadan asılıdır; hərf yazmaq isə hər
		// yerdə seçimi dəyişib `change` göndərir (builder dəsti də belə edir).
		await tabTo( page, urgency, 'the Urgency field' );
		await page.keyboard.press( 'e' );

		await expect( urgency ).toHaveValue( 'express' );
		await expect( total ).toHaveText( '$210.00' );
		await expectFocusKept( page, 'choosing an urgency' );

		// İrəli.
		const next = page.getByRole( 'button', { name: 'Next' } );

		await tabTo( page, next, 'the Next button' );
		await page.keyboard.press( 'Enter' );

		const notes = page.getByRole( 'heading', { name: 'Notes' } );

		await expect( notes ).toBeVisible();
		await expectFocusKept( page, 'moving to the next step' );
		await expect( notes ).toBeFocused();

		// Geri.
		const back = page.getByRole( 'button', { name: 'Back' } );

		await tabTo( page, back, 'the Back button' );
		await page.keyboard.press( 'Enter' );

		const property = page.getByRole( 'heading', { name: 'Your property' } );

		await expect( property ).toBeVisible();
		await expectFocusKept( page, 'moving back a step' );
		await expect( property ).toBeFocused();

		// Geri qayıtdıqdan sonra da dəyərlər və qiymət yerindədir.
		await expect( rooms ).toHaveValue( '3' );
		await expect( total ).toHaveText( '$210.00' );
	} );

	test( 'keeps working when a formula is broken', async ( { page } ) => {
		const failures = [];

		page.on( 'pageerror', ( error ) => failures.push( String( error ) ) );

		await page.goto( broken.url );

		await expect( page.locator( '[data-quoteform-total]' ) ).toBeHidden();
		await expect( page.getByLabel( 'Rooms' ) ).toBeEditable();

		// Sınıq formul formanı DAYANDIRMIR: sahə hələ də işləyir, addımlar hələ
		// də gedir — sadəcə göstəriləsi qiymət yoxdur (spec §14, səviyyə 2).
		await page.getByLabel( 'Rooms' ).fill( '4' );

		await expect( page.locator( '[data-quoteform-progress]' ) ).toHaveText( 'Step 1 of 2' );
		await expect( page.locator( '[data-quoteform-total]' ) ).toBeHidden();

		await page.getByRole( 'button', { name: 'Next' } ).click();
		await expect( page.getByRole( 'heading', { name: 'Notes' } ) ).toBeVisible();

		expect( failures, 'uncaught page errors' ).toEqual( [] );
	} );

	test( 'sends no computed total to the server', async ( { page } ) => {
		const uploads = [];

		page.on( 'request', ( request ) => {
			if ( request.method() !== 'GET' ) {
				uploads.push( `${ request.method() } ${ request.url() } ${ request.postData() || '' }` );
			}
		} );

		await page.goto( quote.url );

		await page.getByLabel( 'Rooms' ).fill( '3' );
		await expect( page.locator( '[data-quoteform-total]' ) ).toHaveText( '$150.00' );

		const html = await page.content();

		expect( html ).not.toMatch( /name="[^"]*total[^"]*"/ );

		// Nə gizli input, nə də hesablanmış məbləği daşıyan bir sorğu:
		// qiymət yalnız brauzerdə yaşayır (D7).
		const names = await page
			.locator( '.quoteform [name]' )
			.evaluateAll( ( nodes ) => nodes.map( ( node ) => node.getAttribute( 'name' ) ) );

		expect( names.join( ' ' ), 'the names the page would post' ).not.toContain( 'total' );
		expect( uploads, 'requests the page made while pricing' ).toEqual( [] );
	} );

	// Spec §16 Lighthouse-da 100 hədəfləyir, amma bu dəstdəki YEGANƏ real
	// brauzerdir: kontrast, opaklıq və vizual sıra jsdom-da ölçülə bilməz.
	// Aşağıdakılar Lighthouse-un məhz həmin auditləridir, pluginin öz CSS-inə
	// tətbiq olunmuş halda — mövzudan miras alınan rənglər bizim deyil.
	test( 'holds the accessibility floor a real browser can measure', async ( { page } ) => {
		await page.goto( quote.url );

		// Səhifədə TAM BİR canlı sahə var. Məbləğ `<output>` DEYİL, məhz buna
		// görə: `<output>`-un implicit `role="status"`-u onu 50ms-lik hesablama
		// ritmində danışan İKİNCİ canlı sahəyə çevirərdi.
		await expect(
			page.locator( '.quoteform [aria-live], .quoteform [role="status"], .quoteform output' )
		).toHaveCount( 1 );
		expect(
			await page
				.locator( '[data-quoteform-total]' )
				.evaluate( ( el ) =>
					[
						el.tagName.toLowerCase(),
						el.getAttribute( 'aria-live' ) || '',
						el.getAttribute( 'role' ) || '',
					].join( '|' )
				),
			'the total element'
		).toBe( 'span||' );

		// Xəta mətni göstərilsin ki, onun da kontrastı ölçülsün. Sahə BOŞ
		// qoyulmur, həddən kənara çıxarılır: boş dəyər məbləği də sındırardı və
		// `.quoteform_total` ölçülməzdən əvvəl gizlənərdi.
		await page.getByLabel( 'Rooms' ).fill( '200' );
		await page.getByRole( 'button', { name: 'Next' } ).click();
		await expect( page.locator( '.quoteform_error' ).first() ).toHaveText( /100 or less/ );

		const audit = await page.locator( '.quoteform' ).evaluate( ( root ) => {
			const channel = ( value ) => {
				const c = value / 255;

				return c <= 0.03928 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 );
			};

			const luminance = ( [ r, g, b ] ) =>
				0.2126 * channel( r ) + 0.7152 * channel( g ) + 0.0722 * channel( b );

			const parse = ( value ) => {
				const parts = String( value ).match( /[\d.]+/g );

				if ( ! parts ) {
					return null;
				}

				return {
					rgb: parts.slice( 0, 3 ).map( Number ),
					alpha: parts.length > 3 ? Number( parts[ 3 ] ) : 1,
				};
			};

			// Şəffaf fon "ağ" deyil — səhifənin altındakı İLK qeyri-şəffaf fon nə
			// isə odur. Tapılmasa kətan ağ sayılır (brauzerin öz davranışı).
			const backgroundOf = ( element ) => {
				let node = element;

				while ( node && node !== document.documentElement.parentNode ) {
					const parsed = parse( window.getComputedStyle( node ).backgroundColor );

					if ( parsed && parsed.alpha > 0 ) {
						return parsed.rgb;
					}

					node = node.parentElement;
				}

				return [ 255, 255, 255 ];
			};

			// `opacity` mətni bütövlükdə fona qarışdırır — `.quoteform_help` və
			// `.quoteform_progress` məhz bununla soluqlaşdırılıb, ona görə ölçü
			// onu nəzərə almalıdır.
			const opacityOf = ( element ) => {
				let node = element;
				let opacity = 1;

				while ( node && node.nodeType === 1 ) {
					opacity *= Number( window.getComputedStyle( node ).opacity );
					node = node.parentElement;
				}

				return opacity;
			};

			const contrastOf = ( element ) => {
				const background = backgroundOf( element );
				const colour = parse( window.getComputedStyle( element ).color );
				const alpha = ( colour ? colour.alpha : 1 ) * opacityOf( element );
				const blended = ( colour ? colour.rgb : [ 0, 0, 0 ] ).map(
					( value, index ) => value * alpha + background[ index ] * ( 1 - alpha )
				);

				const light = luminance( blended );
				const dark = luminance( background );
				const ratio =
					( Math.max( light, dark ) + 0.05 ) / ( Math.min( light, dark ) + 0.05 );

				return Math.round( ratio * 100 ) / 100;
			};

			const visible = ( element ) => {
				const box = element.getBoundingClientRect();

				return box.width > 0 && box.height > 0 && element.textContent.trim() !== '';
			};

			const contrasts = {};

			[
				'.quoteform_step_title',
				'.quoteform_control > label',
				'.quoteform_help',
				'.quoteform_progress',
				'.quoteform_total',
				'.quoteform_error',
				'.quoteform_nav_button',
			].forEach( ( selector ) => {
				const element = [ ...root.querySelectorAll( selector ) ].find( visible );

				if ( element ) {
					contrasts[ selector ] = contrastOf( element );
				}
			} );

			// Vizual sıra DOM sırasını izləyir: `order`/`row-reverse` kimi bir CSS
			// qaydası klaviatura sırasını gözlə görünən sıradan ayırardı.
			const order = [ ...root.querySelectorAll( 'input, select, textarea, button' ) ]
				.filter( ( element ) => element.offsetParent !== null )
				.map( ( element ) => {
					const box = element.getBoundingClientRect();

					return { top: Math.round( box.top ), left: Math.round( box.left ) };
				} );

			return { contrasts, order };
		} );

		// Hər ölçülən mətn WCAG AA-nı (4.5:1) keçir — böyük mətn üçün həddi
		// aşağı salmırıq, çünki heç birinin buna ehtiyacı yoxdur.
		expect( Object.keys( audit.contrasts ).sort() ).toEqual( [
			'.quoteform_control > label',
			'.quoteform_error',
			'.quoteform_help',
			'.quoteform_nav_button',
			'.quoteform_progress',
			'.quoteform_step_title',
			'.quoteform_total',
		] );

		Object.entries( audit.contrasts ).forEach( ( [ selector, ratio ] ) => {
			expect( ratio, `contrast of ${ selector }` ).toBeGreaterThanOrEqual( 4.5 );
		} );

		// Sıra `element.offsetParent !== null` ilə süzülür, yəni `position: fixed`
		// sarğı və ya `display: contents` kimi bir CSS dəyişikliyi massivi BOŞALDA
		// bilər — `[].forEach` isə heç nə iddia etmir və vizual sıra yoxlaması
		// dəsti yaşıl saxlayaraq səssizcə dayanardı.
		expect( audit.order.length, 'controls measured for visual order' ).toBeGreaterThanOrEqual( 2 );

		audit.order.forEach( ( box, index ) => {
			if ( index === 0 ) {
				return;
			}

			const previous = audit.order[ index - 1 ];
			const forwards = box.top > previous.top || ( box.top === previous.top && box.left >= previous.left );

			expect( forwards, `control ${ index } follows control ${ index - 1 } on screen` ).toBe(
				true
			);
		} );
	} );
} );
