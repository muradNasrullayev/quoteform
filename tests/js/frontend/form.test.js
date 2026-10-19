/**
 * @jest-environment jsdom
 */
import { createForm } from '../../../frontend-src/dom/form';
import * as calculateModule from '../../../frontend-src/runtime/calculate';

const schema = ( overrides ) => ( {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2 },
	fields: {
		rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', default: 1, required: false },
		urgency: {
			key: 'urgency',
			type: 'select',
			label: 'Urgency',
			help: '',
			default: '',
			required: false,
			options: [
				{ label: 'Standard', value: 'standard', price: 0 },
				{ label: 'Express', value: 'express', price: 60 },
			],
		},
	},
	steps: [ { key: 'step_one', title: 'Your property', description: '', fields: [ 'rooms', 'urgency' ] } ],
	calculations: [
		{ key: 'total', expression: '{rooms} * 50 + {urgency.price}', label: 'Total', visible: true },
	],
	rules: [],
	...overrides,
} );

const groupSchema = ( overrides ) => ( {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2 },
	fields: {
		plan: {
			key: 'plan',
			type: 'radio',
			label: 'Plan',
			help: '',
			default: '',
			required: false,
			options: [
				{ label: 'Basic', value: 'basic', price: 10 },
				{ label: 'Pro', value: 'pro', price: 40 },
			],
		},
		extras: {
			key: 'extras',
			type: 'checkbox',
			label: 'Extras',
			help: '',
			default: [],
			required: false,
			options: [
				{ label: 'Gift wrap', value: 'gift', price: 5 },
				{ label: 'Insurance', value: 'insure', price: 25 },
			],
		},
	},
	steps: [ { key: 'step_one', title: 'Your order', description: '', fields: [ 'plan', 'extras' ] } ],
	calculations: [
		{ key: 'total', expression: '{plan.price} + {extras.price}', label: 'Total', visible: true },
	],
	rules: [],
	...overrides,
} );

const mount = ( custom ) => {
	const container = document.createElement( 'div' );

	container.setAttribute( 'data-quoteform', '12' );
	document.body.appendChild( container );

	return { container, form: createForm( container, custom || schema() ) };
};

// Id fəzası hər MOUNT üçün unikaldır (eyni forma bir səhifədə iki dəfə ola
// bilər), ona görə testlər onu kök elementin `id`-sindən oxuyur — heç bir
// literal `#quoteform_12_…` yazmır. Testlərin əsaslandığı şey MÜNASİBƏTdir:
// `label[for]`, `aria-describedby` və nəzarətin öz `id`-si eyni fəzadan gəlir.
const namespaceOf = ( container ) => container.querySelector( '.quoteform' ).id;

const byId = ( container, suffix ) =>
	container.querySelector( `#${ namespaceOf( container ) }_${ suffix }` );

const totalText = ( container ) => container.querySelector( '[data-quoteform-total]' ).textContent;

const check = ( input, checked ) => {
	input.checked = checked;
	input.dispatchEvent( new Event( 'change', { bubbles: true } ) );
};

// Sıra sahə AÇARLARI ilə oxunur, tam `id`-lərlə yox: fəza hər mount-da başqadır,
// sıra isə bu testin əsl mövzusudur.
const controlOrder = ( container ) =>
	[ ...container.querySelectorAll( '[data-quoteform-step="step_one"] > .quoteform_control' ) ].map(
		( control ) =>
			control.querySelector( 'input, select, textarea' ).id.slice( namespaceOf( container ).length + 1 )
	);

