import { useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import Button from './Button';

const CLEAR_AFTER_MS = 1500;

function copyHint() {
	const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test( navigator.platform || '' );

	return mac ? __( 'Press ⌘C to copy.', 'quoteform' ) : __( 'Press Ctrl+C to copy.', 'quoteform' );
}

/**
 * Clipboard API yalnız təhlükəsiz kontekstdə (HTTPS, localhost) var. HTTP
 * saytda və ya icazə rədd ediləndə mətn seçilir və istifadəçiyə qısayol
 * deyilir — "Copied." heç vaxt yalandan deyilmir.
 *
 * `buttonLabel` düymənin tam əlçatan adıdır və çağıran onu öz tərcümə
 * sətrindən qurur — etiketin hərf registrini burada dəyişmək (məs. alman
 * dilində) yanlış olardı.
 */
export default function CopyField( { id, value, label, buttonLabel } ) {
	const inputRef = useRef( null );
	const [ message, setMessage ] = useState( '' );

	useEffect( () => {
		if ( message === '' ) {
			return undefined;
		}

		const timer = setTimeout( () => setMessage( '' ), CLEAR_AFTER_MS );

		return () => clearTimeout( timer );
	}, [ message ] );

	function selectAll() {
		inputRef.current?.focus();
		inputRef.current?.select();
	}

	async function handleCopy() {
		const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;

		if ( clipboard && typeof clipboard.writeText === 'function' ) {
			try {
				await clipboard.writeText( value );
				setMessage( __( 'Copied.', 'quoteform' ) );

				return;
			} catch ( error ) {
				// İcazə yoxdur — aşağıdakı əl ilə yola düş.
			}
		}

		selectAll();
		setMessage( copyHint() );
	}

	return (
		<div className="quoteform_copy">
			<label htmlFor={ id } className="screen-reader-text" data-quoteform-hidden-label="">
				{ label }
			</label>
			<input
				id={ id }
				ref={ inputRef }
				type="text"
				className="quoteform_copy__value"
				value={ value }
				readOnly
				onFocus={ ( event ) => event.target.select() }
			/>
			<Button
				variant="ghost"
				onClick={ handleCopy }
				aria-label={ buttonLabel }
			>
				{ __( 'Copy', 'quoteform' ) }
			</Button>
			<span className="quoteform_copy__status" role="status">
				{ message }
			</span>
		</div>
	);
}
