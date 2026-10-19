import { __ } from '@wordpress/i18n';

import { errorMessage, needsReload } from '../lib/apiErrors';

export function isNotFound( error ) {
	return !! error && error.code === 'qform_entry_not_found';
}

export function entryErrorMessage( error ) {
	if ( needsReload( error ) ) {
		return __( 'You are no longer allowed to see entries. Reload the page and sign in again.', 'quoteform' );
	}

	if ( error && error.code === 'qform_list_changed' ) {
		return __( 'The list changed. Review it and try again.', 'quoteform' );
	}

	if ( isNotFound( error ) ) {
		return __( 'That entry no longer exists.', 'quoteform' );
	}

	return errorMessage( error );
}
