import fixture from '../../fixtures/field-types.json';
import {
	defaultField,
	FIELD_TYPES,
	PRICE_BEARING_TYPES,
	fieldsReducer,
	LABEL_OPTIONAL_TYPES,
	TYPE_EXTRA_KEYS,
	TYPE_LABELS,
} from '../../../admin-src/state/fields';
import { addField, removeField, renameField, updateField } from '../../../admin-src/state/actions';

const COMMON = [ 'key', 'type', 'label', 'help', 'placeholder', 'required', 'default' ];

// Sahə tipi cədvəlinin BUILDER tərəfi, tests/fixtures/field-types.json-a qarşı —
// eyni faylı server (tests/php/Forms/FieldTypeContractTest.php) və renderer
// (tests/js/frontend/field-types-contract.test.js) də oxuyur. Siyahılar burda
// təkrar yazılmır: təkrar yazılsaydı, bu fayl cədvəlin BEŞİNCİ nüsxəsi olardı
// və heç nəyi bir yerdə saxlamazdı.
describe( 'the type table', () => {
	const types = fixture.types;

	it( 'lists exactly the types the shared fixture declares, in that order', () => {
		expect( FIELD_TYPES ).toEqual( types.map( ( type ) => type.type ) );
	} );

	it( 'gives each type exactly the extra keys the fixture declares', () => {
		types.forEach( ( type ) => {
			expect( TYPE_EXTRA_KEYS[ type.type ] ).toEqual( type.extra_keys );
		} );
		expect( Object.keys( TYPE_EXTRA_KEYS ).sort() ).toEqual(
			types.map( ( type ) => type.type ).sort()
		);
	} );

	it( 'makes the label optional for exactly the types the fixture marks', () => {
		expect( LABEL_OPTIONAL_TYPES ).toEqual(
			types.filter( ( type ) => type.label_optional ).map( ( type ) => type.type )
		);
	} );

	it( 'treats exactly the fixture\'s price-bearing types as price-bearing', () => {
		expect( PRICE_BEARING_TYPES ).toEqual(
			types.filter( ( type ) => type.price_bearing ).map( ( type ) => type.type )
		);
	} );

	it( 'gives every type in the fixture a label the builder can show', () => {
		types.forEach( ( type ) => {
			expect( typeof TYPE_LABELS[ type.type ] ).toBe( 'string' );
			expect( TYPE_LABELS[ type.type ] ).not.toBe( '' );
		} );
	} );
} );

