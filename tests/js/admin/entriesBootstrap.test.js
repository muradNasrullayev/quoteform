/**
 * @jest-environment jsdom
 */

function bootstrap() {
	jest.isolateModules( () => {
		jest.doMock( '../../../admin-src/entries/EntriesApp', () => ( {
			__esModule: true,
			default: ( { config } ) => `entries app for ${ config.perPage } per page`,
		} ) );

		require( '../../../admin-src/entries' );
	} );
}

afterEach( () => {
	jest.resetModules();
	document.body.innerHTML = '';
	delete window.quoteformEntries;
} );

describe( 'the entries bootstrap', () => {
	it( 'mounts the app with the config WordPress printed', async () => {
		document.body.innerHTML = '<div id="quoteform-entries-root"></div>';
		window.quoteformEntries = { perPage: 50 };

		bootstrap();
		await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );

		expect( document.getElementById( 'quoteform-entries-root' ).textContent ).toBe( 'entries app for 50 per page' );
	} );

	it( 'says which WordPress version is needed when createRoot is missing', async () => {
		document.body.innerHTML = '<div id="quoteform-entries-root"></div>';
		jest.doMock( '@wordpress/element', () => require( './wpElement61Stub' ) );

		bootstrap();
		await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );

		expect( document.getElementById( 'quoteform-entries-root' ).textContent ).toContain( '6.2' );
	} );

	it( 'does nothing on pages without the root node', () => {
		expect( () => bootstrap() ).not.toThrow();
		expect( document.body.innerHTML ).toBe( '' );
	} );
} );
