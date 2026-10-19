import { __ } from '@wordpress/i18n';

const RELOAD_CODES = [ 'rest_forbidden', 'rest_cookie_invalid_nonce', 'rest_forbidden_context' ];

export function needsReload( error ) {
	return !! error && RELOAD_CODES.includes( error.code );
}

export function errorMessage( error ) {
	const fallback = __( 'Something went wrong. Please try again.', 'quoteform' );

	if ( ! error ) {
		return fallback;
	}

	if ( needsReload( error ) ) {
		return __(
			'You are no longer allowed to manage forms. Reload the page and sign in again.',
			'quoteform'
		);
	}

	if ( error.code === 'rest_trash_not_supported' ) {
		return __(
			'This site has the trash switched off, so deleting a form would be permanent. Quoteform will not do that.',
			'quoteform'
		);
	}

	if ( error.code === 'qform_update_failed' ) {
		return __( 'The form was not saved. Your changes are still here — try again.', 'quoteform' );
	}

	if ( error.code === 'qform_form_not_found' ) {
		return __( 'That form no longer exists. It may have been moved to the trash.', 'quoteform' );
	}

	return error.message || fallback;
}
