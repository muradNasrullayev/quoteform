/**
 * @jest-environment jsdom
 */
import { bootAll } from '../../../frontend-src/index';
import * as formModule from '../../../frontend-src/dom/form';

const container = ( id, schema ) => {
	const node = document.createElement( 'div' );

	node.setAttribute( 'data-quoteform', String( id ) );
	node.textContent = 'server-rendered fallback';
	window.quoteformData = window.quoteformData || {};
	window.quoteformData[ id ] = schema;

	document.body.appendChild( node );

	return node;
};

const minimalSchema = () => ( {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2 },
	fields: {},
	steps: [ { key: 'step_one', title: 'One', description: '', fields: [] } ],
	calculations: [ { key: 'total', expression: '0', label: 'Total', visible: true } ],
	rules: [],
} );

describe( 'bootAll', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		window.quoteformData = {};
	} );

	afterEach( () => {
		jest.restoreAllMocks();
	} );

	it( 'mounts one runtime per container', () => {
		container( 12, minimalSchema() );
		container( 13, minimalSchema() );

		expect( bootAll( document ) ).toHaveLength( 2 );
	} );

	it( 'replaces the server-rendered fallback', () => {
		const node = container( 12, minimalSchema() );

		bootAll( document );

		expect( node.textContent ).not.toContain( 'server-rendered fallback' );
	} );

	it( 'leaves a container alone when its schema is missing', () => {
		const node = document.createElement( 'div' );

		node.setAttribute( 'data-quoteform', '99' );
		node.textContent = 'server-rendered fallback';
		document.body.appendChild( node );

		expect( () => bootAll( document ) ).not.toThrow();
		expect( node.textContent ).toContain( 'server-rendered fallback' );
	} );

	it( 'survives one form that throws, without taking the others down', () => {
		jest.spyOn( formModule, 'createForm' ).mockImplementationOnce( () => {
			throw new Error( 'malformed schema' );
		} );

		container( 12, minimalSchema() );
		const healthy = container( 13, minimalSchema() );

		expect( () => bootAll( document ) ).not.toThrow();
		expect( healthy.textContent ).not.toContain( 'server-rendered fallback' );
	} );

	// Səhifə yükləndikdən sonra gələn forma (popup, AJAX tab, sonsuz sürüşmə)
	// üçün yeganə çıxış yolu budur. Bundan əvvəl `bootAll` heç yerə çıxarılmamışdı
	// və belə konteyner səssizcə boş qalırdı.
	it( 'exposes a boot entry point on the global object', () => {
		const node = container( 12, minimalSchema() );

		expect( typeof window.quoteform.boot ).toBe( 'function' );

		window.quoteform.boot();

		expect( node.textContent ).not.toContain( 'server-rendered fallback' );
	} );

	it( 'boots a container that arrives after the page has loaded', () => {
		bootAll( document );

		const late = container( 21, minimalSchema() );

		expect( window.quoteform.boot( document ) ).toHaveLength( 1 );
		expect( late.querySelector( '[data-quoteform-total]' ) ).not.toBeNull();
	} );

	// Eyni konteyneri ikinci dəfə qurmaq hər dinləyicini ikiqat edər və
	// ziyarətçinin yazdığını silərdi.
	it( 'leaves an already-mounted container alone on a second pass', () => {
		const node = container( 12, minimalSchema() );

		expect( bootAll( document ) ).toHaveLength( 1 );

		const root = node.firstElementChild;

		expect( bootAll( document ) ).toHaveLength( 0 );
		expect( node.children ).toHaveLength( 1 );
		expect( node.firstElementChild ).toBe( root );
	} );

	it( 'mounts a container again once its form has been destroyed', () => {
		container( 12, minimalSchema() );

		const [ form ] = bootAll( document );

		form.destroy();

		expect( bootAll( document ) ).toHaveLength( 1 );
	} );

	it( 'ships no React and no jQuery, by manifest as well as by bundle', () => {
		const fs = require( 'fs' );
		const path = require( 'path' );
		const manifestPath = path.join( __dirname, '../../../build/frontend.asset.php' );
		const bundlePath = path.join( __dirname, '../../../build/frontend.js' );

		if ( ! fs.existsSync( manifestPath ) || ! fs.existsSync( bundlePath ) ) {
			throw new Error(
				'build/frontend.js or build/frontend.asset.php is missing. Run `npm run build` before running this test.'
			);
		}

		const manifest = fs.readFileSync( manifestPath, 'utf8' );
		const bundle = fs.readFileSync( bundlePath, 'utf8' );

		const declared = manifest.match( /'dependencies'\s*=>\s*array\(([^)]*)\)/ );

		expect( declared ).not.toBeNull();
		expect(
			declared[ 1 ]
				.split( ',' )
				.map( ( handle ) => handle.trim().replace( /^'|'$/g, '' ) )
				.filter( Boolean )
		).toEqual( [ 'wp-i18n' ] );

		expect( bundle ).not.toContain( 'react' );
		expect( bundle ).not.toContain( 'jQuery' );
	} );
} );
