import { __, sprintf } from '@wordpress/i18n';

export function displayName( label, key ) {
	const text = typeof label === 'string' ? label.trim() : '';

	if ( text === '' ) {
		return String( key );
	}

	return sprintf(
		/* translators: 1: the label a user typed. 2: the stable key it is stored under. */
		__( '%1$s (%2$s)', 'quoteform' ),
		text,
		key
	);
}
