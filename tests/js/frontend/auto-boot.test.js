/**
 * @jest-environment jsdom
 */

// `bootAll` özü `boot.test.js`-də sınanır. Burada sınanan AYRI bir şeydir:
// modulun yükləndiyi anda, giriş nöqtəsinin özünün etdiyi avtomatik qurulma.
// Skript adətən footer-də, `DOMContentLoaded`-dan əvvəl icra olunur, LAKIN
// optimallaşdırma plugin-i ona `async` (və ya `defer` + gec yükləmə) əlavə
// edərsə, hadisə ARTIQ keçmiş olur və bir daha gəlmir. Ona görə hər iki
// vaxtlama ayrıca sınanır: səhv tərəfi seçən giriş nöqtəsi səhifədə səssizcə
// boş bir sahə qoyur.
const minimalSchema = () => ( {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2 },
	fields: {},
	steps: [ { key: 'step_one', title: 'One', description: '', fields: [] } ],
	calculations: [ { key: 'total', expression: '0', label: 'Total', visible: true } ],
	rules: [],
} );

function container( id ) {
	const node = document.createElement( 'div' );

	node.setAttribute( 'data-quoteform', String( id ) );
	node.textContent = 'server-rendered fallback';
	window.quoteformData = { [ id ]: minimalSchema() };

	document.body.appendChild( node );

	return node;
}

function readyState( value ) {
	Object.defineProperty( document, 'readyState', {
		value,
		configurable: true,
	} );
}

function loadEntryPoint() {
	jest.isolateModules( () => {
		require( '../../../frontend-src/index' );
	} );
}

describe( 'the entry point booting itself', () => {
	const original = Object.getOwnPropertyDescriptor(
		Document.prototype,
		'readyState'
	);

	beforeEach( () => {
		document.body.innerHTML = '';
		window.quoteformData = {};
		delete window.quoteform;
	} );

	afterEach( () => {
		delete document.readyState;

		if ( original ) {
			Object.defineProperty( Document.prototype, 'readyState', original );
		}
	} );

	it( 'mounts a form that is already in the document when the script runs', () => {
		readyState( 'complete' );

		const node = container( 12 );

		loadEntryPoint();

		expect( node.textContent ).not.toContain( 'server-rendered fallback' );
		expect( node.querySelector( '[data-quoteform-total]' ) ).not.toBeNull();
	} );

	// `async` skript üçün `DOMContentLoaded` ARTIQ baş verib. Gözləmək
	// heç vaxt gəlməyəcək hadisəni gözləmək deməkdir.
	it( 'waits for no event that has already fired', () => {
		readyState( 'interactive' );

		const node = container( 12 );

		loadEntryPoint();

		expect( node.querySelector( '[data-quoteform-total]' ) ).not.toBeNull();

		document.dispatchEvent( new Event( 'DOMContentLoaded' ) );

		expect( node.children ).toHaveLength( 1 );
	} );

	// Digər yarısı: sənəd hələ oxunurkən qurmaq, sonra gələn sahələri
	// itirmək deməkdir — ona görə o halda HADİSƏ gözlənilir.
	it( 'waits for the document when it is still being parsed', () => {
		readyState( 'loading' );

		const node = container( 12 );

		loadEntryPoint();

		expect( node.textContent ).toContain( 'server-rendered fallback' );

		readyState( 'complete' );
		document.dispatchEvent( new Event( 'DOMContentLoaded' ) );

		expect( node.querySelector( '[data-quoteform-total]' ) ).not.toBeNull();
	} );
} );
