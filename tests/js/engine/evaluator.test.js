import { evaluate } from '../../../frontend-src/engine/evaluator';
import { parse } from '../../../frontend-src/engine/parser';

const run = ( source, variables = {} ) => evaluate( parse( source ), variables );

describe( 'evaluate', () => {
	it( 'respects arithmetic precedence', () => {
		expect( run( '2 + 3 * 4' ) ).toBe( 14 );
		expect( run( '(2 + 3) * 4' ) ).toBe( 20 );
	} );

	it( 'resolves variables', () => {
		expect( run( '{room_count} * 50 + {bathrooms} * 120', { room_count: 3, bathrooms: 2 } ) ).toBe( 390 );
	} );

	it( 'treats an empty variable as zero', () => {
		expect( run( '{room_count} * 50 + {bathrooms} * 120', { room_count: 3, bathrooms: '' } ) ).toBe( 150 );
	} );

	it( 'applies unary operators', () => {
		expect( run( '-{a}', { a: 5 } ) ).toBe( -5 );
		expect( run( '!{a}', { a: 0 } ) ).toBe( true );
		expect( run( '!{a}', { a: 1 } ) ).toBe( false );
	} );

	it( 'takes a float remainder', () => {
		expect( run( '7 % 3' ) ).toBe( 1 );
		expect( run( '7.5 % 3.5' ) ).toBe( 0.5 );
	} );

	it( 'returns booleans from comparisons', () => {
		expect( run( '{a} > 2', { a: 5 } ) ).toBe( true );
		expect( run( '{tier} == "express"', { tier: 'express' } ) ).toBe( true );
		expect( run( '{tier} == 5', { tier: '5' } ) ).toBe( false );
	} );

	it( 'short-circuits logical operators', () => {
		expect( run( '{a} && (1 / 0)', { a: 0 } ) ).toBe( false );
		expect( run( '{a} || (1 / 0)', { a: 1 } ) ).toBe( true );
	} );

	it( 'evaluates only the chosen if branch', () => {
		expect( run( 'if({x} == 0, 0, 100 / {x})', { x: 0 } ) ).toBe( 0 );
		expect( run( 'if({x} == 0, 0, 100 / {x})', { x: 4 } ) ).toBe( 25 );
	} );

	it( 'returns non-numeric if branches', () => {
		expect( run( 'if({a}, "yes", "no")', { a: 1 } ) ).toBe( 'yes' );
	} );

	it( 'rejects if with the wrong argument count', () => {
		try {
			run( 'if(1, 2)' );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( 'wrong_argument_count' );
		}
	} );

	it.each( [
		[ '1 / 0', {}, 'division_by_zero' ],
		[ '1 % 0', {}, 'division_by_zero' ],
		[ '{nope}', { a: 1 }, 'unknown_variable' ],
	] )( 'rejects %s', ( source, variables, codeSlug ) => {
		try {
			run( source, variables );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( codeSlug );
		}
	} );

	// Adın özü kontekstdə qalır — `CalculationValidator` xətanı bununla
	// yerləşdirir. "Did you mean" təklifi isə SİLİNDİ: onu heç bir istehsal
	// kodu oxumurdu, halbuki iki mühərrikdə əl ilə paritetdə saxlanılan
	// Levenshtein tətbiqi kimi yaşayır və ölçü büdcəli bundle-a düşürdü.
	it( 'names the variable it could not resolve, and offers nothing more', () => {
		try {
			run( '{bathroms}', { bathrooms: 2 } );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( 'unknown_variable' );
			expect( error.context ).toEqual( { name: 'bathroms' } );
		}
	} );

	it( 'evaluates a real-world expression', () => {
		expect(
			run( 'round(if({urgency} == "express", {subtotal} * 1.3, {subtotal}), 2)', {
				urgency: 'express',
				subtotal: 390,
			} )
		).toBe( 507 );
	} );
} );
