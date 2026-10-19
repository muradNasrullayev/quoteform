import { _n, sprintf } from '@wordpress/i18n';

export function formatCount( count ) {
	try {
		return new Intl.NumberFormat( document.documentElement.lang || undefined ).format( count );
	} catch ( error ) {
		// Tanınmayan `lang` teqi (`RangeError`).
		return String( count );
	}
}

/**
 * Menyudakı nişanı (PHP `EntriesPage::badge()` markup-ı) yeni say ilə yeniləyir.
 * `count-0` sinfini WordPress nüvəsinin CSS-i gizlədir.
 */
export function updateMenuBadge( count, root = document ) {
	const value = Number.isInteger( count ) && count > 0 ? count : 0;

	root.querySelectorAll( '.quoteform_unread-badge' ).forEach( ( badge ) => {
		badge.className = `awaiting-mod quoteform_unread-badge count-${ value }`;

		const number = badge.querySelector( '.pending-count' );
		const text = badge.querySelector( '.screen-reader-text' );

		if ( number ) {
			number.textContent = formatCount( value );
		}

		if ( text ) {
			text.textContent = sprintf(
				/* translators: %s: number of unread entries. */
				_n( '%s unread entry', '%s unread entries', value, 'quoteform' ),
				formatCount( value )
			);
		}
	} );
}
