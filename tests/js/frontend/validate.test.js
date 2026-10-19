import { validateStep } from '../../../frontend-src/runtime/validate';

const schema = {
	fields: {
		rooms: { key: 'rooms', type: 'number', label: 'Rooms', required: true, min: 0, max: 9 },
		email: { key: 'email', type: 'email', label: 'Email', required: true },
		notes: { key: 'notes', type: 'textarea', label: 'Notes', required: false },
		extras: { key: 'extras', type: 'checkbox', label: 'Extras', required: true, options: [] },
		budget: { key: 'budget', type: 'slider', label: 'Budget', required: false, min: 10, max: 100 },
		agree: { key: 'agree', type: 'toggle', label: 'I accept the terms', required: true },
		token: { key: 'token', type: 'hidden', label: '', required: true },
		intro: { key: 'intro', type: 'html', label: '', required: true, content: '<p>Read this.</p>' },
	},
	steps: [
		{
			key: 'one',
			title: 'One',
			description: '',
			fields: [ 'rooms', 'email', 'notes', 'extras', 'budget', 'agree', 'token', 'intro' ],
		},
	],
};

const step = schema.steps[ 0 ];

const visibility = ( required, fields ) => ( {
	fields: new Set( fields || [ 'rooms', 'email', 'notes', 'extras' ] ),
	steps: new Set( [ 'one' ] ),
	required: new Set( required ),
} );

