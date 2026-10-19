import {
	EMPTY_INDEX,
	errorsFor,
	hasErrorsUnder,
	indexErrors,
} from '../../../admin-src/state/errors';

const errors = [
	{ path: 'settings.decimals', code: 'out_of_range', message: 'Too many.', context: {} },
	{ path: 'fields.room_count.label', code: 'missing_field', message: 'Needs a label.', context: {} },
	{ path: 'fields.room_count.min', code: 'invalid_type', message: 'Must be a number.', context: {} },
	{ path: '', code: 'missing_total', message: 'Needs a total.', context: {} },
];

describe( 'indexErrors', () => {
	it( 'survives being given nothing', () => {
		expect( errorsFor( indexErrors( null ), 'settings.decimals' ) ).toEqual( [] );
		expect( errorsFor( indexErrors( undefined ), 'settings.decimals' ) ).toEqual( [] );
		expect( errorsFor( indexErrors( 'nope' ), 'settings.decimals' ) ).toEqual( [] );
	} );

	it( 'ignores entries with no usable path', () => {
		const index = indexErrors( [ { code: 'weird' }, { path: 42, code: 'weirder' } ] );

		expect( hasErrorsUnder( index, '' ) ).toBe( false );
	} );

	it( 'survives being given a plain object', () => {
		expect( errorsFor( indexErrors( {} ), 'settings.decimals' ) ).toEqual( [] );
	} );
} );

describe( 'errorsFor', () => {
	it( 'returns the errors at exactly that path, in order', () => {
		const index = indexErrors( errors );
		const found = errorsFor( index, 'fields.room_count.min' );

		expect( found ).toHaveLength( 1 );
		expect( found[ 0 ].code ).toBe( 'invalid_type' );
	} );

	it( 'keeps several errors on one path, in server order', () => {
		const index = indexErrors( [
			{ path: 'settings.currency', code: 'invalid_type', message: 'a', context: {} },
			{ path: 'settings.currency', code: 'invalid_option', message: 'b', context: {} },
		] );

		expect( errorsFor( index, 'settings.currency' ).map( ( e ) => e.code ) ).toEqual( [
			'invalid_type',
			'invalid_option',
		] );
	} );

	it( 'returns an empty array for a path with no errors', () => {
		expect( errorsFor( indexErrors( errors ), 'settings.currency' ) ).toEqual( [] );
	} );

	it( 'finds the document-level error at the empty path', () => {
		expect( errorsFor( indexErrors( errors ), '' )[ 0 ].code ).toBe( 'missing_total' );
	} );

	it( 'reads from the empty index without throwing', () => {
		expect( errorsFor( EMPTY_INDEX, 'anything' ) ).toEqual( [] );
	} );

	it( 'freezes the returned array so mutating it throws instead of corrupting the index', () => {
		const index = indexErrors( errors );
		const found = errorsFor( index, 'settings.decimals' );

		expect( () => found.push( { path: 'x', code: 'y', message: 'z', context: {} } ) ).toThrow( TypeError );
		expect( errorsFor( index, 'settings.decimals' ) ).toHaveLength( 1 );
	} );
} );

describe( 'hasErrorsUnder', () => {
	it( 'is true for an exact match', () => {
		expect( hasErrorsUnder( indexErrors( errors ), 'settings.decimals' ) ).toBe( true );
	} );

	it( 'is true for an ancestor', () => {
		expect( hasErrorsUnder( indexErrors( errors ), 'fields.room_count' ) ).toBe( true );
		expect( hasErrorsUnder( indexErrors( errors ), 'fields' ) ).toBe( true );
	} );

	it( 'does NOT match a partial segment', () => {
		expect( hasErrorsUnder( indexErrors( errors ), 'fields.room' ) ).toBe( false );
		expect( hasErrorsUnder( indexErrors( errors ), 'setting' ) ).toBe( false );
	} );

	it( 'is false for an unrelated prefix', () => {
		expect( hasErrorsUnder( indexErrors( errors ), 'calculations' ) ).toBe( false );
	} );

	it( 'does NOT match in the reverse direction', () => {
		const index = indexErrors( [
			{ path: 'fields.room_count.label', code: 'missing_field', message: 'x', context: {} },
		] );

		expect( hasErrorsUnder( index, 'fields.room_count.label.extra' ) ).toBe( false );
	} );
} );
