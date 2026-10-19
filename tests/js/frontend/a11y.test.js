/**
 * @jest-environment jsdom
 */
import { createForm } from '../../../frontend-src/dom/form';

const schema = () => ( {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2 },
	fields: {
		rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: 'Bedrooms only.', default: 1, required: true },
		extras: {
			key: 'extras',
			type: 'checkbox',
			label: 'Extras',
			help: '',
			default: [],
			required: false,
			options: [ { label: 'Gift wrap', value: 'gift', price: 15 } ],
		},
		notes: { key: 'notes', type: 'text', label: 'Notes', help: '', default: '', required: false },
	},
	steps: [
		{ key: 'one', title: 'Your property', description: '', fields: [ 'rooms', 'extras' ] },
		{ key: 'two', title: 'Anything else', description: '', fields: [ 'notes' ] },
	],
	calculations: [ { key: 'total', expression: '{rooms} * 50', label: 'Total', visible: true } ],
	rules: [],
} );

const mount = () => {
	const container = document.createElement( 'div' );

	container.setAttribute( 'data-quoteform', '12' );
	document.body.appendChild( container );
	createForm( container, schema() );

	return container;
};

// Id fəzası hər MOUNT üçün unikaldır (eyni forma bir səhifədə iki dəfə ola
// bilər), ona görə testlər onu kök elementin `id`-sindən oxuyur — heç bir
// literal `#quoteform_12_…` yazmır. Testlərin əsaslandığı şey MÜNASİBƏTdir:
// `label[for]`, `aria-describedby` və nəzarətin öz `id`-si eyni fəzadan gəlir.
const namespaceOf = ( container ) => container.querySelector( '.quoteform' ).id;

const byId = ( container, suffix ) =>
	container.querySelector( `#${ namespaceOf( container ) }_${ suffix }` );

const accessibleName = ( container, input ) => {
	const label = container.querySelector( `label[for="${ input.id }"]` );

	if ( label ) {
		return label.textContent.trim();
	}

	const fieldset = input.closest( 'fieldset' );

	return fieldset ? fieldset.querySelector( 'legend' ).textContent.trim() : '';
};

