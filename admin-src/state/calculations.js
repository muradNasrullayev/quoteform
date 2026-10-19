import { __ } from '@wordpress/i18n';

import { uniqueKey } from '../lib/keys';
import { moveDown, moveUp } from '../lib/reorder';
import {
	ADD_CALCULATION,
	MOVE_CALCULATION,
	REMOVE_CALCULATION,
	UPDATE_CALCULATION,
} from './actions';

export function defaultCalculation( key ) {
	return { key, expression: '0', label: __( 'New calculation', 'quoteform' ), visible: false };
}

export function calculationsReducer( calculations, action ) {
	switch ( action.type ) {
		case ADD_CALCULATION: {
			const key = uniqueKey( 'calculation', calculations.map( ( c ) => c.key ) );

			return [ ...calculations, defaultCalculation( key ) ];
		}

		case UPDATE_CALCULATION: {
			if ( ! calculations[ action.index ] ) {
				return calculations;
			}

			return calculations.map( ( calculation, index ) =>
				index === action.index ? { ...calculation, ...action.patch } : calculation
			);
		}

		case REMOVE_CALCULATION: {
			if ( ! calculations[ action.index ] ) {
				return calculations;
			}

			return calculations.filter( ( _, index ) => index !== action.index );
		}

		case MOVE_CALCULATION: {
			if ( action.direction === 'up' ) {
				return moveUp( calculations, action.index );
			}

			if ( action.direction === 'down' ) {
				return moveDown( calculations, action.index );
			}

			return calculations;
		}

		default:
			return calculations;
	}
}
