import { useState } from '@wordpress/element';

import EditorScreen from './screens/EditorScreen';
import FormListScreen from './screens/FormListScreen';
import { StoreProvider } from './state/StoreContext';

const FORM_ID = /^[1-9]\d{0,14}$/;

/**
 * Entries ekranındakı forma linki `?page=quoteform&form=ID`-dir: builder birbaşa
 * həmin formanın redaktorunda açılır.
 */
function formIdFromAddress() {
	const raw = new URLSearchParams( window.location.search ).get( 'form' );

	return raw !== null && FORM_ID.test( raw ) ? Number( raw ) : null;
}

function forgetFormInAddress() {
	const url = new URL( window.location.href );

	if ( url.searchParams.has( 'form' ) ) {
		url.searchParams.delete( 'form' );
		window.history.replaceState( window.history.state, '', `${ url.pathname }${ url.search }${ url.hash }` );
	}
}

export default function App() {
	const [ editingId, setEditingId ] = useState( formIdFromAddress );
	const [ navigated, setNavigated ] = useState( false );

	function open( id ) {
		setNavigated( true );
		setEditingId( id );
	}

	function close() {
		setNavigated( true );
		setEditingId( null );
		// Yeniləmə (F5) redaktoru təkrar açmasın.
		forgetFormInAddress();
	}

	return (
		<div className="quoteform_builder">
			<StoreProvider>
				{ editingId === null ? (
					<FormListScreen onOpen={ open } focusOnMount={ navigated } />
				) : (
					<EditorScreen formId={ editingId } onClose={ close } focusOnMount={ navigated } />
				) }
			</StoreProvider>
		</div>
	);
}
