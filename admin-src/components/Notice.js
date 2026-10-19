import { __ } from '@wordpress/i18n';

/**
 * `live={ false }`: ekran öz tək canlı sahəsi ilə elan edirsə (Entries), bildiriş
 * ikinci canlı sahə olmamalıdır — mesaj görünür, amma `role` daşımır.
 */
export default function Notice( { status = 'info', children, onDismiss, live = true } ) {
	const isError = status === 'error';
	let role;

	if ( live ) {
		role = isError ? 'alert' : 'status';
	}

	return (
		<div className={ `quoteform_notice quoteform_notice--${ status }` } role={ role }>
			<div className="quoteform_notice__body">{ children }</div>
			{ onDismiss && (
				<button
					type="button"
					className="quoteform_notice__dismiss"
					onClick={ onDismiss }
					aria-label={ __( 'Dismiss this notice', 'quoteform' ) }
				>
					{ '×' }
				</button>
			) }
		</div>
	);
}
