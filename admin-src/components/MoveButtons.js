import { useEffect, useRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

function attach( ref, node ) {
	if ( typeof ref === 'function' ) {
		ref( node );
	} else if ( ref && typeof ref === 'object' ) {
		ref.current = node;
	}
}

export default function MoveButtons( {
	label,
	onMoveUp,
	onMoveDown,
	canMoveUp,
	canMoveDown,
	upButtonRef = null,
	downButtonRef = null,
} ) {
	const upRef = useRef( null );
	const downRef = useRef( null );
	const movedRef = useRef( null );

	// Sona çatan sətirdə basılan düymə həmin render-də `disabled` olur,
	// brauzer isə disabled elementi fokusda saxlamır — fokus `<body>`-yə
	// düşür. Ona görə basılan düymə sıradan çıxıbsa, qonşusuna keçirilir.
	useEffect( () => {
		const moved = movedRef.current;

		if ( moved === null ) {
			return;
		}

		movedRef.current = null;

		const pressed = moved === 'up' ? upRef.current : downRef.current;
		const sibling = moved === 'up' ? downRef.current : upRef.current;

		if ( pressed && pressed.disabled ) {
			sibling?.focus();
		}
	} );

	return (
		<span className="quoteform_move">
			<button
				type="button"
				ref={ ( node ) => {
					upRef.current = node;
					attach( upButtonRef, node );
				} }
				onClick={ () => {
					movedRef.current = 'up';
					onMoveUp();
				} }
				disabled={ ! canMoveUp }
				aria-label={ sprintf(
					/* translators: %s: the name of the item being moved. */
					__( 'Move %s up', 'quoteform' ),
					label
				) }
			>
				{ '↑' }
			</button>
			<button
				type="button"
				ref={ ( node ) => {
					downRef.current = node;
					attach( downButtonRef, node );
				} }
				onClick={ () => {
					movedRef.current = 'down';
					onMoveDown();
				} }
				disabled={ ! canMoveDown }
				aria-label={ sprintf(
					/* translators: %s: the name of the item being moved. */
					__( 'Move %s down', 'quoteform' ),
					label
				) }
			>
				{ '↓' }
			</button>
		</span>
	);
}
