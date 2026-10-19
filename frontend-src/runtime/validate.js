import { __, sprintf } from '@wordpress/i18n';

import { visibleSteps } from './steps';
import { normaliseValue } from './values';

const SILENT_TYPES = [ 'hidden', 'html' ];
const NUMERIC_TYPES = [ 'number', 'slider' ];

// JavaScript-in `\s` sinfi, açıq yazılmış halda. Açıq yazılır ki, PHP
// (includes/Runtime/Validator.php) EYNİ dəsti istifadə edə bilsin — PCRE-nin
// `\s`-i bu dəstlə üst-üstə düşmür (NBSP, U+FEFF), yəni gizli divergensiya olardı.
const WHITESPACE = '\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff';

export const EMAIL_PATTERN = new RegExp( `^[^@${ WHITESPACE }]+@[^@${ WHITESPACE }]+$` );

const isTicked = ( value ) => value === true || value === 1 || value === '1';

// Rəqəm sahəsində boşluq NORMALLAŞDIRILMIŞ dəyərlə ölçülür: " 5" və "5\n"
// rəqəm deyil, yəni cavab da deyil. UI bu dəyərləri yaratmır; qayda PHP
// tərəfi ilə (Runtime\Validator) eyni nəticə üçündür.
function isBlank( field, value ) {
	if ( field.type === 'toggle' ) {
		return ! isTicked( value );
	}

	if ( Array.isArray( value ) ) {
		return value.length === 0;
	}

	if ( NUMERIC_TYPES.indexOf( field.type ) !== -1 ) {
		return normaliseValue( field, value ) === '';
	}

	return value === undefined || value === null || value === '';
}

export function fieldErrorCode( field, value, required ) {
	if ( isBlank( field, value ) ) {
		return required ? 'required' : null;
	}

	if ( field.type === 'email' && ! EMAIL_PATTERN.test( String( value ) ) ) {
		return 'email';
	}

	if ( NUMERIC_TYPES.indexOf( field.type ) !== -1 ) {
		const numeric = normaliseValue( field, value );

		if ( typeof field.min === 'number' && numeric < field.min ) {
			return 'min';
		}

		if ( typeof field.max === 'number' && numeric > field.max ) {
			return 'max';
		}
	}

	return null;
}

export function validateFields( schema, keys, state, visibility ) {
	const fields = schema.fields || {};
	const errors = {};

	keys.forEach( ( key ) => {
		const field = fields[ key ];

		if ( ! field || ! visibility.fields.has( key ) || SILENT_TYPES.indexOf( field.type ) !== -1 ) {
			return;
		}

		const code = fieldErrorCode( field, state[ key ], visibility.required.has( key ) );

		if ( code !== null ) {
			errors[ key ] = code;
		}
	} );

	return errors;
}

export function validateVisible( schema, state, visibility ) {
	const keys = [];

	visibleSteps( schema, visibility ).forEach( ( step ) => {
		( step.fields || [] ).forEach( ( key ) => keys.push( key ) );
	} );

	return validateFields( schema, keys, state, visibility );
}

export function errorMessage( code, field ) {
	if ( code === 'required' ) {
		return __( 'This field is required.', 'quoteform' );
	}

	if ( code === 'email' ) {
		return __( 'Enter an email address.', 'quoteform' );
	}

	if ( code === 'min' ) {
		return sprintf(
			/* translators: %s: the smallest allowed number. */
			__( 'Enter %s or more.', 'quoteform' ),
			field.min
		);
	}

	return sprintf(
		/* translators: %s: the largest allowed number. */
		__( 'Enter %s or less.', 'quoteform' ),
		field.max
	);
}

export function validateStep( schema, step, state, visibility ) {
	const codes = validateFields( schema, step.fields || [], state, visibility );
	const errors = {};

	Object.keys( codes ).forEach( ( key ) => {
		errors[ key ] = errorMessage( codes[ key ], schema.fields[ key ] );
	} );

	return errors;
}
