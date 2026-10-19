/**
 * @jest-environment jsdom
 */
import { createForm } from '../../../frontend-src/dom/form';

const threeSteps = ( rules ) => ( {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2 },
	fields: {
		rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', default: 1, required: false },
		details: { key: 'details', type: 'text', label: 'Details', help: '', default: '', required: false },
		notes: { key: 'notes', type: 'text', label: 'Notes', help: '', default: '', required: false },
	},
	steps: [
		{ key: 'one', title: 'Your property', description: '', fields: [ 'rooms' ] },
		{ key: 'two', title: 'Extra details', description: '', fields: [ 'details' ] },
		{ key: 'three', title: 'Anything else', description: '', fields: [ 'notes' ] },
	],
	calculations: [ { key: 'total', expression: '{rooms} * 50', label: 'Total', visible: true } ],
	rules: rules || [],
} );

const hideStepTwoWhenRoomsOverTwo = [
	{
		target: { kind: 'step', key: 'two' },
		action: 'hide',
		match: 'all',
		conditions: [ { field: 'rooms', operator: 'greater', value: 2 } ],
	},
];

const mount = ( schema ) => {
	const container = document.createElement( 'div' );

	container.setAttribute( 'data-quoteform', '12' );
	document.body.appendChild( container );

	return { container, form: createForm( container, schema ) };
};

// Id fəzası hər MOUNT üçün unikaldır (eyni forma bir səhifədə iki dəfə ola
// bilər), ona görə testlər onu kök elementin `id`-sindən oxuyur — heç bir
// literal `#quoteform_12_…` yazmır. Testlərin əsaslandığı şey MÜNASİBƏTdir:
// `label[for]`, `aria-describedby` və nəzarətin öz `id`-si eyni fəzadan gəlir.
const namespaceOf = ( container ) => container.querySelector( '.quoteform' ).id;

const byId = ( container, suffix ) =>
	container.querySelector( `#${ namespaceOf( container ) }_${ suffix }` );

const setValue = ( container, key, value ) => {
	const input = byId( container, key );

	input.value = String( value );
	input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	jest.advanceTimersByTime( 60 );
};

const setRooms = ( container, value ) => setValue( container, 'rooms', value );

const next = ( container ) =>
	container.querySelector( '[data-quoteform-next]' ).dispatchEvent( new Event( 'click', { bubbles: true } ) );

const back = ( container ) =>
	container.querySelector( '[data-quoteform-back]' ).dispatchEvent( new Event( 'click', { bubbles: true } ) );

const progress = ( container ) => container.querySelector( '[data-quoteform-progress]' ).textContent;

const errorText = ( container, key ) => byId( container, `${ key }_error` ).textContent;

const withRequiredFields = ( rules ) => {
	const schema = threeSteps( rules );

	schema.fields.rooms = { key: 'rooms', type: 'number', label: 'Rooms', help: '', default: '', required: true };
	schema.fields.email = { key: 'email', type: 'email', label: 'Email', help: '', default: '', required: true };
	schema.fields.details.required = true;
	schema.steps[ 0 ].fields = [ 'rooms', 'email' ];

	return schema;
};

const withRequiredToggle = () => {
	const schema = threeSteps();

	schema.fields.agree = {
		key: 'agree',
		type: 'toggle',
		label: 'I accept the terms',
		help: '',
		default: false,
		required: true,
	};
	schema.steps[ 0 ].fields = [ 'agree' ];

	return schema;
};