describe( 'accessibility', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		jest.useFakeTimers();
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	it( 'gives every visible control an accessible name', () => {
		const container = mount();
		const inputs = [ ...container.querySelectorAll( 'input:not([type="hidden"]), select, textarea' ) ];

		expect( inputs.length ).toBeGreaterThan( 0 );

		inputs.forEach( ( input ) => {
			expect( accessibleName( container, input ) ).not.toBe( '' );
		} );
	} );

	it( 'describes a control with its help text', () => {
		const container = mount();
		const rooms = byId( container, 'rooms' );
		const help = byId( container, 'rooms_help' );

		expect( rooms.getAttribute( 'aria-describedby' ) ).toContain( help.id );
		expect( help.textContent ).toBe( 'Bedrooms only.' );
	} );

	it( 'exposes the progress as text, not only as position', () => {
		const container = mount();

		expect( container.querySelector( '[data-quoteform-progress]' ).textContent ).toBe( 'Step 1 of 2' );
	} );

	it( 'creates one empty polite live region at mount', () => {
		const container = mount();
		const regions = container.querySelectorAll( '[aria-live]' );

		expect( regions ).toHaveLength( 1 );
		expect( regions[ 0 ].getAttribute( 'aria-live' ) ).toBe( 'polite' );
		expect( regions[ 0 ].textContent ).toBe( '' );
	} );

	// Atribut üzrə axtarış implicit canlı sahələri GÖRMÜR: <output> (və eləcə də
	// role=status/alert/log) heç bir `aria-live` yazmadan da polite canlı
	// sahədir. Ona görə burada tag/rol səviyyəsində süpürülür.
	it( 'holds exactly one live region, implicit ones included', () => {
		const container = mount();
		const live = [
			...container.querySelectorAll( 'output, [role="status"], [role="alert"], [role="log"], [aria-live]' ),
		];

		expect( live ).toHaveLength( 1 );
		expect( live[ 0 ].getAttribute( 'aria-live' ) ).toBe( 'polite' );
		expect( live[ 0 ].className ).toContain( 'quoteform_sr_only' );
		expect( live[ 0 ].hasAttribute( 'data-quoteform-total' ) ).toBe( false );
	} );

	it( 'announces the total after it changes', () => {
		const container = mount();
		const rooms = byId( container, 'rooms' );

		rooms.value = '4';
		rooms.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 700 );

		expect( container.querySelector( '[aria-live]' ).textContent ).toContain( '$200.00' );
	} );

	it( 'ties an error to its input and marks it invalid', () => {
		const container = mount();
		const rooms = byId( container, 'rooms' );

		rooms.value = '';
		rooms.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );
		container.querySelector( '[data-quoteform-next]' ).dispatchEvent( new Event( 'click', { bubbles: true } ) );

		const error = byId( container, 'rooms_error' );

		expect( error.textContent.trim() ).not.toBe( '' );
		expect( rooms.getAttribute( 'aria-invalid' ) ).toBe( 'true' );
		expect( rooms.getAttribute( 'aria-describedby' ) ).toContain( error.id );
	} );

	it( 'marks a required field with aria-required rather than the required attribute', () => {
		const container = mount();
		const rooms = byId( container, 'rooms' );

		expect( rooms.getAttribute( 'aria-required' ) ).toBe( 'true' );
		expect( rooms.hasAttribute( 'required' ) ).toBe( false );
	} );

	it( 'uses real buttons that cannot submit anything', () => {
		const container = mount();
		const next = container.querySelector( '[data-quoteform-next]' );

		expect( next.tagName ).toBe( 'BUTTON' );
		expect( next.getAttribute( 'type' ) ).toBe( 'button' );
	} );

	it( 'moves focus to the heading of the step it just opened', () => {
		const container = mount();

		container.querySelector( '[data-quoteform-next]' ).dispatchEvent( new Event( 'click', { bubbles: true } ) );

		expect( document.activeElement.textContent ).toContain( 'Anything else' );
	} );

	it( 'gives nothing a positive tabindex', () => {
		const container = mount();
		const positive = [ ...container.querySelectorAll( '[tabindex]' ) ].filter(
			( node ) => Number( node.getAttribute( 'tabindex' ) ) > 0
		);

		expect( positive ).toEqual( [] );
	} );

	it( 'groups checkboxes in a fieldset with a legend', () => {
		const container = mount();
		const fieldset = container.querySelector( 'fieldset' );

		expect( fieldset ).not.toBeNull();
		expect( fieldset.querySelector( 'legend' ).textContent ).toContain( 'Extras' );
	} );
} );

const breakdownRows = ( container ) => [ ...container.querySelectorAll( '[data-quoteform-breakdown] li' ) ];
const breakdownList = ( container ) => container.querySelector( '[data-quoteform-breakdown]' );
const totalNode = ( container ) => container.querySelector( '[data-quoteform-total]' );
const goNext = ( container ) =>
	container.querySelector( '[data-quoteform-next]' ).dispatchEvent( new Event( 'click', { bubbles: true } ) );

