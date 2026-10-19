const { test, expect } = require( '@playwright/test' );

const {
	activate,
	expectFocusKept,
	formIds,
	restCall,
	signIn,
	tabTo,
	withAdmin,
} = require( './helpers' );

function tab( page, name ) {
	return page.getByRole( 'button', { name, exact: true } );
}

test.describe( 'the builder', () => {
	// Hər test "Create a form"-a basır, o da DƏRC EDİLMİŞ bir forma yaradır.
	// Stack uzunömürlüdür və `playwright.config.js` bazanı sıfırlamır, yəni
	// təmizləmə olmasa hər qaçış saytda dörd yeni forma qoyur. Silinəsi formalar
	// ID-yə görə seçilir, başlığa görə yox: testlərin üçü formanı adsız
	// ("Untitled form") buraxır, ona görə ad onları bir-birindən ayırmır.
	// `null` = "hələ bilmirik". `beforeAll` düşsə də Playwright `afterAll`-u
	// işlədir; `[]` ilə başlasaq saytdakı HƏR formanı qalıq sayıb silərdi.
	let alreadyThere = null;

	test.beforeAll( async ( { browser } ) => {
		await withAdmin( browser, async ( page, nonce ) => {
			alreadyThere = await formIds( page, nonce );
		} );
	} );

	test.afterAll( async ( { browser } ) => {
		// `beforeAll` siyahını ala bilməyibsə nəyin bizim olduğunu bilmirik — heç nə silmə.
		if ( alreadyThere === null ) {
			return;
		}

		await withAdmin( browser, async ( page, nonce ) => {
			const leftovers = ( await formIds( page, nonce ) ).filter(
				( id ) => alreadyThere.indexOf( id ) === -1
			);

			for ( const id of leftovers ) {
				const removed = await restCall( page, nonce, 'DELETE', `/quoteform/v1/forms/${ id }` );

				expect( removed.status, `removing form ${ id }: ${ removed.body }` ).toBe( 200 );
			}
		} );
	} );

	test.beforeEach( async ( { page } ) => {
		await signIn( page );
		await page.goto( '/wp-admin/admin.php?page=quoteform' );
	} );

	test( 'creates, edits, saves and reloads a form', async ( { page } ) => {
		// The WordPress stack is long-running and its database persists
		// between runs (see playwright.config.js — there is no webServer
		// block to reset it), so every form this test creates stays there.
		// A fixed title would collide with the previous run's form and make
		// `getByRole( 'button', { name: /^Edit …/ } )` below ambiguous.
		const formTitle = `End-to-end quote ${ Date.now() }`;

		await page.getByRole( 'button', { name: 'Create a form' } ).click();

		const title = page.getByLabel( 'Form title' );

		await expect( title ).toBeVisible();
		await title.fill( formTitle );

		// A field.
		await page.getByRole( 'button', { name: 'Add field' } ).click();
		await page.getByRole( 'button', { name: 'New field (number)', exact: true } ).click();
		await page.getByLabel( 'Label' ).fill( 'How many rooms?' );

		// Put it on a step. A new form already ships with one step and one
		// calculation (`SchemaRepository::defaults()`), so there is no need
		// to add either — doing so would leave a second, field-less step
		// that the server refuses to save (`empty_collection` on
		// `steps.1.fields`).
		await page.getByRole( 'button', { name: 'Steps' } ).click();
		await page.getByLabel( 'Step 1 title' ).fill( 'Your property' );
		await page.getByLabel( /^Put How many rooms\? \(number\) on$/ ).selectOption( '0' );
		await page
			.getByRole( 'button', { name: 'Put on step: How many rooms? (number)' } )
			.click();

		// A total that uses it.
		await page.getByRole( 'button', { name: 'Pricing' } ).click();
		await page.getByLabel( 'Calculation 1 key' ).fill( 'total' );
		await page.getByLabel( 'Calculation 1 formula' ).fill( '{number} * 50' );
		await expect( page.getByText( 'This formula is valid.' ) ).toBeVisible();

		await page.getByRole( 'button', { name: 'Save' } ).click();
		await expect( page.getByText( 'Saved.' ) ).toBeVisible();

		// The real test: does it come back?
		await page.reload();
		await page
			.getByRole( 'button', { name: new RegExp( `^Edit “${ formTitle }”` ) } )
			.click();

		await expect( page.getByLabel( 'Form title' ) ).toHaveValue( formTitle );
		await page.getByRole( 'button', { name: 'Pricing' } ).click();
		await expect( page.getByLabel( 'Calculation 1 formula' ) ).toHaveValue( '{number} * 50' );
	} );

	test( 'shows a server validation error against the control that caused it', async ( { page } ) => {
		await page.getByRole( 'button', { name: 'Create a form' } ).click();
		await expect( page.getByLabel( 'Form title' ) ).toBeVisible();

		await page.getByRole( 'button', { name: 'Settings' } ).click();
		await page.getByLabel( 'Decimal places' ).fill( '9' );
		await page.getByRole( 'button', { name: 'Save' } ).click();

		const decimals = page.getByLabel( 'Decimal places' );

		await expect( decimals ).toHaveAttribute( 'aria-invalid', 'true' );
		await expect( page.getByRole( 'alert' ) ).toContainText( 'settings.decimals' );
	} );

	test( 'refuses to save a broken formula, and says which one', async ( { page } ) => {
		await page.getByRole( 'button', { name: 'Create a form' } ).click();
		await expect( page.getByLabel( 'Form title' ) ).toBeVisible();

		await page.getByRole( 'button', { name: 'Pricing' } ).click();
		await page.getByLabel( 'Calculation 1 formula' ).fill( '{rooms} * ' );
		await page.getByRole( 'button', { name: 'Save' } ).click();

		await expect( page.getByRole( 'alert' ) ).toContainText( 'calculations.0.expression' );
	} );

	test( 'the whole builder is driven with the keyboard alone, and never drops focus', async ( {
		page,
	} ) => {
		await expect( page.getByRole( 'button', { name: 'Create a form' } ) ).toBeVisible();

		// The form list.
		await activate( page, page.getByRole( 'button', { name: 'Create a form' } ), 'Create a form' );
		await expect( page.getByLabel( 'Form title' ) ).toBeVisible();
		await expectFocusKept( page, 'opening a form' );

		// Fields: add.
		await activate( page, page.getByRole( 'button', { name: 'Add field' } ), 'Add field' );
		await expect(
			page.getByRole( 'button', { name: 'Remove New field (number)' } )
		).toBeVisible();
		await expectFocusKept( page, 'Add field' );

		// Steps: add, move, assign, take off, remove.
		await activate( page, tab( page, 'Steps' ), 'the Steps tab' );
		await expect( page.getByLabel( 'Step 1 title' ) ).toBeVisible();
		await expectFocusKept( page, 'the Steps tab' );

		await activate( page, page.getByRole( 'button', { name: 'Add step' } ), 'Add step' );
		await expect( page.getByLabel( 'Step 2 title' ) ).toBeVisible();
		await expectFocusKept( page, 'Add step' );

		await activate(
			page,
			page.getByRole( 'button', { name: 'Move step 2: New step up' } ),
			'Move step 2 up'
		);
		await expectFocusKept( page, 'moving a step to the top' );

		// Bağlı `<select>`-də oxlar platformadan asılıdır; hərf yazmaq isə
		// hər yerdə seçimi dəyişib `change` göndərir.
		await tabTo( page, page.getByLabel( /^Put New field \(number\) on$/ ), 'the step chooser' );
		await page.keyboard.press( 'n' );
		await expectFocusKept( page, 'choosing a step' );

		await activate(
			page,
			page.getByRole( 'button', { name: 'Put on step: New field (number)' } ),
			'Put on step'
		);
		await expect( page.getByLabel( /^Put New field \(number\) on$/ ) ).toHaveCount( 0 );
		await expectFocusKept( page, 'assigning a field to a step' );

		const takeOff = page.getByRole( 'button', {
			name: /^Take off this step: New field \(number\)/,
		} );

		await activate( page, takeOff, 'Take off' );
		await expect( page.getByLabel( /^Put New field \(number\) on$/ ) ).toBeVisible();
		await expectFocusKept( page, 'taking a field off a step' );

		await activate(
			page,
			page.getByRole( 'button', { name: 'Remove step 1: New step' } ),
			'Remove step 1'
		);
		await expectFocusKept( page, 'asking to remove a step' );

		await activate(
			page,
			page.getByRole( 'button', { name: 'Remove step', exact: true } ),
			'confirming the step removal'
		);
		await expect( page.getByLabel( 'Step 2 title' ) ).toHaveCount( 0 );
		await expectFocusKept( page, 'removing a step' );

		// Calculations: add, move, remove.
		await activate( page, tab( page, 'Pricing' ), 'the Pricing tab' );
		await expect( page.getByLabel( 'Calculation 1 key' ) ).toBeVisible();
		await expectFocusKept( page, 'the Pricing tab' );

		const calculations = page.locator( '.quoteform_calculation' );

		await activate(
			page,
			page.getByRole( 'button', { name: 'Add calculation' } ),
			'Add calculation'
		);
		await expect( calculations ).toHaveCount( 2 );
		await expectFocusKept( page, 'Add calculation' );

		await activate(
			page,
			calculations.last().getByRole( 'button', { name: /up$/ } ),
			'moving a calculation up'
		);
		await expectFocusKept( page, 'moving a calculation to the top' );

		await activate(
			page,
			calculations.first().getByRole( 'button', { name: /^Remove/ } ),
			'Remove calculation'
		);
		await expectFocusKept( page, 'asking to remove a calculation' );

		await activate(
			page,
			page.getByRole( 'button', { name: /^Yes, remove/ } ),
			'confirming the calculation removal'
		);
		await expect( calculations ).toHaveCount( 1 );
		await expectFocusKept( page, 'removing a calculation' );

		// Rules: add, add a condition, remove.
		await activate( page, tab( page, 'Rules' ), 'the Rules tab' );
		await expect( page.getByRole( 'button', { name: 'Add rule' } ) ).toBeVisible();
		await expectFocusKept( page, 'the Rules tab' );

		await activate( page, page.getByRole( 'button', { name: 'Add rule' } ), 'Add rule' );
		await expect( page.getByLabel( 'Rule 1 action' ) ).toBeVisible();
		await expectFocusKept( page, 'Add rule' );

		await activate(
			page,
			page.getByRole( 'button', { name: 'Add condition to rule 1' } ),
			'Add condition'
		);
		await expectFocusKept( page, 'Add condition' );

		await activate(
			page,
			page.getByRole( 'button', { name: 'Remove rule 1' } ),
			'Remove rule 1'
		);
		await expectFocusKept( page, 'asking to remove a rule' );

		await activate(
			page,
			page.getByRole( 'button', { name: 'Yes, remove rule 1' } ),
			'confirming the rule removal'
		);
		await expect( page.getByLabel( 'Rule 1 action' ) ).toHaveCount( 0 );
		await expectFocusKept( page, 'removing a rule' );

		// Fields again: remove what we added.
		await activate( page, tab( page, 'Fields' ), 'the Fields tab' );
		await expectFocusKept( page, 'the Fields tab' );

		await activate(
			page,
			page.getByRole( 'button', { name: 'Remove New field (number)' } ),
			'Remove New field'
		);
		await expectFocusKept( page, 'asking to remove a field' );

		await activate(
			page,
			page.getByRole( 'button', { name: 'Remove field', exact: true } ),
			'confirming the field removal'
		);
		await expect(
			page.getByRole( 'button', { name: 'Remove New field (number)' } )
		).toHaveCount( 0 );
		await expectFocusKept( page, 'removing a field' );

		// Back to the list — the other screen transition.
		await activate(
			page,
			page.getByRole( 'button', { name: 'Back to all forms' } ),
			'Back to all forms'
		);
		await expectFocusKept( page, 'asking to leave with unsaved changes' );

		await activate(
			page,
			page.getByRole( 'button', { name: 'Leave without saving' } ),
			'Leave without saving'
		);
		await expect( page.getByRole( 'button', { name: 'Create a form' } ) ).toBeVisible();
		await expectFocusKept( page, 'going back to the form list' );
	} );

	test( 'the leave warning is never hidden under the sticky top bar', async ( { page } ) => {
		await page.getByRole( 'button', { name: 'Create a form' } ).click();
		await expect( page.getByLabel( 'Form title' ) ).toBeVisible();

		// Səhifə sürüşəcək qədər uzansın və forma "dirty" olsun.
		await page.getByRole( 'button', { name: 'Steps' } ).click();

		for ( let count = 2; count <= 8; count += 1 ) {
			await page.getByRole( 'button', { name: 'Add step' } ).click();
			await expect( page.getByLabel( `Step ${ count } title` ) ).toBeVisible();
		}

		await page.evaluate( () => window.scrollTo( 0, document.documentElement.scrollHeight ) );
		await expect.poll( () => page.evaluate( () => window.scrollY ) ).toBeGreaterThan( 300 );

		// Chromium fokusda görünməyən elementi ortaya sürüşdürür — səhifənin
		// dibindən bu, xətanı gizlədir. Xəta o vaxt görünür ki, element
		// "görünür" sayılsın, amma yapışqan zolağın ALTINDA olsun: xəbərdarlıq
		// zolaqdan dərhal sonra, növbəti qardaşın yerinə girir. Həmin yeri
		// zolağın ortasına gətiririk.
		await page.evaluate( () => {
			const bar = document.querySelector( '.quoteform_topbar' );
			const next = bar.nextElementSibling;
			const barRect = bar.getBoundingClientRect();
			const slot = next.getBoundingClientRect().top + window.scrollY;

			window.scrollTo( 0, slot - ( barRect.top + barRect.height / 2 ) );
		} );

		const back = page.getByRole( 'button', { name: 'Back to all forms' } );

		await back.focus();
		await page.keyboard.press( 'Enter' );

		const stay = page.getByRole( 'button', { name: 'Stay here' } );

		await expect( stay ).toBeFocused();

		const bar = await page.locator( '.quoteform_topbar' ).boundingBox();
		const box = await stay.boundingBox();

		expect( box.y ).toBeGreaterThanOrEqual( bar.y + bar.height );
	} );
} );
