import { __ } from '@wordpress/i18n';

export function createSubmitUi( { label } ) {
	const button = document.createElement( 'button' );

	button.type = 'button';
	button.className = 'quoteform_nav_button quoteform_submit';
	button.setAttribute( 'data-quoteform-submit', '' );
	button.textContent = label || __( 'Send', 'quoteform' );

	// Zolaq canlı sahə DEYİL (role yoxdur): formada tək canlı sahə qaydası var
	// (tests/js/frontend/a11y.test.js — iki sahə bir-birini kəsir). Mesaj
	// form.js-də mövcud announcer vasitəsilə elan olunur.
	const banner = document.createElement( 'p' );

	banner.className = 'quoteform_submit_error';
	banner.hidden = true;

	return {
		button,
		banner,
		setBusy( busy ) {
			button.disabled = busy;

			if ( busy ) {
				button.setAttribute( 'aria-busy', 'true' );
			} else {
				button.removeAttribute( 'aria-busy' );
			}
		},
		showError( message ) {
			banner.hidden = ! message;
			banner.textContent = message || '';
		},
	};
}

// Honeypot: insan onu görmür (ekrandan kənar — `display:none` botlara tanışdır),
// klaviatura ona çatmır, ekran oxuyucu onu oxumur. Doldurulubsa, server
// göndərişi spam sayır.
export function buildHoneypot( namespace ) {
	const wrapper = document.createElement( 'div' );

	wrapper.className = 'quoteform_hp';
	wrapper.setAttribute( 'aria-hidden', 'true' );

	const label = document.createElement( 'label' );

	label.htmlFor = `${ namespace }_website`;
	label.textContent = __( 'Website', 'quoteform' );

	const input = document.createElement( 'input' );

	input.type = 'text';
	input.id = `${ namespace }_website`;
	input.name = 'website';
	input.tabIndex = -1;
	input.setAttribute( 'autocomplete', 'off' );

	wrapper.appendChild( label );
	wrapper.appendChild( input );

	return { element: wrapper, input };
}

// Mesaj mətn kimi göstərilir (textContent): sayt sahibinin yazdığı mətn HTML
// kimi yorumlanmır. Qiymət SERVERİN hesabladığıdır.
export function buildSuccessPanel( body ) {
	const panel = document.createElement( 'div' );

	panel.className = 'quoteform_success';
	panel.setAttribute( 'tabindex', '-1' );
	panel.setAttribute( 'data-quoteform-success', '' );

	const message = document.createElement( 'p' );

	message.className = 'quoteform_success_message';
	message.textContent = body.message || __( 'Thank you. Your request has been sent.', 'quoteform' );
	panel.appendChild( message );

	if ( typeof body.total !== 'string' ) {
		return panel;
	}

	const list = document.createElement( 'ul' );

	list.className = 'quoteform_breakdown';

	( Array.isArray( body.breakdown ) ? body.breakdown : [] ).forEach( ( row ) => {
		const item = document.createElement( 'li' );
		const name = document.createElement( 'span' );
		const amount = document.createElement( 'span' );

		name.className = 'quoteform_breakdown_label';
		name.textContent = row.label;
		amount.className = 'quoteform_breakdown_amount';
		amount.textContent = row.formatted;
		item.appendChild( name );
		item.appendChild( amount );
		list.appendChild( item );
	} );

	const totalRow = document.createElement( 'div' );
	const totalLabel = document.createElement( 'span' );
	const total = document.createElement( 'span' );

	totalRow.className = 'quoteform_total_row';
	totalLabel.className = 'quoteform_total_label';
	totalLabel.textContent = __( 'Total', 'quoteform' );
	total.className = 'quoteform_total';
	total.textContent = body.total;
	totalRow.appendChild( totalLabel );
	totalRow.appendChild( total );

	panel.appendChild( list );
	panel.appendChild( totalRow );

	return panel;
}