describe( 'the breakdown', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		jest.useFakeTimers();
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	it( 'stays away on a step that is not the last one', () => {
		const container = mount();

		expect( container.querySelector( '[data-quoteform-step="one"]' ) ).not.toBeNull();
		expect( breakdownRows( container ) ).toEqual( [] );
		expect( breakdownList( container ).hidden ).toBe( true );
	} );

	it( 'appears on the last step', () => {
		const container = mount();

		goNext( container );

		expect( container.querySelector( '[data-quoteform-step="two"]' ) ).not.toBeNull();
		expect( breakdownRows( container ).map( ( row ) => row.textContent ) ).toEqual( [ 'Total$50.00' ] );
		expect( breakdownList( container ).hidden ).toBe( false );
	} );

	it( 'keeps one row per calculation however often the last step recalculates', () => {
		const container = mount();

		goNext( container );

		const notes = byId( container, 'notes' );

		notes.value = 'first';
		notes.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		notes.value = 'second';
		notes.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		expect( breakdownRows( container ).map( ( row ) => row.textContent ) ).toEqual( [ 'Total$50.00' ] );
	} );

	// SON GÖRÜNƏN addım — müəllifin son yazdığı addım yox (§9). Burada üçüncü
	// addımı qayda gizlədir, deməli açılış ikinci addıma düşməlidir.
	it( 'appears on the last visible step when a rule hides the authored last one', () => {
		const container = document.createElement( 'div' );
		const hidden = schema();

		hidden.fields.extra = {
			key: 'extra',
			type: 'text',
			label: 'Extra',
			help: '',
			default: '',
			required: false,
		};
		hidden.steps.push( { key: 'three', title: 'One more thing', description: '', fields: [ 'extra' ] } );
		hidden.rules = [
			{
				target: { kind: 'step', key: 'three' },
				action: 'hide',
				match: 'all',
				conditions: [ { field: 'extra', operator: 'is_empty' } ],
			},
		];

		container.setAttribute( 'data-quoteform', '12' );
		document.body.appendChild( container );
		createForm( container, hidden );

		goNext( container );

		expect( container.querySelector( '[data-quoteform-step="two"]' ) ).not.toBeNull();
		expect( container.querySelector( '[data-quoteform-step="three"]' ) ).toBeNull();
		expect( container.querySelector( '[data-quoteform-next]' ) ).toBeNull();
		expect( breakdownList( container ).hidden ).toBe( false );
		expect( breakdownRows( container ).map( ( row ) => row.textContent ) ).toEqual( [ 'Total$50.00' ] );
	} );

	it( 'leaves the total on show on every step', () => {
		const container = mount();

		expect( totalNode( container ).hidden ).toBe( false );
		expect( totalNode( container ).textContent ).toBe( '$50.00' );

		goNext( container );

		expect( totalNode( container ).hidden ).toBe( false );
		expect( totalNode( container ).textContent ).toBe( '$50.00' );
	} );
} );

describe( 'announcements from the form', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		jest.useFakeTimers();
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	it( 'says nothing about a form the visitor has not touched yet', () => {
		const container = mount();

		jest.advanceTimersByTime( 2000 );

		expect( container.querySelector( '[aria-live]' ).textContent ).toBe( '' );
	} );

	it( 'announces the step it moved to, with the running total', () => {
		const container = mount();

		goNext( container );
		jest.advanceTimersByTime( 700 );

		expect( container.querySelector( '[aria-live]' ).textContent ).toBe( 'Step 2 of 2. Total $50.00.' );
	} );

	// Hər addım gizlənəndə mövqe indeksi -1 olur. Elan bu halda susmalıdır,
	// yoxsa ekran oxuyucu "Step 0 of 0." deyərdi.
	it( 'says nothing when a rule has hidden every step', () => {
		const container = document.createElement( 'div' );
		const vanishing = schema();

		vanishing.rules = [ 'one', 'two' ].map( ( key ) => ( {
			target: { kind: 'step', key },
			action: 'hide',
			match: 'all',
			conditions: [ { field: 'rooms', operator: 'is_empty' } ],
		} ) );

		container.setAttribute( 'data-quoteform', '12' );
		document.body.appendChild( container );
		createForm( container, vanishing );

		const rooms = byId( container, 'rooms' );

		rooms.value = '';
		rooms.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 700 );

		expect( container.querySelector( '[data-quoteform-empty]' ) ).not.toBeNull();
		expect( container.querySelector( '[aria-live]' ).textContent ).toBe( '' );
	} );

	it( 'announces the step without a total when the formula is broken', () => {
		const container = document.createElement( 'div' );
		const broken = schema();

		broken.calculations = [ { key: 'total', expression: '{rooms} / 0', label: 'Total', visible: true } ];
		container.setAttribute( 'data-quoteform', '12' );
		document.body.appendChild( container );
		createForm( container, broken );

		goNext( container );
		jest.advanceTimersByTime( 700 );

		expect( container.querySelector( '[aria-live]' ).textContent ).toBe( 'Step 2 of 2.' );
	} );
} );
