/**
 * @jest-environment jsdom
 */

function mountRoot() {
	document.body.innerHTML = '<div id="quoteform-root"></div>';

	return document.getElementById( 'quoteform-root' );
}

function bootstrap() {
	jest.isolateModules( () => {
		jest.doMock( '../../../admin-src/App', () => ( {
			__esModule: true,
			default: () => 'the builder',
		} ) );

		require( '../../../admin-src/index' );
	} );
}

afterEach( () => {
	jest.resetModules();
	document.body.innerHTML = '';
} );

describe( 'the builder bootstrap', () => {
	it( 'mounts the app when WordPress exposes createRoot', async () => {
		const root = mountRoot();

		bootstrap();

		await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );

		expect( root.textContent ).toContain( 'the builder' );
	} );

	it( 'says which WordPress version is needed when createRoot is missing', async () => {
		const root = mountRoot();

		jest.doMock( '@wordpress/element', () => require( './wpElement61Stub' ) );

		expect( () => bootstrap() ).not.toThrow();

		await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );

		expect( root.textContent ).toContain( '6.2' );
		expect( root.textContent ).not.toContain( 'the builder' );
	} );

	it( 'does nothing at all when the root node is absent', () => {
		document.body.innerHTML = '';

		expect( () => bootstrap() ).not.toThrow();
		expect( document.body.innerHTML ).toBe( '' );
	} );
} );
