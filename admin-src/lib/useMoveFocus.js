import { useEffect, useRef } from '@wordpress/element';

/**
 * Sətirlər indeksə görə açarlandıqda, köçürmədən sonra həmin mövqedəki DOM
 * düyməsi ARTIQ başqa əşyanı təmsil edir — fokus əşya ilə yox, mövqe ilə
 * qalar. Bu hook fokusu commit-dən sonra əşyanın YENİ mövqeyindəki düyməyə
 * aparır; həmin düymə sıranın ucunda `disabled` olubsa, qonşusuna.
 */
export function useMoveFocus() {
	const buttons = useRef( {} );
	const pending = useRef( null );

	useEffect( () => {
		const target = pending.current;

		if ( target === null ) {
			return;
		}

		pending.current = null;

		const row = buttons.current[ target.index ] || {};
		const wanted = row[ target.direction ];
		const sibling = row[ target.direction === 'up' ? 'down' : 'up' ];

		( wanted && ! wanted.disabled ? wanted : sibling )?.focus();
	} );

	function follow( index, direction ) {
		pending.current = { index: direction === 'up' ? index - 1 : index + 1, direction };
	}

	function refsFor( index ) {
		return {
			upButtonRef: ( node ) => {
				buttons.current[ index ] = { ...buttons.current[ index ], up: node };
			},
			downButtonRef: ( node ) => {
				buttons.current[ index ] = { ...buttons.current[ index ], down: node };
			},
		};
	}

	return { follow, refsFor };
}