describe( 'createForm', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		jest.useFakeTimers();
	} );

	afterEach( () => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	} );

	it( 'renders one control per field in the step', () => {
		const { container } = mount();

		expect( byId( container, 'rooms' ) ).not.toBeNull();
		expect( byId( container, 'urgency' ) ).not.toBeNull();
	} );

	it( 'shows the total from the schema defaults on first paint', () => {
		const { container } = mount();

		expect( totalText( container ) ).toBe( '$50.00' );
	} );

	it( 'shows each field default in its own input on first paint', () => {
		const { container } = mount();

		expect( byId( container, 'rooms' ).value ).toBe( '1' );
	} );

	it( 'updates the total after the debounce when a value changes', () => {
		const { container } = mount();
		const input = byId( container, 'rooms' );

		input.value = '3';
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );

		expect( totalText( container ) ).toBe( '$50.00' );

		jest.advanceTimersByTime( 60 );

		expect( totalText( container ) ).toBe( '$150.00' );
	} );

	it( 'does not recalculate before the debounce window has closed', () => {
		const { container } = mount();
		const input = byId( container, 'rooms' );

		input.value = '3';
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 40 );

		expect( totalText( container ) ).toBe( '$50.00' );

		jest.advanceTimersByTime( 20 );

		expect( totalText( container ) ).toBe( '$150.00' );
	} );

	it( 'recalculates once for a burst of changes inside one debounce window', () => {
		const { container } = mount();
		const input = byId( container, 'rooms' );
		const recalculations = jest.spyOn( calculateModule, 'calculate' );

		[ '2', '3', '4' ].forEach( ( value ) => {
			input.value = value;
			input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
			jest.advanceTimersByTime( 10 );
		} );

		expect( recalculations ).not.toHaveBeenCalled();

		jest.advanceTimersByTime( 60 );

		expect( recalculations ).toHaveBeenCalledTimes( 1 );
		expect( totalText( container ) ).toBe( '$200.00' );
	} );

	it( 'prices a select through its option price', () => {
		const { container } = mount();
		const select = byId( container, 'urgency' );

		select.value = 'express';
		select.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		expect( totalText( container ) ).toBe( '$110.00' );
	} );

	it( 'hears a radio option that is not the first one in its group', () => {
		const { container, form } = mount( groupSchema() );

		check( byId( container, 'plan_1' ), true );
		jest.advanceTimersByTime( 60 );

		expect( form.getState().plan ).toBe( 'pro' );
		expect( totalText( container ) ).toBe( '$40.00' );
	} );

	it( 'collects every checked checkbox option into one array and prices them all', () => {
		const { container, form } = mount( groupSchema() );

		check( byId( container, 'extras_0' ), true );
		check( byId( container, 'extras_1' ), true );
		jest.advanceTimersByTime( 60 );

		expect( form.getState().extras ).toEqual( [ 'gift', 'insure' ] );
		expect( totalText( container ) ).toBe( '$30.00' );
	} );

	it( 'drops an unchecked option from the array and from the price', () => {
		const { container, form } = mount( groupSchema() );

		check( byId( container, 'extras_0' ), true );
		check( byId( container, 'extras_1' ), true );
		jest.advanceTimersByTime( 60 );

		expect( form.getState().extras ).toEqual( [ 'gift', 'insure' ] );
		expect( totalText( container ) ).toBe( '$30.00' );

		check( byId( container, 'extras_1' ), false );
		jest.advanceTimersByTime( 60 );

		expect( form.getState().extras ).toEqual( [ 'gift' ] );
		expect( totalText( container ) ).toBe( '$5.00' );
	} );

	it( 'mounts a schema that holds an html block, which carries no value at all', () => {
		const withHtml = groupSchema( {
			fields: {
				...groupSchema().fields,
				intro: { key: 'intro', type: 'html', label: 'Intro', content: '<p>Read <strong>this</strong>.</p>' },
			},
			steps: [
				{ key: 'step_one', title: 'Your order', description: '', fields: [ 'intro', 'plan', 'extras' ] },
			],
		} );

		const { container } = mount( withHtml );

		expect( container.querySelector( 'strong' ) ).not.toBeNull();

		check( byId( container, 'plan_1' ), true );
		jest.advanceTimersByTime( 60 );

		expect( totalText( container ) ).toBe( '$40.00' );
	} );

	it( 'skips a field whose type it does not recognise and renders the rest', () => {
		const withUnknown = schema( {
			fields: {
				...schema().fields,
				signature: { key: 'signature', type: 'signature', label: 'Sign here', help: '', default: '' },
			},
			steps: [
				{
					key: 'step_one',
					title: 'Your property',
					description: '',
					fields: [ 'rooms', 'signature', 'urgency' ],
				},
			],
		} );

		const { container } = mount( withUnknown );

		expect( byId( container, 'signature' ) ).toBeNull();
		expect( byId( container, 'rooms' ) ).not.toBeNull();
		expect( byId( container, 'urgency' ) ).not.toBeNull();
		expect( totalText( container ) ).toBe( '$50.00' );
	} );

	it( 'hides a field when a rule says so, and removes it from the price', () => {
		const withRule = schema( {
			rules: [
				{
					target: { kind: 'field', key: 'urgency' },
					action: 'hide',
					match: 'all',
					conditions: [ { field: 'rooms', operator: 'greater', value: 2 } ],
				},
			],
		} );

		const { container } = mount( withRule );
		const select = byId( container, 'urgency' );

		select.value = 'express';
		select.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		expect( totalText( container ) ).toBe( '$110.00' );

		const rooms = byId( container, 'rooms' );
		rooms.value = '3';
		rooms.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		expect( byId( container, 'urgency' ) ).toBeNull();
		expect( totalText( container ) ).toBe( '$150.00' );
	} );

	it( 'puts a field that comes back on screen into its schema position', () => {
		const withMiddleRule = schema( {
			fields: {
				...schema().fields,
				notes: { key: 'notes', type: 'text', label: 'Notes', help: '', default: '', required: false },
			},
			steps: [
				{
					key: 'step_one',
					title: 'Your property',
					description: '',
					fields: [ 'rooms', 'urgency', 'notes' ],
				},
			],
			rules: [
				{
					target: { kind: 'field', key: 'urgency' },
					action: 'hide',
					match: 'all',
					conditions: [ { field: 'rooms', operator: 'greater', value: 2 } ],
				},
			],
		} );

		const { container } = mount( withMiddleRule );
		const rooms = byId( container, 'rooms' );

		expect( controlOrder( container ) ).toEqual( [
			'rooms',
			'urgency',
			'notes',
		] );

		rooms.value = '3';
		rooms.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		expect( controlOrder( container ) ).toEqual( [ 'rooms', 'notes' ] );

		rooms.value = '1';
		rooms.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		expect( controlOrder( container ) ).toEqual( [
			'rooms',
			'urgency',
			'notes',
		] );
	} );

	it( 'hides the total and keeps the form usable when a formula breaks', () => {
		const broken = schema( {
			calculations: [ { key: 'total', expression: '{rooms} / 0', label: 'Total', visible: true } ],
		} );

		const { container } = mount( broken );

		expect( container.querySelector( '[data-quoteform-total]' ).hidden ).toBe( true );
		expect( byId( container, 'rooms' ) ).not.toBeNull();
	} );

	it( 'writes the computed total into no value, no name and no data attribute', () => {
		const { container } = mount();

		jest.advanceTimersByTime( 60 );

		const totalElement = container.querySelector( '[data-quoteform-total]' );
		const rendered = totalElement.textContent;
		const bare = String( Number( rendered.replace( /[^0-9.-]/g, '' ) ) );

		expect( rendered ).not.toBe( '' );
		expect( bare ).not.toBe( 'NaN' );

		[ ...container.querySelectorAll( 'input, textarea, select' ) ].forEach( ( input ) => {
			expect( input.value ).not.toBe( rendered );
			expect( input.value ).not.toBe( bare );
			expect( input.name ).not.toContain( rendered );
		} );

		[ ...container.querySelectorAll( '*' ) ].forEach( ( element ) => {
			if ( element === totalElement ) {
				return;
			}

			[ ...element.attributes ]
				.filter( ( attribute ) => attribute.name.indexOf( 'data-' ) === 0 )
				.forEach( ( attribute ) => {
					expect( attribute.value ).not.toContain( rendered );
					expect( attribute.value ).not.toContain( bare );
				} );
		} );
	} );

	it( 'keeps the visitor typing position when the form repaints', () => {
		const { container } = mount();
		const notes = byId( container, 'rooms' );

		notes.focus();
		notes.value = '2';
		notes.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		expect( document.activeElement ).toBe( byId( container, 'rooms' ) );
	} );

	it( 'does not re-apply the schema default when it refreshes', () => {
		const { container, form } = mount();
		const input = byId( container, 'rooms' );

		input.value = '3';
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		form.refresh();

		expect( byId( container, 'rooms' ).value ).toBe( '3' );
		expect( form.getState().rooms ).toBe( '3' );
		expect( totalText( container ) ).toBe( '$150.00' );
	} );

	it( 'removes its listeners on destroy', () => {
		const { container, form } = mount();
		const input = byId( container, 'rooms' );
		const recalculations = jest.spyOn( calculateModule, 'calculate' );

		form.destroy();

		input.value = '3';
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		expect( form.getState().rooms ).toBe( 1 );
		expect( recalculations ).not.toHaveBeenCalled();
	} );

	it( 'empties the container on destroy', () => {
		const { container, form } = mount();

		form.destroy();

		expect( container.innerHTML ).toBe( '' );
	} );
} );

