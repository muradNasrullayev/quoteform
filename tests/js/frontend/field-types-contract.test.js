/**
 * @jest-environment jsdom
 */
import fixture from '../../fixtures/field-types.json';
import { buildControl, nextNamespace } from '../../../frontend-src/dom/controls';
import { normaliseValue, variablesFor } from '../../../frontend-src/runtime/values';

/**
 * Sahə tipi cədvəlinin RENDERER tərəfi, tests/fixtures/field-types.json-a qarşı.
 *
 * Eyni faylı server (tests/php/Forms/FieldTypeContractTest.php) və builder
 * (tests/js/admin/fields.test.js) da oxuyur. Renderer-in nüsxəsi geri qalanda
 * heç bir dəst düşmürdü: `buildControl()` tanımadığı tipə `null` qaytarır,
 * `createForm()` sahəni atlayır, `mayLeave()` isə nəzarəti olmayan sahənin
 * Next-i bloklamasına QƏSDƏN imkan vermir — yəni sahə, `required` olsa belə,
 * səhifədə sadəcə YOXDUR.
 */
const OPTIONS = [
	{ label: 'Standard', value: 'standard', price: 0 },
	{ label: 'Express', value: 'express', price: 60 },
];

const fieldFor = ( type ) => {
	const field = {
		key: 'probe',
		type: type.type,
		label: 'Probe',
		help: '',
		placeholder: '',
		required: false,
		default: '',
	};

	if ( type.extra_keys.indexOf( 'options' ) !== -1 ) {
		field.options = OPTIONS;
	}

	if ( type.extra_keys.indexOf( 'content' ) !== -1 ) {
		field.content = '<p>Read this.</p>';
	}

	if ( type.extra_keys.indexOf( 'min' ) !== -1 ) {
		Object.assign( field, { min: 0, max: 10, step: 1 } );
	}

	return field;
};

const schemaFor = ( field ) => ( {
	fields: { probe: field },
	steps: [ { key: 'one', title: 'One', description: '', fields: [ 'probe' ] } ],
} );

describe( 'the renderer against the shared field-type fixture', () => {
	it( 'reads a fixture that actually has types in it', () => {
		expect( fixture.types.length ).toBeGreaterThan( 0 );
		expect( new Set( fixture.types.map( ( type ) => type.type ) ).size ).toBe( fixture.types.length );
	} );

	it.each( fixture.types.map( ( type ) => [ type.type, type ] ) )(
		'builds a control for %s',
		( name, type ) => {
			const control = buildControl( fieldFor( type ), nextNamespace( 12 ) );

			expect( control ).not.toBeNull();
			expect( control.wrapper ).toBeInstanceOf( HTMLElement );
			expect( typeof control.setError ).toBe( 'function' );
		}
	);

	it.each( fixture.types.map( ( type ) => [ type.type, type ] ) )(
		'exposes a .price variable for %s only when the fixture says it bears a price',
		( name, type ) => {
			const field = fieldFor( type );
			const variables = variablesFor( schemaFor( field ), { probe: '' }, new Set( [ 'probe' ] ) );

			expect(
				Object.prototype.hasOwnProperty.call( variables, 'probe.price' )
			).toBe( type.price_bearing );
		}
	);

	it.each( fixture.types.map( ( type ) => [ type.type, type ] ) )(
		'normalises %s to the collection shape the fixture declares',
		( name, type ) => {
			expect( Array.isArray( normaliseValue( fieldFor( type ), [ 'standard' ] ) ) ).toBe( type.multi );
		}
	);

	it.each( fixture.types.filter( ( type ) => type.numeric ).map( ( type ) => [ type.type, type ] ) )(
		'parses %s as a number, and refuses what is not one',
		( name, type ) => {
			expect( normaliseValue( fieldFor( type ), '7' ) ).toBe( 7 );
			expect( normaliseValue( fieldFor( type ), 'seven' ) ).toBe( '' );
		}
	);

	// `toggle` buradan kənardadır və bu QƏSDƏNDİR: onun öz budağı var —
	// işarələnmiş/işarələnməmiş mühərrikə `1`/`0` kimi gedir, mətn kimi yox.
	it.each(
		fixture.types
			.filter( ( type ) => ! type.numeric && ! type.multi && type.type !== 'toggle' )
			.map( ( type ) => [ type.type, type ] )
	)( 'keeps %s as the text the visitor typed', ( name, type ) => {
		expect( normaliseValue( fieldFor( type ), '7' ) ).toBe( '7' );
	} );

	it( 'gives a toggle the engine a number, not the text of one', () => {
		const toggle = fixture.types.find( ( type ) => type.type === 'toggle' );

		expect( normaliseValue( fieldFor( toggle ), true ) ).toBe( 1 );
		expect( normaliseValue( fieldFor( toggle ), false ) ).toBe( 0 );
	} );
} );
