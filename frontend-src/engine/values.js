import { ExpressionError } from './errors';

// PHP Values::isNumericString() ilə EYNİ regex.
//
// PHP tərəfindəki regex `D` modifikatoru ilə bitir — bu YÜKDAŞIYICIDIR və "səliqəyə
// salınmamalıdır". PCRE-də `$` sətrin sonundan əvvəl gələn son sətirsonu simvolunun da
// qarşısında uyğunlaşır, JavaScript-in `$`-ı isə yox (bu regex burda artıq düzgün davranır).
// PHP-yə məhz buna görə `D` lazımdır: onsuz "5\n" PHP-də rəqəm sayılır, JS-də isə yox.
export const NUMERIC_STRING = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

const isNumericString = ( value ) => typeof value === 'string' && NUMERIC_STRING.test( value );

const typeOf = ( value ) => {
	if ( typeof value === 'boolean' ) {
		return 'boolean';
	}

	if ( typeof value === 'number' ) {
		return 'number';
	}

	if ( Array.isArray( value ) ) {
		return 'list';
	}

	return 'string';
};

export function toNumber( value, position = 0 ) {
	if ( value === null || value === undefined || value === '' ) {
		return 0;
	}

	if ( typeof value === 'boolean' ) {
		return value ? 1 : 0;
	}

	if ( typeof value === 'number' ) {
		assertFinite( value, position );

		return value;
	}

	if ( isNumericString( value ) ) {
		const parsed = parseFloat( value );

		assertFinite( parsed, position );

		return parsed;
	}

	throw new ExpressionError(
		'type_error',
		'This value cannot be used in a calculation.',
		position,
		{ value: Array.isArray( value ) ? 'list' : String( value ) }
	);
}

// Infinity/NaN iki mühərrikdə fərqli davranır — PHP-nin min()/max() `<` ilə müqayisə edir
// (NAN-a qarşı false), JS-in Math.min()/Math.max() isə NaN-poisoning-dir. Buna görə qeyri-sonlu
// ədədlər mənbədə, bu iki nöqtədə (toNumber və evaluateBinary) rədd edilir.
function assertFinite( value, position ) {
	if ( ! Number.isFinite( value ) ) {
		throw new ExpressionError( 'not_finite', 'This number is too large to use in a calculation.', position );
	}
}

export function toBool( value ) {
	if ( value === null || value === undefined || value === '' || value === false ) {
		return false;
	}

	if ( Array.isArray( value ) ) {
		return value.length > 0;
	}

	if ( typeof value === 'number' ) {
		return value !== 0;
	}

	return true;
}

export function isNumericLike( value ) {
	if ( value === null || value === undefined || value === '' || typeof value === 'boolean' ) {
		return true;
	}

	if ( typeof value === 'number' ) {
		return true;
	}

	return isNumericString( value );
}

export function equals( left, right ) {
	const a = left === null || left === undefined ? '' : left;
	const b = right === null || right === undefined ? '' : right;

	const typeA = typeOf( a );
	const typeB = typeOf( b );

	if ( typeA !== typeB ) {
		return false;
	}

	if ( typeA === 'list' ) {
		return a.length === b.length && a.every( ( item, index ) => item === b[ index ] );
	}

	return a === b;
}

export function compare( left, right, position = 0 ) {
	const a = left === null || left === undefined ? '' : left;
	const b = right === null || right === undefined ? '' : right;

	if ( isNumericLike( a ) && isNumericLike( b ) ) {
		const numberA = toNumber( a, position );
		const numberB = toNumber( b, position );

		if ( numberA === numberB ) {
			return 0;
		}

		return numberA < numberB ? -1 : 1;
	}

	if ( typeof a === 'string' && typeof b === 'string' ) {
		if ( a === b ) {
			return 0;
		}

		return a < b ? -1 : 1;
	}

	throw new ExpressionError( 'type_error', 'These two values cannot be compared with each other.', position );
}
