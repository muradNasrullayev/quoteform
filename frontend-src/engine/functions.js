import { ExpressionError } from './errors';
import { equals, toNumber } from './values';

// PHP Functions::SIGNATURES ilə eyni: [minimum, maksimum və ya null].
const SIGNATURES = {
	min: [ 1, null ],
	max: [ 1, null ],
	sum: [ 0, null ],
	round: [ 1, 2 ],
	ceil: [ 1, 1 ],
	floor: [ 1, 1 ],
	abs: [ 1, 1 ],
	contains: [ 2, 2 ],
	is_empty: [ 1, 1 ],
};

export function hasFunction( name ) {
	return Object.prototype.hasOwnProperty.call( SIGNATURES, name );
}

// Yuvarlaqlaşdırma dəqiqliyinin icazə verilən həddi. Pul hesablamaları üçün 6 onluq
// onsuz da hədsizdir, və bu hədd epsilon-un böyük miqyaslarda nəticəni korlamasının
// qarşısını alır. PHP Functions::MAX_PRECISION ilə eyni.
const MAX_PRECISION = 6;

/**
 * Yuvarlaqlaşdırma dəqiqliyini təhlükəsiz tam ədədə çevirir.
 *
 * Ardıcıllıq PARİTET ÜÇÜN YÜK DAŞIYIR: əvvəlcə sıfıra doğru kəsir, sonra həddi yoxlayır.
 * PHP tərəfi yoxlamanı (int) çevrilməsindən ƏVVƏL aparmalıdır, çünki PHP-nin float→int
 * çevrilməsi həddi aşan dəyərlər üçün 0 qaytarır — bax includes/Engine/Functions.php toPrecision().
 */
function toPrecision( value, position = 0 ) {
	const truncated = Math.trunc( value );

	if ( truncated < -MAX_PRECISION || truncated > MAX_PRECISION ) {
		throw new ExpressionError(
			'invalid_precision',
			`Rounding precision must be between -${ MAX_PRECISION } and ${ MAX_PRECISION }.`,
			position,
			{ precision: truncated, max: MAX_PRECISION }
		);
	}

	return truncated;
}

/**
 * Yarını sıfırdan uzağa yuvarlaqlaşdırır.
 *
 * PHP Functions::roundHalfAwayFromZero() ilə əməliyyat-əməliyyat eynidir.
 * Math.round() istifadə EDİLMİR: Math.round( -2.5 ) === -2, PHP round( -2.5 ) === -3.
 *
 * Epsilon QƏSDƏN 1e-15-dir (təxminən dörd ULP). Daha böyük qiymət — məsələn 1e-12 —
 * böyük miqyaslarda 0.5-i keçir və round( 999999.99, 6 ) kimi adi halları korlayır.
 */
export function roundHalfAwayFromZero( value, precision = 0 ) {
	if ( ! Number.isFinite( value ) ) {
		throw new ExpressionError( 'not_finite', 'Cannot round a value that is not a finite number.' );
	}

	if ( precision < -MAX_PRECISION || precision > MAX_PRECISION ) {
		throw new ExpressionError(
			'invalid_precision',
			`Rounding precision must be between -${ MAX_PRECISION } and ${ MAX_PRECISION }.`,
			0,
			{ precision, max: MAX_PRECISION }
		);
	}

	const factor = Math.pow( 10, precision );
	const scaled = value * factor;
	const absolute = Math.abs( scaled );
	const epsilon = absolute * 1e-15;
	const rounded = Math.floor( absolute + 0.5 + epsilon );
	const sign = value < 0 ? -1 : 1;

	return ( sign * rounded ) / factor;
}

function isEmptyValue( value ) {
	if ( value === null || value === undefined ) {
		return true;
	}

	if ( Array.isArray( value ) ) {
		return value.length === 0;
	}

	return value === '';
}

function containsValue( haystack, needle ) {
	if ( haystack === null || haystack === undefined ) {
		return false;
	}

	if ( Array.isArray( haystack ) ) {
		return haystack.some( ( item ) => equals( item, needle ) );
	}

	if ( typeof haystack !== 'string' ) {
		return false;
	}

	return typeof needle === 'string' && haystack.indexOf( needle ) !== -1;
}

export function callFunction( name, args, position = 0 ) {
	if ( ! hasFunction( name ) ) {
		throw new ExpressionError( 'unknown_function', `There is no function called "${ name }".`, position, { name } );
	}

	const [ minimum, maximum ] = SIGNATURES[ name ];
	const count = args.length;

	if ( count < minimum || ( maximum !== null && count > maximum ) ) {
		throw new ExpressionError(
			'wrong_argument_count',
			`"${ name }" was given ${ count } argument(s).`,
			position,
			{ name, given: count, min: minimum, max: maximum }
		);
	}

	switch ( name ) {
		case 'contains':
			return containsValue( args[ 0 ], args[ 1 ] );

		case 'is_empty':
			return isEmptyValue( args[ 0 ] );
	}

	const numbers = args.map( ( argument ) => toNumber( argument, position ) );

	switch ( name ) {
		case 'min':
			return Math.min( ...numbers );

		case 'max':
			return Math.max( ...numbers );

		case 'sum':
			return numbers.reduce( ( total, current ) => total + current, 0 );

		case 'round':
			return roundHalfAwayFromZero(
				numbers[ 0 ],
				numbers.length > 1 ? toPrecision( numbers[ 1 ], position ) : 0
			);

		case 'ceil':
			return Math.ceil( numbers[ 0 ] );

		case 'floor':
			return Math.floor( numbers[ 0 ] );

		case 'abs':
			return Math.abs( numbers[ 0 ] );

		default:
			throw new ExpressionError( 'unknown_function', `There is no function called "${ name }".`, position );
	}
}