describe( 'defaultField', () => {
	it( 'produces exactly the common keys for a plain type', () => {
		const field = defaultField( 'text', 'notes', 'Notes' );

		expect( Object.keys( field ).sort() ).toEqual( [ ...COMMON ].sort() );
		expect( field.key ).toBe( 'notes' );
		expect( field.type ).toBe( 'text' );
		expect( field.label ).toBe( 'Notes' );
		expect( field.required ).toBe( false );
	} );

	it( 'adds the range keys for number and slider, with usable values', () => {
		const field = defaultField( 'number', 'rooms', 'Rooms' );

		expect( Object.keys( field ).sort() ).toEqual( [ ...COMMON, 'min', 'max', 'step' ].sort() );
		expect( field.min ).toBe( 0 );
		expect( field.max ).toBe( 100 );
		expect( field.step ).toBe( 1 );
		expect( field.default ).toBe( 0 );
	} );

	it( 'gives an option type one starter option, because an empty list is invalid', () => {
		const field = defaultField( 'select', 'plan', 'Plan' );

		expect( field.options ).toHaveLength( 1 );
		expect( Object.keys( field.options[ 0 ] ).sort() ).toEqual( [ 'label', 'price', 'value' ] );
		expect( typeof field.options[ 0 ].price ).toBe( 'number' );
	} );

	it( 'gives html a content key that the server would accept', () => {
		expect( defaultField( 'html', 'intro', '' ).content.trim() ).not.toBe( '' );
	} );

	it( 'produces every type without throwing, and always with a string key', () => {
		FIELD_TYPES.forEach( ( type ) => {
			const field = defaultField( type, 'k', 'Label' );

			expect( typeof field.key ).toBe( 'string' );
			expect( field.type ).toBe( type );
		} );
	} );

	// Kills: mutant that special-cases dropping `help` for `tel`; a mutant
	// that adds `options` to `date`; a mutant that adds the range extras
	// (`min`/`max`/`step`) to `tel`; `toggle` defaulting to `''` instead of
	// `false`; `checkbox` defaulting to `''` instead of `[]`; `slider` with
	// `min` above `max` (e.g. 500); `slider` with `step` of `0`.
	describe.each( [
		[ 'number', [ 'min', 'max', 'step' ], 0, { min: 0, max: 100, step: 1 } ],
		[ 'text', [], '', {} ],
		[ 'email', [], '', {} ],
		[ 'tel', [], '', {} ],
		[ 'textarea', [], '', {} ],
		[ 'select', [ 'options' ], '', {} ],
		[ 'radio', [ 'options' ], '', {} ],
		[ 'checkbox', [ 'options' ], [], {} ],
		[ 'toggle', [], false, {} ],
		[ 'date', [], '', {} ],
		[ 'slider', [ 'min', 'max', 'step' ], 0, { min: 0, max: 100, step: 1 } ],
		[ 'hidden', [], '', {} ],
		[ 'html', [ 'content' ], '', {} ],
	] )(
		'defaultField( %s )',
		( type, extraKeys, expectedDefault, expectedExtraValues ) => {
			it( 'produces exactly the common keys plus its extras, with the right default', () => {
				const field = defaultField( type, 'k', 'Label' );

				expect( Object.keys( field ).sort() ).toEqual(
					[ ...COMMON, ...extraKeys ].sort()
				);
				expect( field.default ).toEqual( expectedDefault );

				Object.entries( expectedExtraValues ).forEach( ( [ extraKey, value ] ) => {
					expect( field[ extraKey ] ).toBe( value );
				} );
			} );
		}
	);

	it( 'refuses to create a field for a type the server does not recognise', () => {
		// Kills: the mutant that removes the guard on `TYPE_EXTRA_KEYS[ type ]`
		// and lets `defaultField( 'bogus', ... )` throw a TypeError instead of
		// being ignored.
		expect( defaultField( 'bogus', 'k', 'Label' ) ).toBeNull();
		expect( defaultField( undefined, 'k', 'Label' ) ).toBeNull();
	} );

	it( 'refuses a type reached only through the prototype chain', () => {
		// Kills: a guard implemented with `type in TYPE_EXTRA_KEYS` (rather
		// than `hasOwnProperty`), which would treat 'constructor' as a known
		// type because it is inherited from Object.prototype.
		expect( defaultField( 'constructor', 'k', 'Label' ) ).toBeNull();
	} );
} );

describe( 'TYPE_LABELS', () => {
	it( 'gives every type a translated label', () => {
		FIELD_TYPES.forEach( ( type ) => {
			expect( typeof TYPE_LABELS[ type ] ).toBe( 'string' );
			expect( TYPE_LABELS[ type ].length ).toBeGreaterThan( 0 );
		} );
	} );
} );

