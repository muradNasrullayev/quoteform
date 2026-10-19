import { useEffect, useRef } from '@wordpress/element';

import Button from './Button';

export default function RemoveConfirm( { message, confirmLabel, cancelLabel, onConfirm, onCancel } ) {
	const confirmButtonRef = useRef( null );

	useEffect( () => {
		confirmButtonRef.current?.focus();
	}, [] );

	return (
		<span className="quoteform_confirm">
			<span>{ message }</span>
			<Button variant="danger" ref={ confirmButtonRef } onClick={ onConfirm }>
				{ confirmLabel }
			</Button>
			<Button onClick={ onCancel }>{ cancelLabel }</Button>
		</span>
	);
}