describe( 'validateStep', () => {
	it( 'reports an empty required field', () => {
		const errors = validateStep( schema, step, { rooms: '', email: '', extras: [] }, visibility( [ 'rooms' ] ) );

		expect( errors.rooms ).toBeTruthy();
		expect( errors.email ).toBeUndefined();
	} );

	// Bu iki iddia BİR YERDƏ dayanır, çünki onlar bir-birinin əksi kimi görünür
	// və birini "sadələşdirmək" o birini sındırır: boşluq tipə görə oxunur.
	// `0` rəqəm sahəsində tam hüquqlu cavabdır; işarələnməmiş toggle (`false`)
	// isə ümumiyyətlə cavab deyil — ondan əvvəlki blanket-falsy yoxlama onu
	// "doldurulub" sayırdı və `required` toggle Next-i heç vaxt bloklamırdı.
	it( 'accepts zero as an answer to a required number field', () => {
		const errors = validateStep( schema, step, { rooms: 0 }, visibility( [ 'rooms' ] ) );

		expect( errors.rooms ).toBeUndefined();
	} );

	it( 'blocks on a required toggle the visitor has not ticked', () => {
		const unticked = visibility( [ 'agree' ], [ 'agree' ] );

		expect( validateStep( schema, step, { agree: false }, unticked ).agree ).toBeTruthy();
		expect( validateStep( schema, step, { agree: 0 }, unticked ).agree ).toBeTruthy();
		expect( validateStep( schema, step, { agree: '' }, unticked ).agree ).toBeTruthy();
	} );

	it( 'lets a ticked toggle through, however the value was stored', () => {
		const ticked = visibility( [ 'agree' ], [ 'agree' ] );

		expect( validateStep( schema, step, { agree: true }, ticked ).agree ).toBeUndefined();
		expect( validateStep( schema, step, { agree: 1 }, ticked ).agree ).toBeUndefined();
		expect( validateStep( schema, step, { agree: '1' }, ticked ).agree ).toBeUndefined();
	} );

	it( 'leaves an optional toggle alone whether or not it is ticked', () => {
		const optional = visibility( [], [ 'agree' ] );

		expect( validateStep( schema, step, { agree: false }, optional ).agree ).toBeUndefined();
		expect( validateStep( schema, step, { agree: true }, optional ).agree ).toBeUndefined();
	} );

	it( 'reports an empty required checkbox group', () => {
		const errors = validateStep( schema, step, { extras: [] }, visibility( [ 'extras' ] ) );

		expect( errors.extras ).toBeTruthy();
	} );

	it( 'does not report a required field that a rule has hidden', () => {
		const errors = validateStep(
			schema,
			step,
			{ rooms: '' },
			visibility( [], [ 'email', 'notes', 'extras' ] )
		);

		expect( errors.rooms ).toBeUndefined();
	} );

	it( 'reports a malformed email only when something was typed', () => {
		expect( validateStep( schema, step, { email: 'not-an-email' }, visibility( [] ) ).email ).toBeTruthy();
		expect( validateStep( schema, step, { email: '' }, visibility( [] ) ).email ).toBeUndefined();
	} );

	it( 'reports a number outside its range', () => {
		expect( validateStep( schema, step, { rooms: -1 }, visibility( [] ) ).rooms ).toBeTruthy();
		expect( validateStep( schema, step, { rooms: 20 }, visibility( [] ) ).rooms ).toBeTruthy();
		expect( validateStep( schema, step, { rooms: 5 }, visibility( [] ) ).rooms ).toBeUndefined();
	} );

	it( 'checks only the step it was given', () => {
		const twoSteps = {
			...schema,
			steps: [
				{ key: 'one', title: 'One', description: '', fields: [ 'rooms' ] },
				{ key: 'two', title: 'Two', description: '', fields: [ 'email' ] },
			],
		};

		const errors = validateStep( twoSteps, twoSteps.steps[ 0 ], {}, visibility( [ 'rooms', 'email' ] ) );

		expect( errors.rooms ).toBeTruthy();
		expect( errors.email ).toBeUndefined();
	} );

	// Bu iki test §8.1-in əsl ayrılma nöqtəsidir: sahə GÖRÜNÜR, ancaq effektiv
	// tələb olunma qaydadan gəlir. `field.required` oxuyan implementasiyanı
	// yalnız bunlar tutur — gizlədilmiş sahə testi tutmur, çünki orada sahə
	// artıq `visibility.fields`-dən düşüb və yoxlama ona heç çatmır.
	it( 'reports a field that a rule has made required, though the schema calls it optional', () => {
		const errors = validateStep( schema, step, { notes: '' }, visibility( [ 'notes' ] ) );

		expect( errors.notes ).toBeTruthy();
	} );

	it( 'does not report a visible field that a rule has made optional', () => {
		const errors = validateStep( schema, step, { rooms: '', email: '', extras: [] }, visibility( [] ) );

		expect( errors.rooms ).toBeUndefined();
		expect( errors.email ).toBeUndefined();
		expect( errors.extras ).toBeUndefined();
	} );

	// Gizli sahənin köhnə dəyəri heç vaxt yoxlanılmır: onun nəzarəti DOM-dan
	// çıxarılıb, ona görə xəta mesajı heç kimə görünməzdi və Next əbədi bağlanardı.
	it( 'ignores a hidden field even when its leftover value is malformed', () => {
		const errors = validateStep(
			schema,
			step,
			{ email: 'not-an-email', rooms: 99 },
			visibility( [], [ 'rooms', 'notes', 'extras' ] )
		);

		expect( errors.email ).toBeUndefined();
		expect( errors.rooms ).toBeTruthy();
	} );

	// `hidden` və `html` nəzarətlərinin `setError`-u qəsdən boş funksiyadır:
	// onlara yazılan xəta heç bir yerdə görünmür. Belə sahəyə görə addımı
	// bağlamaq ziyarətçini nə görə, nə də düzəldə bilmədiyi bir şeyin qarşısında
	// saxlayardı — §8.1 davranış 2-nin eyni qüsuru, sadəcə başqa yoldan.
	it( 'does not report a required field the visitor can neither see nor fix', () => {
		const errors = validateStep(
			schema,
			step,
			{ token: '', intro: '' },
			visibility( [ 'token', 'intro' ], [ 'token', 'intro' ] )
		);

		expect( errors.token ).toBeUndefined();
		expect( errors.intro ).toBeUndefined();
		expect( errors ).toEqual( {} );
	} );

	it( 'accepts a number sitting exactly on either bound', () => {
		expect( validateStep( schema, step, { rooms: 9 }, visibility( [] ) ).rooms ).toBeUndefined();
		expect( validateStep( schema, step, { rooms: 0 }, visibility( [] ) ).rooms ).toBeUndefined();
	} );

	it( 'reports a number one step outside either bound', () => {
		expect( validateStep( schema, step, { rooms: 10 }, visibility( [] ) ).rooms ).toBeTruthy();
		expect( validateStep( schema, step, { rooms: -1 }, visibility( [] ) ).rooms ).toBeTruthy();
	} );

	it( 'wants something on both sides of the @', () => {
		expect( validateStep( schema, step, { email: 'a@' }, visibility( [] ) ).email ).toBeTruthy();
		expect( validateStep( schema, step, { email: '@example.com' }, visibility( [] ) ).email ).toBeTruthy();
		expect( validateStep( schema, step, { email: 'a@b' }, visibility( [] ) ).email ).toBeUndefined();
	} );

	it( 'range-checks a slider the same way it checks a number', () => {
		const sliderOnly = visibility( [], [ 'budget' ] );

		expect( validateStep( schema, step, { budget: 5 }, sliderOnly ).budget ).toBeTruthy();
		expect( validateStep( schema, step, { budget: 500 }, sliderOnly ).budget ).toBeTruthy();
		expect( validateStep( schema, step, { budget: 50 }, sliderOnly ).budget ).toBeUndefined();
	} );

	it( 'returns an empty object when everything is fine', () => {
		const errors = validateStep(
			schema,
			step,
			{ rooms: 3, email: 'a@example.com', notes: '', extras: [ 'x' ] },
			visibility( [ 'rooms', 'email', 'extras' ] )
		);

		expect( errors ).toEqual( {} );
	} );
} );
