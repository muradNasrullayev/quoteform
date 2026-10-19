import { __ } from '@wordpress/i18n';

import { uniqueKey } from '../lib/keys';
import { moveDown, moveUp } from '../lib/reorder';
import {
	ADD_STEP,
	ASSIGN_FIELD,
	MOVE_STEP,
	REMOVE_STEP,
	UNASSIGN_FIELD,
	UPDATE_STEP,
} from './actions';

export function defaultStep( key, title ) {
	return { key, title, description: '', fields: [] };
}

function withoutField( steps, fieldKey ) {
	let changed = false;

	const next = steps.map( ( step ) => {
		if ( ! step.fields.includes( fieldKey ) ) {
			return step;
		}

		changed = true;

		return { ...step, fields: step.fields.filter( ( key ) => key !== fieldKey ) };
	} );

	return changed ? next : steps;
}

export function stepsReducer( steps, action ) {
	switch ( action.type ) {
		case ADD_STEP: {
			const key = uniqueKey( 'step', steps.map( ( step ) => step.key ) );

			return [ ...steps, defaultStep( key, __( 'New step', 'quoteform' ) ) ];
		}

		case UPDATE_STEP: {
			if ( ! steps[ action.index ] ) {
				return steps;
			}

			return steps.map( ( step, index ) =>
				index === action.index ? { ...step, ...action.patch } : step
			);
		}

		case REMOVE_STEP: {
			if ( ! steps[ action.index ] ) {
				return steps;
			}

			return steps.filter( ( _, index ) => index !== action.index );
		}

		case MOVE_STEP: {
			if ( action.direction === 'up' ) {
				return moveUp( steps, action.index );
			}

			if ( action.direction === 'down' ) {
				return moveDown( steps, action.index );
			}

			return steps;
		}

		case ASSIGN_FIELD: {
			const target = steps[ action.stepIndex ];

			if ( ! target ) {
				return steps;
			}

			const elsewhere = steps.some(
				( step, index ) => index !== action.stepIndex && step.fields.includes( action.fieldKey )
			);

			if ( target.fields.includes( action.fieldKey ) && ! elsewhere ) {
				return steps;
			}

			const cleared = withoutField( steps, action.fieldKey );

			return cleared.map( ( step, index ) =>
				index === action.stepIndex
					? { ...step, fields: [ ...step.fields, action.fieldKey ] }
					: step
			);
		}

		case UNASSIGN_FIELD:
			return withoutField( steps, action.fieldKey );

		default:
			return steps;
	}
}
