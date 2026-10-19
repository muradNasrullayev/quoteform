export const KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

const MAX_KEY_LENGTH = 64;

/**
 * `includes/Forms/KeyRules.php`-dəki siyahının EYNİSİ — iki ad, beş yox.
 * Açar formatı yalnız kiçik hərfə icazə verir, JavaScript-də üzv müraciəti
 * isə böyük-kiçik hərfə həssasdır, ona görə `hasownproperty` heç vaxt
 * `hasOwnProperty`-ni kölgələyə bilməz.
 */
export const RESERVED_KEYS = [ 'constructor', 'prototype' ];

export function isValidKey( key ) {
	return typeof key === 'string' && KEY_PATTERN.test( key );
}

export function isReservedKey( key ) {
	return RESERVED_KEYS.includes( key );
}

export function slugify( label ) {
	const slug = String( label === null || label === undefined ? '' : label )
		.toLowerCase()
		.replace( /[^a-z0-9]+/g, '_' )
		.replace( /^[^a-z]+/, '' )
		.replace( /_+$/, '' )
		.slice( 0, MAX_KEY_LENGTH );

	return isValidKey( slug ) ? slug : 'field';
}

export function uniqueKey( base, taken ) {
	const used = new Set( taken );
	const isFree = ( candidate ) => ! used.has( candidate ) && ! isReservedKey( candidate );

	if ( isFree( base ) ) {
		return base;
	}

	for ( let suffix = 2; suffix < 1000; suffix += 1 ) {
		const tail = `_${ suffix }`;
		const trimmed = base.slice( 0, MAX_KEY_LENGTH - tail.length );
		const candidate = `${ trimmed }${ tail }`;

		if ( isFree( candidate ) ) {
			return candidate;
		}
	}

	return `field_${ Date.now() }`.slice( 0, MAX_KEY_LENGTH );
}
