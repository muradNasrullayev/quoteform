/**
 * @jest-environment jsdom
 */
import { createForm } from '../../../frontend-src/dom/form';

// Vizual "çərçivə" elementləri: gedişat xətti və total yazısı. Bunlar dizayn
// üçündür, amma davranışları (nə vaxt görünür, nəyi göstərir) testlə kilidlənir.
const schemaWith = ( { steps = 3, expression = '{rooms} * 50', rules = [] } = {} ) => {
	const keys = [ 'one', 'two', 'three' ].slice( 0, steps );

	return {
		version: 1,
		settings: { currency: 'USD', currency_position: 'before', decimals: 2 },
		fields: {
			rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', default: 1, required: false },
			mode: { key: 'mode', type: 'hidden', label: '', help: '', default: 'all', required: false },
		},
		steps: keys.map( ( key, index ) => ( {
			key,
			title: key,
			description: '',
			// `mode` heç bir addımda deyil: gizli addımdakı sahənin dəyəri şərtlərdə
			// sayılmır, yəni "hamısını gizlət" qaydası öz-özünü söndürərdi.
			fields: index === 0 ? [ 'rooms' ] : [],
		} ) ),
		calculations: [ { key: 'total', expression, label: 'Total', visible: true } ],
		rules,
	};
};

const mount = ( schema ) => {
	const container = document.createElement( 'div' );

	container.setAttribute( 'data-quoteform', '12' );
	document.body.appendChild( container );
	createForm( container, schema );

	return container;
};

const next = ( container ) =>
	container.querySelector( '[data-quoteform-next]' ).dispatchEvent( new Event( 'click', { bubbles: true } ) );

const bar = ( container ) => container.querySelector( '.quoteform_progress_bar' );

beforeEach( () => {
	jest.useFakeTimers();
	document.body.innerHTML = '';
} );

afterEach( () => {
	jest.useRealTimers();
} );

describe( 'progress bar', () => {
	it( 'is hidden from assistive technology, since the text already says it', () => {
		const container = mount( schemaWith() );

		expect( bar( container ).getAttribute( 'aria-hidden' ) ).toBe( 'true' );
	} );

	it( 'fills in proportion to the current visible step', () => {
		const container = mount( schemaWith() );

		expect( bar( container ).style.getPropertyValue( '--quoteform-progress' ) ).toBe( '33.33%' );

		next( container );

		expect( bar( container ).style.getPropertyValue( '--quoteform-progress' ) ).toBe( '66.67%' );
	} );

	it( 'is not placed inside the progress text, which is rewritten on every step', () => {
		const container = mount( schemaWith() );

		expect( container.querySelector( '[data-quoteform-progress] .quoteform_progress_bar' ) ).toBeNull();
	} );

	it( 'hides with the progress text when no step is visible', () => {
		const hideAll = [ 'one', 'two', 'three' ].map( ( key ) => ( {
			target: { kind: 'step', key },
			action: 'hide',
			match: 'all',
			conditions: [ { field: 'mode', operator: 'equals', value: 'all' } ],
		} ) );

		const container = mount( schemaWith( { rules: hideAll } ) );

		expect( bar( container ).hidden ).toBe( true );
	} );
} );

describe( 'total label', () => {
	it( 'names the total next to the amount', () => {
		const container = mount( schemaWith() );
		const label = container.querySelector( '.quoteform_total_label' );

		expect( label.textContent ).toBe( 'Estimated total' );
		expect( label.parentElement ).toBe( container.querySelector( '[data-quoteform-total]' ).parentElement );
	} );

	it( 'hides the whole summary when there is no total to show', () => {
		const container = mount( schemaWith( { expression: '{rooms} / 0' } ) );

		expect( container.querySelector( '.quoteform_summary' ).hidden ).toBe( true );
	} );

	it( 'shows the summary when there is a total', () => {
		const container = mount( schemaWith() );

		expect( container.querySelector( '.quoteform_summary' ).hidden ).toBe( false );
	} );
} );