describe( 'step navigation', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		jest.useFakeTimers();
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	it( 'counts every step when none is hidden', () => {
		const { container } = mount( threeSteps() );

		expect( progress( container ) ).toBe( 'Step 1 of 3' );
	} );

	it( 'stops counting a step once a rule hides it', () => {
		const { container } = mount( threeSteps( hideStepTwoWhenRoomsOverTwo ) );

		expect( progress( container ) ).toBe( 'Step 1 of 3' );

		setRooms( container, 3 );

		expect( progress( container ) ).toBe( 'Step 1 of 2' );
	} );

	it( 'skips the hidden step entirely rather than landing on it', () => {
		const { container } = mount( threeSteps( hideStepTwoWhenRoomsOverTwo ) );

		setRooms( container, 3 );
		next( container );

		expect( byId( container, 'notes' ) ).not.toBeNull();
		expect( byId( container, 'details' ) ).toBeNull();
		expect( progress( container ) ).toBe( 'Step 2 of 2' );
	} );

	it( 'walks through every step when none is hidden', () => {
		const { container } = mount( threeSteps() );

		next( container );

		expect( byId( container, 'details' ) ).not.toBeNull();

		const backButton = container.querySelector( '[data-quoteform-back]' );
		const nextButton = container.querySelector( '[data-quoteform-next]' );

		expect( backButton.type ).toBe( 'button' );
		expect( nextButton.type ).toBe( 'button' );
		expect( backButton.nextElementSibling ).toBe( nextButton );

		next( container );

		expect( byId( container, 'notes' ) ).not.toBeNull();
		expect( progress( container ) ).toBe( 'Step 3 of 3' );
	} );

	it( 'moves focus to the new step heading', () => {
		const { container } = mount( threeSteps() );

		next( container );

		const heading = container.querySelector( '[data-quoteform-step] h2, [data-quoteform-step] h3' );

		expect( document.activeElement ).toBe( heading );
		expect( heading.getAttribute( 'tabindex' ) ).toBe( '-1' );
	} );

	it( 'goes back to the previous visible step', () => {
		const { container } = mount( threeSteps( hideStepTwoWhenRoomsOverTwo ) );

		setRooms( container, 3 );
		next( container );
		back( container );

		expect( byId( container, 'rooms' ) ).not.toBeNull();
		expect( progress( container ) ).toBe( 'Step 1 of 2' );
	} );

	it( 'offers no Back on the first step and no Next on the last', () => {
		const { container } = mount( threeSteps() );

		expect( container.querySelector( '[data-quoteform-back]' ) ).toBeNull();

		next( container );
		next( container );

		expect( container.querySelector( '[data-quoteform-next]' ) ).toBeNull();
		expect( container.querySelector( '[data-quoteform-back]' ) ).not.toBeNull();
	} );

	it( 'moves the visitor off a step that becomes hidden under them', () => {
		const { container } = mount( threeSteps( hideStepTwoWhenRoomsOverTwo ) );

		next( container );

		expect( byId( container, 'details' ) ).not.toBeNull();

		back( container );
		setRooms( container, 3 );
		next( container );

		expect( byId( container, 'notes' ) ).not.toBeNull();
		expect( progress( container ) ).toBe( 'Step 2 of 2' );
	} );

	it( 'keeps the visitor on their own step when an earlier one disappears under them', () => {
		const schema = threeSteps( [
			{
				target: { kind: 'step', key: 'one' },
				action: 'hide',
				match: 'all',
				conditions: [ { field: 'details', operator: 'equals', value: 'skip' } ],
			},
		] );

		const { container } = mount( schema );

		next( container );

		const details = byId( container, 'details' );

		details.value = 'skip';
		details.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		expect( byId( container, 'details' ) ).not.toBeNull();
		expect( byId( container, 'notes' ) ).toBeNull();
		expect( progress( container ) ).toBe( 'Step 1 of 2' );
	} );

	it( 'opens on the first visible step when a rule hides the first one', () => {
		const schema = threeSteps( [
			{
				target: { kind: 'step', key: 'one' },
				action: 'hide',
				match: 'all',
				conditions: [ { field: 'mode', operator: 'equals', value: 'all' } ],
			},
		] );

		schema.fields.mode = { key: 'mode', type: 'hidden', label: '', help: '', default: 'all', required: false };

		const { container } = mount( schema );

		expect( byId( container, 'details' ) ).not.toBeNull();
		expect( progress( container ) ).toBe( 'Step 1 of 2' );
		expect( container.querySelector( '[data-quoteform-back]' ) ).toBeNull();
	} );

	it( 'takes no focus at mount, even when it has to open on a later step', () => {
		const schema = threeSteps( [
			{
				target: { kind: 'step', key: 'one' },
				action: 'hide',
				match: 'all',
				conditions: [ { field: 'mode', operator: 'equals', value: 'all' } ],
			},
		] );

		schema.fields.mode = { key: 'mode', type: 'hidden', label: '', help: '', default: 'all', required: false };

		mount( schema );

		expect( document.activeElement ).toBe( document.body );
	} );

	it( 'moves focus to the step the visitor lands on when their own step vanishes', () => {
		const schema = threeSteps( [
			{
				target: { kind: 'step', key: 'one' },
				action: 'hide',
				match: 'all',
				conditions: [ { field: 'rooms', operator: 'is_empty' } ],
			},
		] );

		const { container } = mount( schema );

		expect( byId( container, 'rooms' ) ).not.toBeNull();

		setRooms( container, '' );

		expect( byId( container, 'details' ) ).not.toBeNull();
		expect( document.activeElement ).toBe( container.querySelector( '[data-quoteform-step="two"] h2' ) );
	} );

	it( 'shows something rather than nothing when every step is hidden', () => {
		const hideAll = [ 'one', 'two', 'three' ].map( ( key ) => ( {
			target: { kind: 'step', key },
			action: 'hide',
			match: 'all',
			conditions: [ { field: 'mode', operator: 'equals', value: 'all' } ],
		} ) );

		const schema = threeSteps( hideAll );

		schema.fields.mode = { key: 'mode', type: 'hidden', label: '', help: '', default: 'all', required: false };

		const { container } = mount( schema );
		const note = container.querySelector( '[data-quoteform-empty]' );
		const bar = container.querySelector( '[data-quoteform-progress]' );

		expect( container.querySelector( '[data-quoteform-step]' ) ).toBeNull();
		expect( container.querySelector( '[data-quoteform-next]' ) ).toBeNull();
		expect( note ).not.toBeNull();
		expect( note.textContent ).toBe( 'There is nothing to fill in right now.' );
		expect( bar.hidden ).toBe( true );
		expect( bar.textContent ).toBe( '' );
	} );
	// "I accept the terms" tək-checkbox sahənin kanonik istifadəsidir. Onun
	// dəyəri `false`-dur, `false` isə nə `undefined`, nə `null`, nə də `''` —
	// blanket-falsy boşluq yoxlaması onu "doldurulub" sayırdı, yəni forma
	// `aria-required="true"` elan edir, sonra heç nə tələb etmirdi.
	it( 'refuses to advance while a required toggle is unticked', () => {
		const { container } = mount( withRequiredToggle() );

		next( container );

		expect( byId( container, 'details' ) ).toBeNull();
		expect( progress( container ) ).toBe( 'Step 1 of 3' );
		expect( errorText( container, 'agree' ) ).toBe( 'This field is required.' );
		expect( byId( container, 'agree' ).getAttribute( 'aria-invalid' ) ).toBe( 'true' );
	} );

	it( 'advances as soon as the required toggle is ticked', () => {
		const { container } = mount( withRequiredToggle() );

		next( container );

		const agree = byId( container, 'agree' );

		agree.checked = true;
		agree.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		next( container );

		expect( byId( container, 'details' ) ).not.toBeNull();
	} );

	it( 'refuses to advance while a required field on the step is empty', () => {
		const { container } = mount( withRequiredFields() );

		next( container );

		expect( byId( container, 'rooms' ) ).not.toBeNull();
		expect( byId( container, 'details' ) ).toBeNull();
		expect( progress( container ) ).toBe( 'Step 1 of 3' );
		expect( errorText( container, 'rooms' ) ).toBe( 'This field is required.' );
		expect( byId( container, 'rooms' ).getAttribute( 'aria-invalid' ) ).toBe( 'true' );
	} );

	it( 'moves focus to the first control with an error, not the last', () => {
		const { container } = mount( withRequiredFields() );

		next( container );

		expect( errorText( container, 'email' ) ).toBe( 'This field is required.' );
		expect( document.activeElement ).toBe( byId( container, 'rooms' ) );
	} );

	it( 'clears a field error as soon as the visitor answers it', () => {
		const { container } = mount( withRequiredFields() );

		next( container );

		expect( errorText( container, 'rooms' ) ).toBe( 'This field is required.' );

		setRooms( container, 2 );

		expect( errorText( container, 'rooms' ) ).toBe( '' );
		expect( byId( container, 'rooms' ).hasAttribute( 'aria-invalid' ) ).toBe( false );
		expect( errorText( container, 'email' ) ).toBe( 'This field is required.' );
	} );

	it( 'advances once every required field on the step is answered', () => {
		const { container } = mount( withRequiredFields() );

		next( container );
		setRooms( container, 2 );
		setValue( container, 'email', 'a@example.com' );
		next( container );

		expect( byId( container, 'details' ) ).not.toBeNull();
		expect( progress( container ) ).toBe( 'Step 2 of 3' );
	} );

	it( 'reports a malformed email rather than letting it through', () => {
		const { container } = mount( withRequiredFields() );

		setRooms( container, 2 );
		setValue( container, 'email', 'nope' );
		next( container );

		expect( byId( container, 'details' ) ).toBeNull();
		expect( errorText( container, 'email' ) ).toBe( 'Enter an email address.' );
		expect( document.activeElement ).toBe( byId( container, 'email' ) );
	} );

	it( 'lets a required field that a rule has hidden through', () => {
		const { container } = mount(
			withRequiredFields( [
				{
					target: { kind: 'field', key: 'email' },
					action: 'hide',
					match: 'all',
					conditions: [ { field: 'rooms', operator: 'greater', value: 1 } ],
				},
			] )
		);

		setRooms( container, 2 );
		next( container );

		expect( byId( container, 'email' ) ).toBeNull();
		expect( byId( container, 'details' ) ).not.toBeNull();
		expect( progress( container ) ).toBe( 'Step 2 of 3' );
	} );

	// Ziyarətçinin nə görə, nə də doldura biləcəyi sahə onu addımda saxlamamalıdır:
	// `hidden` nəzarətin `setError`-u boşdur, ona görə mesaj heç yerdə çıxmazdı və
	// Next həmişəlik ölü qalardı.
	it( 'lets the visitor past a required field they can neither see nor fix', () => {
		const schema = threeSteps();

		schema.fields.token = { key: 'token', type: 'hidden', label: '', help: '', default: '', required: true };
		schema.steps[ 0 ].fields = [ 'rooms', 'token' ];

		const { container } = mount( schema );

		next( container );

		expect( byId( container, 'details' ) ).not.toBeNull();
		expect( progress( container ) ).toBe( 'Step 2 of 3' );
	} );

	// Tanınmayan tip `buildControl`-dan `null` alır, yəni nəzarət ümumiyyətlə
	// qurulmur. Belə sahə Next-i bloklasaydı, ziyarətçi nə mesaj görər, nə də
	// düzəldəcək bir şey tapardı — sonsuza qədər ilişərdi.
	it( 'lets the visitor past a required field of a type it cannot render', () => {
		const schema = threeSteps();

		schema.fields.signature = {
			key: 'signature',
			type: 'signature',
			label: 'Sign here',
			help: '',
			default: '',
			required: true,
		};
		schema.steps[ 0 ].fields = [ 'rooms', 'signature' ];

		const { container } = mount( schema );

		expect( byId( container, 'signature' ) ).toBeNull();

		next( container );

		expect( byId( container, 'details' ) ).not.toBeNull();
		expect( progress( container ) ).toBe( 'Step 2 of 3' );
	} );

	// Seçimsiz qrupun heç bir `input`-u yoxdur, ona görə fokus ona verilə bilmir.
	// Axtarış orada dayanmamalıdır — sonrakı xətalı sahə fokusu almalıdır.
	it( 'walks past an error it cannot focus and lands on one it can', () => {
		const schema = threeSteps();

		schema.fields.rooms = { key: 'rooms', type: 'number', label: 'Rooms', help: '', default: '', required: true };
		schema.fields.extras = {
			key: 'extras',
			type: 'checkbox',
			label: 'Extras',
			help: '',
			default: [],
			required: true,
			options: [],
		};
		schema.steps[ 0 ].fields = [ 'extras', 'rooms' ];

		const { container } = mount( schema );

		next( container );

		expect( errorText( container, 'extras' ) ).toBe( 'This field is required.' );
		expect( document.activeElement ).toBe( byId( container, 'rooms' ) );
		expect( progress( container ) ).toBe( 'Step 1 of 3' );
	} );

	it( 'never blocks Back, however empty the step it is leaving', () => {
		const { container } = mount( withRequiredFields() );

		setRooms( container, 2 );
		setValue( container, 'email', 'a@example.com' );
		next( container );

		expect( byId( container, 'details' ) ).not.toBeNull();

		back( container );

		expect( byId( container, 'rooms' ) ).not.toBeNull();
		expect( progress( container ) ).toBe( 'Step 1 of 3' );
	} );
} );
