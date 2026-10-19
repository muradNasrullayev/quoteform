/**
 * @jest-environment jsdom
 */
import { buildControl, nextNamespace } from '../../../frontend-src/dom/controls';

const field = ( type, extra = {} ) => ( {
	key: 'rooms',
	type,
	label: 'How many rooms?',
	help: 'Count bedrooms only.',
	placeholder: '',
	required: false,
	default: '',
	...extra,
} );

const options = [
	{ label: 'Standard', value: 'standard', price: 0 },
	{ label: 'Express', value: 'express', price: 60 },
];

// `buildControl` formanın id-sini yox, MOUNT-un id fəzasını alır; bu dəstin
// əksəriyyətinə hansı fəza olduğu əhəmiyyətsizdir, ona görə hər çağırışa təzəsi
// verilir.
const build = ( control ) => buildControl( control, nextNamespace( 12 ) );

describe( 'buildControl', () => {
	it( 'binds the label to the input', () => {
		const { wrapper, input } = build( field( 'text' ) );

		const label = wrapper.querySelector( 'label' );

		expect( label.getAttribute( 'for' ) ).toBe( input.id );
		expect( label.textContent ).toContain( 'How many rooms?' );
	} );

	// Eyni forma bir səhifədə iki dəfə görünə bilər — şortkod məzmunda, bir də
	// yapışqan yan paneldə. Id fəzası formanın id-sindən götürülsəydi, hər iki
	// nüsxə eyni `id`-ləri və eyni radio `name`-ini daşıyar, ikinci nüsxədə
	// edilən seçim birincininkini söndürərdi.
	it( 'gives two mounts of one form different ids and different radio group names', () => {
		const first = buildControl( field( 'radio', { options } ), nextNamespace( 7 ) );
		const second = buildControl( field( 'radio', { options } ), nextNamespace( 7 ) );

		const namesOf = ( control ) =>
			[ ...control.wrapper.querySelectorAll( 'input' ) ].map( ( input ) => input.name );
		const idsOf = ( control ) =>
			[ ...control.wrapper.querySelectorAll( '[id]' ) ].map( ( node ) => node.id );

		expect( first.input.id ).not.toBe( second.input.id );
		expect( namesOf( first ) ).not.toEqual( namesOf( second ) );
		expect( idsOf( first ).filter( ( id ) => idsOf( second ).indexOf( id ) !== -1 ) ).toEqual( [] );
	} );

	it( 'describes the input with its help text', () => {
		const { wrapper, input } = build( field( 'text' ) );

		const help = wrapper.querySelector( '.quoteform_help' );

		expect( input.getAttribute( 'aria-describedby' ) ).toContain( help.id );
	} );

	it( 'does not include the error id in aria-describedby until an error is set', () => {
		const { wrapper, input } = build( field( 'text' ) );

		const help = wrapper.querySelector( '.quoteform_help' );
		const error = wrapper.querySelector( '.quoteform_error' );

		expect( input.getAttribute( 'aria-describedby' ) ).toContain( help.id );
		expect( input.getAttribute( 'aria-describedby' ) ).not.toContain( error.id );
	} );

	it( 'marks a required field with aria-required and not with required', () => {
		const { input } = build( field( 'text', { required: true } ) );

		expect( input.getAttribute( 'aria-required' ) ).toBe( 'true' );
		expect( input.hasAttribute( 'required' ) ).toBe( false );
	} );

	it( 'shows and clears an error, and wires it to the input', () => {
		const { wrapper, input, setError } = build( field( 'text' ) );

		setError( 'This field is required.' );

		const error = wrapper.querySelector( '.quoteform_error' );

		expect( error.textContent ).toBe( 'This field is required.' );
		expect( input.getAttribute( 'aria-invalid' ) ).toBe( 'true' );
		expect( input.getAttribute( 'aria-describedby' ) ).toContain( error.id );

		setError( null );

		expect( wrapper.querySelector( '.quoteform_error' ).textContent ).toBe( '' );
		expect( input.hasAttribute( 'aria-invalid' ) ).toBe( false );
	} );

	it( 'shows and clears an error across every option in a group, not just the first', () => {
		const { wrapper, setError } = build( field( 'radio', { options } ) );

		setError( 'Pick one.' );

		const inputs = [ ...wrapper.querySelectorAll( 'input[type="radio"]' ) ];
		const error = wrapper.querySelector( '.quoteform_error' );

		expect( inputs ).toHaveLength( 2 );
		inputs.forEach( ( input ) => {
			expect( input.getAttribute( 'aria-invalid' ) ).toBe( 'true' );
			expect( input.getAttribute( 'aria-describedby' ) ).toContain( error.id );
		} );
		expect( error.textContent ).toBe( 'Pick one.' );

		setError( null );

		inputs.forEach( ( input ) => {
			expect( input.hasAttribute( 'aria-invalid' ) ).toBe( false );
			expect( input.getAttribute( 'aria-describedby' ) ).not.toContain( error.id );
		} );
		expect( wrapper.querySelector( '.quoteform_error' ).textContent ).toBe( '' );
	} );

	it.each( [
		[ 'number', 'INPUT', 'number' ],
		[ 'text', 'INPUT', 'text' ],
		[ 'email', 'INPUT', 'email' ],
		[ 'tel', 'INPUT', 'tel' ],
		[ 'date', 'INPUT', 'date' ],
		[ 'slider', 'INPUT', 'range' ],
		[ 'toggle', 'INPUT', 'checkbox' ],
		[ 'hidden', 'INPUT', 'hidden' ],
	] )( 'renders %s as a %s of type %s', ( type, tag, inputType ) => {
		const { input } = build( field( type ) );

		expect( input.tagName ).toBe( tag );
		expect( input.type ).toBe( inputType );
	} );

	it( 'renders a textarea', () => {
		expect( build( field( 'textarea' ) ).input.tagName ).toBe( 'TEXTAREA' );
	} );

	it( 'renders a select with its options and a placeholder choice', () => {
		const { input } = build( field( 'select', { options } ) );

		expect( input.tagName ).toBe( 'SELECT' );
		expect( [ ...input.options ].map( ( option ) => option.value ) ).toEqual( [ '', 'standard', 'express' ] );
	} );

	it( 'renders radios as a fieldset with one input per option', () => {
		const { wrapper } = build( field( 'radio', { options } ) );

		expect( wrapper.querySelector( 'fieldset' ) ).not.toBeNull();
		expect( wrapper.querySelectorAll( 'input[type="radio"]' ) ).toHaveLength( 2 );
		expect( wrapper.querySelector( 'legend' ).textContent ).toContain( 'How many rooms?' );
	} );

	it( 'gives every radio in a group the same name and distinct ids', () => {
		const { wrapper } = build( field( 'radio', { options } ) );

		const radios = [ ...wrapper.querySelectorAll( 'input[type="radio"]' ) ];

		expect( new Set( radios.map( ( radio ) => radio.name ) ).size ).toBe( 1 );
		expect( new Set( radios.map( ( radio ) => radio.id ) ).size ).toBe( 2 );
	} );

	it( 'renders checkboxes as a fieldset with one input per option', () => {
		const { wrapper } = build( field( 'checkbox', { options } ) );

		expect( wrapper.querySelectorAll( 'input[type="checkbox"]' ) ).toHaveLength( 2 );
	} );

	it( 'renders an html block as markup rather than as text', () => {
		const { wrapper } = build( {
			key: 'intro',
			type: 'html',
			content: '<p>Read <strong>this</strong>.</p>',
		} );

		expect( wrapper.querySelector( 'strong' ) ).not.toBeNull();
		expect( wrapper.textContent ).not.toContain( '<strong>' );
	} );

	it( 'gives a hidden field no label and no help', () => {
		const { wrapper } = build( field( 'hidden' ) );

		expect( wrapper.querySelector( 'label' ) ).toBeNull();
		expect( wrapper.querySelector( '.quoteform_help' ) ).toBeNull();
	} );

	it( 'applies min, max and step to number and slider fields', () => {
		const { input } = build( field( 'number', { min: 1, max: 9, step: 0.5 } ) );

		expect( input.min ).toBe( '1' );
		expect( input.max ).toBe( '9' );
		expect( input.step ).toBe( '0.5' );
	} );

	it( 'returns null for a type it does not recognise', () => {
		expect( build( field( 'quantum' ) ) ).toBeNull();
	} );
} );