describe( 'fieldsReducer', () => {
	const fields = {
		rooms: defaultField( 'number', 'rooms', 'Rooms' ),
	};

	it( 'adds a field under a key derived from the type', () => {
		const next = fieldsReducer( fields, addField( 'text' ) );
		const added = Object.keys( next ).find( ( key ) => key !== 'rooms' );

		expect( next[ added ].type ).toBe( 'text' );
		expect( next[ added ].key ).toBe( added );
	} );

	it( 'never collides with an existing key', () => {
		const once = fieldsReducer( fields, addField( 'text' ) );
		const twice = fieldsReducer( once, addField( 'text' ) );

		expect( Object.keys( twice ) ).toHaveLength( 3 );
		expect( new Set( Object.keys( twice ) ).size ).toBe( 3 );
	} );

	it( 'patches one field and leaves the rest alone', () => {
		const next = fieldsReducer( fields, updateField( 'rooms', { label: 'How many rooms?' } ) );

		expect( next.rooms.label ).toBe( 'How many rooms?' );
		expect( next.rooms.min ).toBe( 0 );
	} );

	it( 'ignores a patch for a field that is not there', () => {
		expect( fieldsReducer( fields, updateField( 'ghost', { label: 'x' } ) ) ).toBe( fields );
	} );

	it( 'removes a field', () => {
		expect( fieldsReducer( fields, removeField( 'rooms' ) ) ).toEqual( {} );
	} );

	it( 'ignores a removal for a field that is not there', () => {
		expect( fieldsReducer( fields, removeField( 'ghost' ) ) ).toBe( fields );
	} );

	it( 'ignores an update reached only through the prototype chain', () => {
		// Kills: `fields[ action.key ]` used instead of
		// `hasOwnProperty`, which would treat `fields.constructor` (the
		// inherited Object constructor, a truthy value) as an existing
		// field and inject a bogus 'constructor' own key holding only the
		// patch.
		const next = fieldsReducer( fields, updateField( 'constructor', { label: 'x' } ) );

		expect( next ).toBe( fields );
		expect( Object.prototype.hasOwnProperty.call( next, 'constructor' ) ).toBe( false );
	} );

	it( 'ignores a removal reached only through the prototype chain', () => {
		// Kills: `action.key in fields` used instead of `hasOwnProperty`,
		// which would treat 'constructor' as present (it is inherited from
		// Object.prototype) and allocate a fresh, merely-equal map — losing
		// reference identity and marking the form dirty for a no-op.
		expect( fieldsReducer( fields, removeField( 'constructor' ) ) ).toBe( fields );
	} );

	it( 'ignores an add for a type the server does not recognise', () => {
		// Kills: the mutant that removes the null-check after
		// `defaultField()`, which would either throw or insert an
		// undefined field into the map.
		expect( fieldsReducer( fields, addField( 'bogus' ) ) ).toBe( fields );
	} );

	it( 'does not mutate what it was given', () => {
		const before = JSON.stringify( fields );

		fieldsReducer( fields, updateField( 'rooms', { label: 'Changed' } ) );

		expect( JSON.stringify( fields ) ).toBe( before );
	} );

	it( 'returns the same object for an action it does not handle', () => {
		expect( fieldsReducer( fields, { type: 'nothing' } ) ).toBe( fields );
	} );
} );

describe( 'fieldsReducer with more than one field', () => {
	const multi = {
		rooms: defaultField( 'number', 'rooms', 'Rooms' ),
		notes: defaultField( 'textarea', 'notes', 'Notes' ),
		agree: defaultField( 'toggle', 'agree', 'Agree' ),
	};

	it( 'patches the named field only, not the first one in the map', () => {
		// Kills: a mutant that patches `Object.keys( fields )[ 0 ]` instead
		// of `action.key` — indistinguishable from correct behaviour when
		// the map has only one entry.
		const next = fieldsReducer( multi, updateField( 'notes', { label: 'Extra notes' } ) );

		expect( next.notes.label ).toBe( 'Extra notes' );
		expect( next.rooms ).toBe( multi.rooms );
		expect( next.agree ).toBe( multi.agree );
	} );

	it( 'removes the named field only, not the first one in the map', () => {
		// Kills: a mutant that deletes `Object.keys( fields )[ 0 ]` instead
		// of `action.key`.
		const next = fieldsReducer( multi, removeField( 'notes' ) );

		expect( Object.keys( next ).sort() ).toEqual( [ 'agree', 'rooms' ] );
		expect( next.rooms ).toBe( multi.rooms );
		expect( next.agree ).toBe( multi.agree );
	} );
} );

