import { __ } from '@wordpress/i18n';

import {
	ADD_CONDITION,
	ADD_RULE,
	REMOVE_CONDITION,
	REMOVE_RULE,
	UPDATE_CONDITION,
	UPDATE_RULE,
} from './actions';

export const ACTIONS = [ 'show', 'hide', 'require', 'optional' ];
export const FIELD_ONLY_ACTIONS = [ 'require', 'optional' ];
export const OPERATORS = [
	'equals',
	'not_equals',
	'greater',
	'greater_or_equal',
	'less',
	'less_or_equal',
	'contains',
	'not_contains',
	'is_empty',
	'is_not_empty',
];
export const VALUELESS_OPERATORS = [ 'is_empty', 'is_not_empty' ];

export const ACTION_LABELS = {
	show: __( 'Show', 'quoteform' ),
	hide: __( 'Hide', 'quoteform' ),
	require: __( 'Make required', 'quoteform' ),
	optional: __( 'Make optional', 'quoteform' ),
};

export const OPERATOR_LABELS = {
	equals: __( 'is equal to', 'quoteform' ),
	not_equals: __( 'is not equal to', 'quoteform' ),
	greater: __( 'is greater than', 'quoteform' ),
	greater_or_equal: __( 'is greater than or equal to', 'quoteform' ),
	less: __( 'is less than', 'quoteform' ),
	less_or_equal: __( 'is less than or equal to', 'quoteform' ),
	contains: __( 'contains', 'quoteform' ),
	not_contains: __( 'does not contain', 'quoteform' ),
	is_empty: __( 'is empty', 'quoteform' ),
	is_not_empty: __( 'is not empty', 'quoteform' ),
};

export function defaultCondition() {
	return { field: '', operator: 'equals', value: '' };
}

export function defaultRule() {
	return {
		target: { kind: 'field', key: '' },
		action: 'show',
		match: 'all',
		conditions: [ defaultCondition() ],
	};
}

function applyRulePatch( rule, patch ) {
	const next = { ...rule, ...patch };

	// Addımı "məcburi" etmək mənasızdır — hədəf addıma çevriləndə
	// yalnız sahəyə aid əməl düzəldilir, sükutla `invalid_option`
	// gözləmək əvəzinə.
	if ( next.target.kind === 'step' && FIELD_ONLY_ACTIONS.includes( next.action ) ) {
		next.action = 'show';
	}

	return next;
}

function applyConditionPatch( condition, patch ) {
	const next = { ...condition, ...patch };

	if ( VALUELESS_OPERATORS.includes( next.operator ) ) {
		delete next.value;
	} else if ( ! ( 'value' in next ) ) {
		next.value = '';
	}

	return next;
}

export function rulesReducer( rules, action ) {
	switch ( action.type ) {
		case ADD_RULE:
			return [ ...rules, defaultRule() ];

		case REMOVE_RULE:
			return rules[ action.index ] ? rules.filter( ( _, i ) => i !== action.index ) : rules;

		case UPDATE_RULE:
			return rules[ action.index ]
				? rules.map( ( rule, i ) => ( i === action.index ? applyRulePatch( rule, action.patch ) : rule ) )
				: rules;

		case ADD_CONDITION:
			return rules[ action.ruleIndex ]
				? rules.map( ( rule, i ) =>
						i === action.ruleIndex
							? { ...rule, conditions: [ ...rule.conditions, defaultCondition() ] }
							: rule
				  )
				: rules;

		case REMOVE_CONDITION: {
			const rule = rules[ action.ruleIndex ];

			if ( ! rule || ! rule.conditions[ action.conditionIndex ] || rule.conditions.length === 1 ) {
				return rules;
			}

			return rules.map( ( item, i ) =>
				i === action.ruleIndex
					? { ...item, conditions: item.conditions.filter( ( _, j ) => j !== action.conditionIndex ) }
					: item
			);
		}

		case UPDATE_CONDITION: {
			const rule = rules[ action.ruleIndex ];

			if ( ! rule || ! rule.conditions[ action.conditionIndex ] ) {
				return rules;
			}

			return rules.map( ( item, i ) =>
				i === action.ruleIndex
					? {
							...item,
							conditions: item.conditions.map( ( condition, j ) =>
								j === action.conditionIndex
									? applyConditionPatch( condition, action.patch )
									: condition
							),
					  }
					: item
			);
		}

		default:
			return rules;
	}
}