// Qiymət səhifəsi kalkulyatoru həm məzmunda, həm yapışqan yan paneldə göstərə
// bilər — eyni şortkod, eyni forma id-si, iki mount. İd fəzası formanın
// id-sindən götürüləndə hər iki nüsxə eyni `id`-ləri daşıyırdı və (renderer
// `<form>` emit etmədiyi üçün sahib SƏNƏD olduğundan) radio-lar BİR qrupa
// düşürdü: ikinci nüsxədə seçim etmək birincininkini söndürürdü.
describe( 'the same form twice on one page', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		jest.useFakeTimers();
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	const mountTwice = ( custom ) => [ mount( custom ), mount( custom ) ];

	it( 'gives the two copies disjoint element ids', () => {
		const [ first, second ] = mountTwice();

		const idsIn = ( container ) =>
			[ ...container.querySelectorAll( '[id]' ) ].map( ( node ) => node.id );

		const shared = idsIn( first.container ).filter(
			( id ) => idsIn( second.container ).indexOf( id ) !== -1
		);

		expect( idsIn( first.container ).length ).toBeGreaterThan( 0 );
		expect( shared ).toEqual( [] );
		expect( [ ...document.querySelectorAll( '[id]' ) ].length ).toBe(
			new Set( [ ...document.querySelectorAll( '[id]' ) ].map( ( node ) => node.id ) ).size
		);
	} );

	it( 'keeps each copy of a radio group answering only for itself', () => {
		const [ first, second ] = mountTwice( groupSchema() );

		check( byId( first.container, 'plan_0' ), true );
		check( byId( second.container, 'plan_1' ), true );
		jest.advanceTimersByTime( 60 );

		expect( byId( first.container, 'plan_0' ).checked ).toBe( true );
		expect( first.form.getState().plan ).toBe( 'basic' );
		expect( second.form.getState().plan ).toBe( 'pro' );
	} );

	it( 'points every label and description in the second copy at the second copy', () => {
		const [ , second ] = mountTwice();

		const input = byId( second.container, 'rooms' );

		expect( second.container.querySelector( `label[for="${ input.id }"]` ) ).not.toBeNull();
		input.getAttribute( 'aria-describedby' ).split( ' ' ).forEach( ( id ) => {
			expect( second.container.querySelector( `#${ id }` ) ).not.toBeNull();
		} );
	} );
} );

// `<html lang>`-ı mövzu yazır, plugin yox. Yanlış teq `formatMoney`-dən
// RangeError qaldırırdı və o, `paintFields`-dən ƏVVƏL `refresh()`-i öldürüb
// ziyarətçiyə boş `.quoteform` qabığı qoyurdu.
describe( 'a theme that writes a malformed <html lang>', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		jest.useFakeTimers();
		document.documentElement.lang = 'en_US';
	} );

	afterEach( () => {
		jest.useRealTimers();
		document.documentElement.removeAttribute( 'lang' );
	} );

	it( 'still renders the fields, the navigation and the total', () => {
		const { container } = mount();

		expect( byId( container, 'rooms' ) ).not.toBeNull();
		expect( byId( container, 'urgency' ) ).not.toBeNull();
		expect( totalText( container ) ).toBe( '$50.00' );
	} );

	it( 'does not throw out of a later recalculation either', () => {
		const { container } = mount();
		const input = byId( container, 'rooms' );

		input.value = '3';
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );

		expect( () => jest.advanceTimersByTime( 60 ) ).not.toThrow();
		expect( totalText( container ) ).toBe( '$150.00' );
	} );
} );