describe( 'renameField', () => {
	const fields = {
		rooms: defaultField( 'number', 'rooms', 'Rooms' ),
		notes: defaultField( 'textarea', 'notes', 'Notes' ),
	};

	// Proof 1: a valid, free rename moves the map entry and keeps `.key`
	// in step with it — this is the shape `FieldValidator` requires
	// (`$field['key'] === $key`).
	it( 'moves the map entry to the new key and keeps .key in step', () => {
		const next = fieldsReducer( fields, renameField( 'rooms', 'area' ) );

		expect( Object.keys( next ).sort() ).toEqual( [ 'area', 'notes' ] );
		expect( next.area.key ).toBe( 'area' );
		expect( next.notes ).toBe( fields.notes );
	} );

	// Proof 2: renaming onto a key another field already holds changes
	// nothing at all — same reference back, so the reducer's identity
	// seam never marks the form dirty for a no-op.
	it( 'changes nothing when the new key is already taken', () => {
		expect( fieldsReducer( fields, renameField( 'rooms', 'notes' ) ) ).toBe( fields );
	} );

	// Proof 3: the resulting schema is one FieldValidator would accept —
	// every map key agrees with the field stored under it.
	it( 'produces a map where every key agrees with its field.key', () => {
		const next = fieldsReducer( fields, renameField( 'rooms', 'area' ) );

		Object.keys( next ).forEach( ( key ) => {
			expect( next[ key ].key ).toBe( key );
		} );
	} );

	it( 'is a no-op when the new key is the same as the old one', () => {
		expect( fieldsReducer( fields, renameField( 'rooms', 'rooms' ) ) ).toBe( fields );
	} );

	it( 'ignores a rename for a field that is not there', () => {
		expect( fieldsReducer( fields, renameField( 'ghost', 'area' ) ) ).toBe( fields );
	} );

	it( 'ignores a rename whose source key is reached only through the prototype chain', () => {
		// Kills: a source-key guard written as `fields[ action.oldKey ]`
		// (or `in`) instead of `hasOwnProperty`, which would treat
		// 'constructor' as an existing field — it is only inherited from
		// Object.prototype — and rename the inherited function itself.
		expect( fieldsReducer( fields, renameField( 'constructor', 'area' ) ) ).toBe( fields );
	} );

	it( 'refuses to rename onto "constructor", because it is a reserved key', () => {
		// Design ruling (fix round 2, Finding 2): the reducer must refuse
		// to create any key the project's own key rules forbid, reserved
		// keys included, regardless of whether that key happens to be
		// "taken" in the hasOwnProperty sense. This supersedes fix round
		// 1's expectation that this particular rename was allowed.
		expect( fieldsReducer( fields, renameField( 'rooms', 'constructor' ) ) ).toBe( fields );
	} );

	it( 'refuses to rename onto "__proto__", so a plain assignment can never poison the prototype', () => {
		// This is the exact hole Finding 2 describes: `next[ newKey ] = …`
		// with `newKey === '__proto__'` is a setter call, not an own-property
		// assignment, so without the guard this would delete "rooms" and
		// replace the object's own prototype instead of creating a field.
		const next = fieldsReducer( fields, renameField( 'rooms', '__proto__' ) );

		expect( next ).toBe( fields );
		expect( Object.prototype.hasOwnProperty.call( next, 'rooms' ) ).toBe( true );
		expect( Object.prototype.hasOwnProperty.call( next, '__proto__' ) ).toBe( false );
		expect( Object.getPrototypeOf( next ) ).toBe( Object.prototype );
	} );

	it( 'refuses to rename onto a malformed key, like one with an uppercase letter', () => {
		expect( fieldsReducer( fields, renameField( 'rooms', 'Rooms' ) ) ).toBe( fields );
	} );

	it( 'does not mutate what it was given', () => {
		const before = JSON.stringify( fields );

		fieldsReducer( fields, renameField( 'rooms', 'area' ) );

		expect( JSON.stringify( fields ) ).toBe( before );
	} );
} );
