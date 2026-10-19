import { createRoot } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import App from './App';
import './style.scss';

function renderUnsupportedNotice( root ) {
	const notice = document.createElement( 'div' );
	const message = document.createElement( 'p' );

	notice.className = 'notice notice-error';
	message.textContent = __(
		'Quoteform needs WordPress 6.2 or newer. This site runs an older version, so the form builder cannot start. Please update WordPress and reload this page.',
		'quoteform'
	);

	notice.appendChild( message );
	root.appendChild( notice );
}

const root = document.getElementById( 'quoteform-root' );

if ( root ) {
	if ( typeof createRoot === 'function' ) {
		createRoot( root ).render( <App /> );
	} else {
		renderUnsupportedNotice( root );
	}
}
