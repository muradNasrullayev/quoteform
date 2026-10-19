import { ExpressionError } from '../../../frontend-src/engine/errors';
import { parse } from '../../../frontend-src/engine/parser';

describe( 'parse', () => {
	it( 'binds multiplication tighter than addition', () => {
		expect( parse( '2 + 3 * 4' ) ).toEqual( {
			type: 'binary',
			op: '+',
			left: { type: 'number', value: 2 },
			right: {
				type: 'binary',
				op: '*',
				left: { type: 'number', value: 3 },
				right: { type: 'number', value: 4 },
			},
		} );
	} );

	it( 'lets parentheses override precedence', () => {
		expect( parse( '(2 + 3) * 4' ) ).toEqual( {
			type: 'binary',
			op: '*',
			left: {
				type: 'binary',
				op: '+',
				left: { type: 'number', value: 2 },
				right: { type: 'number', value: 3 },
			},
			right: { type: 'number', value: 4 },
		} );
	} );

	it( 'parses subtraction as left associative', () => {
		expect( parse( '10 - 3 - 2' ) ).toEqual( {
			type: 'binary',
			op: '-',
			left: {
				type: 'binary',
				op: '-',
				left: { type: 'number', value: 10 },
				right: { type: 'number', value: 3 },
			},
			right: { type: 'number', value: 2 },
		} );
	} );

	it( 'binds comparison looser than arithmetic', () => {
		expect( parse( '{a} + 1 > 5' ) ).toEqual( {
			type: 'binary',
			op: '>',
			left: {
				type: 'binary',
				op: '+',
				left: { type: 'var', name: 'a' },
				right: { type: 'number', value: 1 },
			},
			right: { type: 'number', value: 5 },
		} );
	} );

	it( 'binds logical or loosest of all', () => {
		expect( parse( '{a} && {b} || {c}' ) ).toEqual( {
			type: 'binary',
			op: '||',
			left: {
				type: 'binary',
				op: '&&',
				left: { type: 'var', name: 'a' },
				right: { type: 'var', name: 'b' },
			},
			right: { type: 'var', name: 'c' },
		} );
	} );

	it( 'parses unary minus and not', () => {
		expect( parse( '-{a}' ) ).toEqual( {
			type: 'unary',
			op: '-',
			operand: { type: 'var', name: 'a' },
		} );

		expect( parse( '!{a}' ) ).toEqual( {
			type: 'unary',
			op: '!',
			operand: { type: 'var', name: 'a' },
		} );
	} );

	it( 'parses a function call with arguments', () => {
		expect( parse( 'round({total}, 2)' ) ).toEqual( {
			type: 'call',
			name: 'round',
			args: [
				{ type: 'var', name: 'total' },
				{ type: 'number', value: 2 },
			],
		} );
	} );

	it( 'parses a function call with no arguments', () => {
		expect( parse( 'sum()' ) ).toEqual( { type: 'call', name: 'sum', args: [] } );
	} );

	it.each( [
		[ '(2 + 3', 'unexpected_token' ],
		[ '1 2', 'unexpected_token' ],
		[ 'round', 'unexpected_token' ],
		[ '   ', 'empty_expression' ],
	] )( 'rejects %s', ( source, codeSlug ) => {
		try {
			parse( source );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ExpressionError );
			expect( error.codeSlug ).toBe( codeSlug );
		}
	} );
} );
