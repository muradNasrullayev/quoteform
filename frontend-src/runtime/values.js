import { NUMERIC_STRING } from '../engine/values';

const PRICE_BEARING_TYPES = [ 'select', 'radio', 'checkbox' ];
const NUMERIC_TYPES = [ 'number', 'slider' ];
const MULTI_TYPES = [ 'checkbox' ];

function optionPrice( field, value ) {
	const options = Array.isArray( field.options ) ? field.options : [];
	const match = options.find( ( option ) => option.value === value );

	return match && typeof match.price === 'number' ? match.price : 0;
}

function emptyFor( field ) {
	return MULTI_TYPES.indexOf( field.type ) !== -1 ? [] : '';
}

export function normaliseValue( field, raw ) {
	if ( MULTI_TYPES.indexOf( field.type ) !== -1 ) {
		return Array.isArray( raw ) ? raw.slice() : [];
	}

	if ( field.type === 'toggle' ) {
		return raw === true || raw === 1 || raw === '1' ? 1 : 0;
	}

	if ( raw === undefined || raw === null || raw === '' ) {
		return '';
	}

	if ( NUMERIC_TYPES.indexOf( field.type ) !== -1 ) {
		return NUMERIC_STRING.test( String( raw ) ) ? Number( raw ) : '';
	}

	return String( raw );
}

function rawValue( field, state ) {
	return normaliseValue( field, state[ field.key ] );
}

// Bir sahənin öz qiyməti kolleksiya semantikası daşıyır (checkbox → seçilmiş
// variantların massivi), amma bir şərtin həmin sahə haqqında dediyi qiymət hər zaman
// TƏK bir elementdir — üzvlük üçün adlandırılan bir variant, massivin özü yox.
// Ona görə normaliseValue()-nin MULTI_TYPES budağı (artıq massiv olduğunu güman edir)
// burda yerinə düşmür: builder şərt qiymətini həmişə sadə TextControl vasitəsilə,
// sətir kimi saxlayır, `Array.isArray( raw )` isə false qaytarıb boş massiv verir və
// site owner-in yazdığı qiymət səssizcə itir. String() seçimi FieldValidator-un
// variant qiymətlərini serverdə boş olmayan sətir kimi doğrulaması ilə uyğundur.
export function normaliseConditionValue( field, raw ) {
	if ( MULTI_TYPES.indexOf( field.type ) !== -1 ) {
		return String( raw );
	}

	return normaliseValue( field, raw );
}

export function variablesFor( schema, state, visibleFields ) {
	const fields = schema.fields || {};
	const variables = {};

	Object.keys( fields ).forEach( ( key ) => {
		const field = fields[ key ];
		const visible = visibleFields.has( key );
		const value = visible ? rawValue( field, state ) : emptyFor( field );

		variables[ key ] = value;

		if ( PRICE_BEARING_TYPES.indexOf( field.type ) === -1 ) {
			return;
		}

		if ( MULTI_TYPES.indexOf( field.type ) !== -1 ) {
			variables[ `${ key }.price` ] = value.reduce(
				( total, selected ) => total + optionPrice( field, selected ),
				0
			);

			return;
		}

		variables[ `${ key }.price` ] = value === '' ? 0 : optionPrice( field, value );
	} );

	return variables;
}
