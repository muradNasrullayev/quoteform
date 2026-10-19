import {
	EMAIL_PATTERN,
	fieldErrorCode,
	validateFields,
	validateVisible,
	errorMessage,
} from '../../../frontend-src/runtime/validate';

const number = { key: 'rooms', type: 'number', label: 'Rooms', min: 1, max: 10 };
const email = { key: 'email', type: 'email', label: 'Email' };
const toggle = { key: 'agree', type: 'toggle', label: 'Agree' };
const extras = { key: 'extras', type: 'checkbox', label: 'Extras', options: [] };

const vis = ( fields, required = [], steps = [ 'one', 'two' ] ) => ( {
	fields: new Set( fields ),
	required: new Set( required ),
	steps: new Set( steps ),
} );

describe( 'fieldErrorCode', () => {
	it( 'names a blank required field', () => {
		expect( fieldErrorCode( number, '', true ) ).toBe( 'required' );
		expect( fieldErrorCode( toggle, false, true ) ).toBe( 'required' );
		expect( fieldErrorCode( extras, [], true ) ).toBe( 'required' );
	} );

	it( 'treats a number field holding a non-number as blank', () => {
		expect( fieldErrorCode( number, ' 5', true ) ).toBe( 'required' );
		expect( fieldErrorCode( number, '5\n', true ) ).toBe( 'required' );
		expect( fieldErrorCode( number, ' 5', false ) ).toBeNull();
	} );

	it( 'reads zero as an answer and numeric strings as numbers', () => {
		expect( fieldErrorCode( number, 0, false ) ).toBe( 'min' );
		expect( fieldErrorCode( number, '3', true ) ).toBeNull();
	} );

	it( 'reports the bound that was crossed', () => {
		expect( fieldErrorCode( number, 11, false ) ).toBe( 'max' );
		expect( fieldErrorCode( number, 10, false ) ).toBeNull();
		expect( fieldErrorCode( number, 1, false ) ).toBeNull();
		expect( fieldErrorCode( number, '1e400', false ) ).toBe( 'max' );
	} );

	it( 'checks the email shape only when something was typed', () => {
		expect( fieldErrorCode( email, '', false ) ).toBeNull();
		expect( fieldErrorCode( email, 'a@b', false ) ).toBeNull();
		expect( fieldErrorCode( email, 'a@@b', false ) ).toBe( 'email' );
		expect( fieldErrorCode( email, 'a b@c', false ) ).toBe( 'email' );
		expect( fieldErrorCode( email, 'a b@c', false ) ).toBe( 'email' );
	} );
} );

describe( 'EMAIL_PATTERN', () => {
	it( 'uses exactly the whitespace JavaScript calls \\s', () => {
		const spaces = [ '\t', '\n', '\v', '\f', '\r', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', '　', '﻿' ];

		spaces.forEach( ( space ) => {
			expect( /\s/.test( space ) ).toBe( true );
			expect( EMAIL_PATTERN.test( `a${ space }b@c` ) ).toBe( false );
		} );
		expect( EMAIL_PATTERN.test( 'a\u0085b@c' ) ).toBe( true );
	} );
} );

describe( 'validateFields / validateVisible', () => {
	const schema = {
		fields: { rooms: number, email, token: { key: 'token', type: 'hidden', label: '' } },
		steps: [
			{ key: 'one', fields: [ 'rooms', 'token' ] },
			{ key: 'two', fields: [ 'email' ] },
		],
	};

	it( 'skips hidden, silent and unknown fields', () => {
		const errors = validateFields( schema, [ 'rooms', 'token', 'ghost' ], { rooms: '' }, vis( [ 'token' ], [ 'rooms', 'token' ] ) );

		expect( errors ).toEqual( {} );
	} );

	it( 'walks every visible step in schema order', () => {
		const errors = validateVisible( schema, { rooms: 0, email: 'x' }, vis( [ 'rooms', 'email' ] ) );

		expect( Object.keys( errors ) ).toEqual( [ 'rooms', 'email' ] );
		expect( errors ).toEqual( { rooms: 'min', email: 'email' } );
	} );

	it( 'ignores fields on a hidden step', () => {
		expect( validateVisible( schema, { email: 'x' }, vis( [ 'email' ], [], [ 'one' ] ) ) ).toEqual( {} );
	} );
} );

describe( 'errorMessage', () => {
	it( 'turns each code into the sentence the visitor reads', () => {
		expect( errorMessage( 'required', number ) ).toBe( 'This field is required.' );
		expect( errorMessage( 'email', email ) ).toBe( 'Enter an email address.' );
		expect( errorMessage( 'min', number ) ).toBe( 'Enter 1 or more.' );
		expect( errorMessage( 'max', number ) ).toBe( 'Enter 10 or less.' );
	} );
} );
